use axum::extract::{Extension, Path, Query};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::convert::Infallible;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tapo::ApiClient;
use tokio::sync::{Mutex, RwLock, broadcast};
use tokio_stream::StreamExt as _;
use tokio_stream::wrappers::BroadcastStream;

use crate::models;

pub type PowerHistory = Arc<Mutex<Vec<models::PowerHistoryEntry>>>;
pub type TapoDeviceCache = Arc<Mutex<Vec<(String, String)>>>; // (name, ip)
/// Per-device live snapshot, keyed by device name.
pub type LivePowerCache = Arc<RwLock<HashMap<String, models::TapoDeviceData>>>;
pub type ActiveClientTimer = Arc<AtomicU64>;
/// Broadcast channel — sends the full assembled snapshot to all SSE subscribers
/// whenever any device updates.
pub type PowerBroadcast = Arc<broadcast::Sender<models::TapoPowerResponse>>;

/// How often to poll when clients are actively requesting data.
const FAST_POLL_MS: u64 = 250;
/// How often to poll when no clients have requested recently.
const SLOW_POLL_SECS: u64 = 30;
/// A client request keeps fast-poll mode active for this many seconds.
const ACTIVE_WINDOW_SECS: u64 = 60;

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

const HISTORY_FILE: &str = "/var/lib/server-dash-api/power-history.json";
const MAX_HISTORY_DAYS: i64 = 60;

pub fn load_history() -> Vec<models::PowerHistoryEntry> {
    let path = std::path::Path::new(HISTORY_FILE);
    if !path.exists() {
        return vec![];
    }
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => vec![],
    }
}

fn get_local_subnet(subnet_override: Option<&str>) -> Option<String> {
    if let Some(s) = subnet_override {
        if !s.is_empty() {
            return Some(s.to_owned());
        }
    }
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let local_ip = socket.local_addr().ok()?.ip().to_string();
    let parts: Vec<&str> = local_ip.split('.').collect();
    if parts.len() == 4 {
        Some(format!("{}.{}.{}", parts[0], parts[1], parts[2]))
    } else {
        None
    }
}

pub async fn refresh_device_cache(
    cache: &TapoDeviceCache,
    username: &str,
    password: &str,
    subnet_override: Option<&str>,
) {
    if username.is_empty() || password.is_empty() {
        eprintln!("Tapo discovery: credentials not configured");
        return;
    }

    let subnet = match get_local_subnet(subnet_override) {
        Some(s) => s,
        None => {
            eprintln!("Tapo discovery: could not determine local subnet");
            return;
        }
    };
    eprintln!("Tapo discovery: scanning {subnet}.1-254 on port 80");

    let probe_tasks: Vec<_> = (1u8..=254)
        .map(|i| {
            let ip = format!("{subnet}.{i}");
            tokio::spawn(async move {
                let addr = format!("{ip}:80");
                let timeout = tokio::time::Duration::from_millis(500);
                match tokio::time::timeout(timeout, tokio::net::TcpStream::connect(&addr)).await {
                    Ok(Ok(_)) => Some(ip),
                    _ => None,
                }
            })
        })
        .collect();

    let mut responsive = Vec::new();
    for task in probe_tasks {
        if let Ok(Some(ip)) = task.await {
            responsive.push(ip);
        }
    }
    eprintln!("Tapo discovery: {} hosts with port 80 open: {:?}", responsive.len(), responsive);

    let auth_tasks: Vec<_> = responsive
        .into_iter()
        .map(|ip| {
            let username = username.to_owned();
            let password = password.to_owned();
            tokio::spawn(async move {
                let result = tokio::time::timeout(
                    tokio::time::Duration::from_secs(10),
                    async {
                        let device = ApiClient::new(&username, &password).p110(&ip).await?;
                        device.get_device_info().await
                    },
                )
                .await;
                match result {
                    Ok(Ok(info)) => {
                        eprintln!("Tapo discovery: found '{}' at {ip}", info.nickname);
                        Some((info.nickname, ip))
                    }
                    Ok(Err(e)) => {
                        eprintln!("Tapo discovery: {ip} auth failed: {e}");
                        None
                    }
                    Err(_) => {
                        eprintln!("Tapo discovery: {ip} timed out");
                        None
                    }
                }
            })
        })
        .collect();

    let mut devices = Vec::new();
    for task in auth_tasks {
        if let Ok(Some(pair)) = task.await {
            devices.push(pair);
        }
    }

    eprintln!("Tapo discovery: found {} device(s)", devices.len());
    if !devices.is_empty() {
        let mut guard = cache.lock().await;
        *guard = devices;
    }
}

pub async fn record_snapshot(history: &PowerHistory, live_cache: &LivePowerCache) {
    let devices: Vec<models::PowerDeviceReading> = live_cache
        .read()
        .await
        .values()
        .map(|d| models::PowerDeviceReading {
            name: d.name.clone(),
            watts: d.current_power_w,
            on: d.on,
            today_wh: d.today_energy_wh,
            month_wh: d.month_energy_wh,
        })
        .collect();

    if devices.is_empty() {
        return;
    }

    let entry = models::PowerHistoryEntry {
        ts: chrono::Utc::now().to_rfc3339(),
        devices,
    };

    let cutoff = (chrono::Utc::now() - chrono::Duration::days(MAX_HISTORY_DAYS)).to_rfc3339();

    let mut guard = history.lock().await;
    guard.push(entry);
    guard.retain(|e| e.ts >= cutoff);

    if let Ok(json) = serde_json::to_string(&*guard) {
        let _ = std::fs::write(HISTORY_FILE, json);
    }
}

/// Long-running task for a single device. Authenticates once, reuses the
/// session for every poll, and only re-authenticates when the session truly
/// expires — avoiding the session-invalidation storm caused by reconnecting
/// every second.
async fn device_poll_task(
    name: String,
    ip: String,
    username: String,
    password: String,
    live_cache: LivePowerCache,
    active_timer: ActiveClientTimer,
    broadcaster: PowerBroadcast,
) {
    loop {
        // Authenticate once.
        let device = match ApiClient::new(&username, &password).p110(&ip).await {
            Ok(d) => d,
            Err(e) => {
                eprintln!("Tapo connect {name} ({ip}): {e} — retrying in 30s");
                tokio::time::sleep(Duration::from_secs(30)).await;
                continue;
            }
        };
        eprintln!("Tapo: session established for '{name}' at {ip}");

        // Fetch device info once on connect, then refresh every 30 polls.
        // Energy usage is fetched every poll — that's the live data we care about.
        let mut cached_info: Option<(String, String, bool)> = None; // (alias, model, on)
        let mut poll_count: u32 = 0;

        loop {
            let is_active = now_secs()
                .saturating_sub(active_timer.load(Ordering::Relaxed))
                < ACTIVE_WINDOW_SECS;

            // Refresh device info on first poll and every 30 polls after that.
            if poll_count % 30 == 0 {
                match device.get_device_info().await {
                    Ok(info) => { cached_info = Some((info.nickname, info.model, info.device_on)); }
                    Err(e) => {
                        let msg = e.to_string();
                        if msg.contains("SESSION_TIMEOUT") || msg.contains("Handshake") || msg.contains("Decryption") || msg.contains("Unauthorized") {
                            eprintln!("Tapo session expired for '{name}', reconnecting in 5s…");
                            tokio::time::sleep(Duration::from_secs(5)).await;
                            break;
                        }
                        eprintln!("Tapo info error for '{name}': {msg}");
                    }
                }
            }

            let result = device.get_energy_usage().await.map_err(|e| e.to_string());

            match result {
                Ok(energy) => {
                    let (alias, model, on) = cached_info.clone()
                        .unwrap_or_else(|| (name.clone(), String::new(), false));
                    {
                        let mut guard = live_cache.write().await;
                        guard.insert(
                            name.clone(),
                            models::TapoDeviceData {
                                name: name.clone(),
                                ip: ip.clone(),
                                alias,
                                model,
                                on,
                                current_power_w: energy.current_power.unwrap_or(0) as f64
                                    / 1000.0,
                                today_energy_wh: energy.today_energy,
                                month_energy_wh: energy.month_energy,
                                today_runtime_min: energy.today_runtime,
                                month_runtime_min: energy.month_runtime,
                            },
                        );
                    }
                    poll_count = poll_count.wrapping_add(1);
                    // Broadcast the full snapshot so SSE clients get it immediately.
                    let snapshot = {
                        let guard = live_cache.read().await;
                        models::TapoPowerResponse {
                            timestamp: chrono::Utc::now().to_rfc3339(),
                            devices: guard.values().cloned().collect(),
                        }
                    };
                    let _ = broadcaster.send(snapshot);
                }
                Err(e) => {
                    let needs_reconnect = e.contains("SESSION_TIMEOUT")
                        || e.contains("Handshake")
                        || e.contains("Decryption")
                        || e.contains("Unauthorized");
                    if needs_reconnect {
                        eprintln!("Tapo session expired for '{name}', reconnecting in 5s…");
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        break; // Break inner loop → outer loop re-authenticates.
                    }
                    eprintln!("Tapo poll error for '{name}': {e}");
                }
            }

            if is_active {
                tokio::time::sleep(Duration::from_millis(FAST_POLL_MS)).await;
            } else {
                tokio::time::sleep(Duration::from_secs(SLOW_POLL_SECS)).await;
            }
        }
    }
}

/// Coordinator: watches the device cache and spawns/aborts one
/// `device_poll_task` per discovered device.
pub async fn live_poll_loop(
    device_cache: TapoDeviceCache,
    live_cache: LivePowerCache,
    active_timer: ActiveClientTimer,
    broadcaster: PowerBroadcast,
    username: String,
    password: String,
) {
    let mut running: HashMap<String, tokio::task::JoinHandle<()>> = HashMap::new();

    loop {
        if !username.is_empty() && !password.is_empty() {
            let device_list = device_cache.lock().await.clone();
            let current_names: HashSet<String> =
                device_list.iter().map(|(n, _)| n.clone()).collect();

            // Spawn tasks for newly discovered devices.
            for (name, ip) in &device_list {
                if !running.contains_key(name) {
                    let handle = tokio::spawn(device_poll_task(
                        name.clone(),
                        ip.clone(),
                        username.clone(),
                        password.clone(),
                        Arc::clone(&live_cache),
                        Arc::clone(&active_timer),
                        Arc::clone(&broadcaster),
                    ));
                    running.insert(name.clone(), handle);
                }
            }

            // Abort tasks for devices no longer in the cache.
            running.retain(|name, handle| {
                if !current_names.contains(name) {
                    handle.abort();
                    live_cache.blocking_write().remove(name);
                    false
                } else {
                    true
                }
            });
        }

        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    #[serde(default = "default_hours")]
    pub hours: u32,
    pub start: Option<String>,
    pub end: Option<String>,
}
fn default_hours() -> u32 {
    24
}

pub async fn get_power_history(
    Extension(history): Extension<PowerHistory>,
    Query(params): Query<HistoryQuery>,
) -> impl IntoResponse {
    let (start_ts, end_ts) = if let (Some(start), Some(end)) = (&params.start, &params.end) {
        (start.clone(), end.clone())
    } else {
        let hours = params.hours.max(1).min(24 * 60) as i64;
        let end = chrono::Utc::now().to_rfc3339();
        let start = (chrono::Utc::now() - chrono::Duration::hours(hours)).to_rfc3339();
        (start, end)
    };

    let guard = history.lock().await;
    let readings: Vec<&models::PowerHistoryEntry> =
        guard.iter().filter(|e| e.ts >= start_ts && e.ts <= end_ts).collect();

    Json(serde_json::json!({ "readings": readings })).into_response()
}

fn credentials(
    tapo: &crate::app_config::TapoConfig,
) -> Result<(String, String), (StatusCode, Json<models::ActionResponse>)> {
    if tapo.is_configured() {
        Ok((tapo.username.clone(), tapo.password.clone()))
    } else {
        Err(models::ActionResponse::err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Tapo credentials not configured",
        ))
    }
}

pub async fn get_power(
    Extension(live_cache): Extension<LivePowerCache>,
    Extension(active_timer): Extension<ActiveClientTimer>,
) -> impl IntoResponse {
    active_timer.store(now_secs(), Ordering::Relaxed);

    let devices: Vec<models::TapoDeviceData> =
        live_cache.read().await.values().cloned().collect();

    Json(models::TapoPowerResponse {
        timestamp: chrono::Utc::now().to_rfc3339(),
        devices,
    })
    .into_response()
}

/// SSE endpoint — pushes the full device snapshot to the client every time
/// any device_poll_task completes a successful read. Zero polling required
/// from the browser; timing is driven entirely by the backend.
pub async fn get_power_stream(
    Extension(broadcaster): Extension<PowerBroadcast>,
    Extension(active_timer): Extension<ActiveClientTimer>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    active_timer.store(now_secs(), Ordering::Relaxed);

    let rx = broadcaster.subscribe();
    let timer = Arc::clone(&active_timer);

    let stream = BroadcastStream::new(rx).filter_map(move |msg| {
        timer.store(now_secs(), Ordering::Relaxed);
        msg.ok().map(|data| {
            let json = serde_json::to_string(&data).unwrap_or_default();
            Ok(Event::default().data(json))
        })
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

pub async fn power_on(
    Path(name): Path<String>,
    Extension(cache): Extension<TapoDeviceCache>,
    Extension(cfg): Extension<Arc<crate::app_config::Config>>,
) -> impl IntoResponse {
    let ip = cache
        .lock()
        .await
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, ip)| ip.clone());
    let ip = match ip {
        Some(ip) => ip,
        None => {
            return models::ActionResponse::err(
                StatusCode::NOT_FOUND,
                &format!("unknown device '{name}'"),
            )
        }
    };
    let (username, password) = match credentials(&cfg.tapo) {
        Ok(c) => c,
        Err(e) => return e,
    };
    match ApiClient::new(&username, &password).p110(&ip).await {
        Err(e) => models::ActionResponse::err(StatusCode::BAD_GATEWAY, &format!("connect: {e}")),
        Ok(device) => match device.on().await {
            Ok(()) => models::ActionResponse::ok(format!("{name} turned on")),
            Err(e) => {
                models::ActionResponse::err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
            }
        },
    }
}

/// Shared helper — used by automations and HTTP handlers alike.
pub async fn tapo_set_power(
    cache: &TapoDeviceCache,
    device_name: &str,
    on: bool,
    tapo: &crate::app_config::TapoConfig,
) -> Result<(), String> {
    if !tapo.is_configured() {
        return Err("Tapo credentials not configured".to_string());
    }

    let ip = cache
        .lock()
        .await
        .iter()
        .find(|(n, _)| n == device_name)
        .map(|(_, ip)| ip.clone())
        .ok_or_else(|| format!("device '{}' not found in cache", device_name))?;

    let device = ApiClient::new(&tapo.username, &tapo.password)
        .p110(&ip)
        .await
        .map_err(|e| e.to_string())?;

    if on { device.on().await } else { device.off().await }
        .map_err(|e| e.to_string())
}

pub async fn power_off(
    Path(name): Path<String>,
    Extension(cache): Extension<TapoDeviceCache>,
    Extension(cfg): Extension<Arc<crate::app_config::Config>>,
) -> impl IntoResponse {
    let ip = cache
        .lock()
        .await
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, ip)| ip.clone());
    let ip = match ip {
        Some(ip) => ip,
        None => {
            return models::ActionResponse::err(
                StatusCode::NOT_FOUND,
                &format!("unknown device '{name}'"),
            )
        }
    };
    let (username, password) = match credentials(&cfg.tapo) {
        Ok(c) => c,
        Err(e) => return e,
    };
    match ApiClient::new(&username, &password).p110(&ip).await {
        Err(e) => models::ActionResponse::err(StatusCode::BAD_GATEWAY, &format!("connect: {e}")),
        Ok(device) => match device.off().await {
            Ok(()) => models::ActionResponse::ok(format!("{name} turned off")),
            Err(e) => {
                models::ActionResponse::err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
            }
        },
    }
}
