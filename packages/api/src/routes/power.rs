use axum::extract::{Extension, Path, Query};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Deserialize;
use std::sync::Arc;
use tapo::ApiClient;
use tokio::sync::Mutex;

use crate::models;

pub type PowerHistory = Arc<Mutex<Vec<models::PowerHistoryEntry>>>;
pub type TapoDeviceCache = Arc<Mutex<Vec<(String, String)>>>; // (name, ip)

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

fn get_local_subnet() -> Option<String> {
    if let Ok(subnet) = std::env::var("TAPO_SUBNET") {
        if !subnet.is_empty() {
            return Some(subnet);
        }
    }
    // Connect a UDP socket without sending packets — the OS picks the right
    // outbound interface, giving us our local IP with no shell commands needed.
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

pub async fn refresh_device_cache(cache: &TapoDeviceCache) {
    let username = std::env::var("TAPO_USERNAME").unwrap_or_default();
    let password = std::env::var("TAPO_PASSWORD").unwrap_or_default();
    if username.is_empty() || password.is_empty() {
        eprintln!("Tapo discovery: TAPO_USERNAME/TAPO_PASSWORD not set");
        return;
    }

    let subnet = match get_local_subnet() {
        Some(s) => s,
        None => {
            eprintln!("Tapo discovery: could not determine local subnet");
            return;
        }
    };
    eprintln!("Tapo discovery: scanning {subnet}.1-254 on port 80");

    // Probe all 254 hosts concurrently for open port 80
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

    // Attempt Tapo auth on each responsive host
    let auth_tasks: Vec<_> = responsive
        .into_iter()
        .map(|ip| {
            let username = username.clone();
            let password = password.clone();
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

pub async fn record_snapshot(history: &PowerHistory, cache: &TapoDeviceCache) {
    let username = std::env::var("TAPO_USERNAME").unwrap_or_default();
    let password = std::env::var("TAPO_PASSWORD").unwrap_or_default();
    if username.is_empty() || password.is_empty() {
        return;
    }

    let device_list = cache.lock().await.clone();

    let tasks: Vec<_> = device_list
        .iter()
        .map(|(name, ip)| {
            let username = username.clone();
            let password = password.clone();
            let name = name.clone();
            let ip = ip.clone();
            tokio::spawn(async move { query_device(&username, &password, &name, &ip).await })
        })
        .collect();

    let mut devices = Vec::new();
    for task in tasks {
        if let Ok(Ok(data)) = task.await {
            devices.push(models::PowerDeviceReading {
                name: data.name,
                watts: data.current_power_w,
                on: data.on,
                today_wh: data.today_energy_wh,
                month_wh: data.month_energy_wh,
            });
        }
    }

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

async fn query_device(
    username: &str,
    password: &str,
    name: &str,
    ip: &str,
) -> Result<models::TapoDeviceData, String> {
    let device = ApiClient::new(username, password)
        .p110(ip)
        .await
        .map_err(|e| e.to_string())?;

    let info = device.get_device_info().await.map_err(|e| e.to_string())?;
    let energy = device.get_energy_usage().await.map_err(|e| e.to_string())?;

    Ok(models::TapoDeviceData {
        name: name.to_string(),
        ip: ip.to_string(),
        alias: info.nickname,
        model: info.model,
        on: info.device_on,
        current_power_w: energy.current_power.unwrap_or(0) as f64 / 1000.0,
        today_energy_wh: energy.today_energy,
        month_energy_wh: energy.month_energy,
        today_runtime_min: energy.today_runtime,
        month_runtime_min: energy.month_runtime,
    })
}

fn credentials() -> Result<(String, String), (StatusCode, Json<models::ActionResponse>)> {
    let u = std::env::var("TAPO_USERNAME").unwrap_or_default();
    let p = std::env::var("TAPO_PASSWORD").unwrap_or_default();
    if u.is_empty() || p.is_empty() {
        Err(models::ActionResponse::err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "TAPO_USERNAME / TAPO_PASSWORD not set",
        ))
    } else {
        Ok((u, p))
    }
}

pub async fn get_power(Extension(cache): Extension<TapoDeviceCache>) -> impl IntoResponse {
    let username = std::env::var("TAPO_USERNAME").unwrap_or_default();
    let password = std::env::var("TAPO_PASSWORD").unwrap_or_default();

    if username.is_empty() || password.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "TAPO_USERNAME and TAPO_PASSWORD must be set",
        )
            .into_response();
    }

    let device_list = cache.lock().await.clone();

    let tasks: Vec<_> = device_list
        .iter()
        .map(|(name, ip)| {
            let username = username.clone();
            let password = password.clone();
            let name = name.clone();
            let ip = ip.clone();
            tokio::spawn(async move { query_device(&username, &password, &name, &ip).await })
        })
        .collect();

    let mut devices = Vec::new();
    for task in tasks {
        match task.await {
            Ok(Ok(data)) => devices.push(data),
            Ok(Err(e)) => eprintln!("Tapo query error: {e}"),
            Err(e) => eprintln!("Tapo task panic: {e}"),
        }
    }

    Json(models::TapoPowerResponse {
        timestamp: chrono::Utc::now().to_rfc3339(),
        devices,
    })
    .into_response()
}

pub async fn power_on(
    Path(name): Path<String>,
    Extension(cache): Extension<TapoDeviceCache>,
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
    let (username, password) = match credentials() {
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

pub async fn power_off(
    Path(name): Path<String>,
    Extension(cache): Extension<TapoDeviceCache>,
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
    let (username, password) = match credentials() {
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
