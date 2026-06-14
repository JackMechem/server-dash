use axum::extract::{Extension, Path};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt as _;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ButtonState {
    pub button: u8,
    pub enabled: bool,
    pub uptime_s: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SmartButton {
    pub device_id: String,
    pub ip: String,
    pub name: String,
    pub device_name: Option<String>,
    pub buttons: Vec<ButtonState>,
    pub registered_at: String,
    pub last_seen: String,
}

pub type SmartButtonStore = Arc<Mutex<Vec<SmartButton>>>;
pub type SmartButtonBroadcast = Arc<broadcast::Sender<Vec<SmartButton>>>;

// ── Persistence ───────────────────────────────────────────────────────────────

const STORE_FILE: &str = "/var/lib/server-dash-api/smart-buttons.json";

pub fn load_store() -> Vec<SmartButton> {
    let path = std::path::Path::new(STORE_FILE);
    if !path.exists() {
        return vec![];
    }
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => vec![],
    }
}

fn save_store(devices: &[SmartButton]) {
    if let Ok(json) = serde_json::to_string(devices) {
        let _ = std::fs::write(STORE_FILE, json);
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ── Callback payload (sent by ESP32) ─────────────────────────────────────────

#[derive(Deserialize, Debug)]
pub struct CallbackPayload {
    #[serde(rename = "type")]
    pub kind: String,
    pub device_id: String,
    pub ip: String,
    #[serde(default)]
    pub device_name: Option<String>,
    pub state: Option<Vec<ButtonStatePayload>>,
    pub button: Option<u8>,
    #[serde(default)]
    pub button_name: Option<String>,
    pub enabled: Option<bool>,
    pub uptime_s: Option<u64>,
}

#[derive(Deserialize, Debug)]
pub struct ButtonStatePayload {
    pub button: u8,
    pub enabled: bool,
    #[serde(default)]
    pub name: Option<String>,
}

// ── POST /smart-buttons/callback  (called by ESP32, no auth required) ─────────
pub async fn post_callback(
    Extension(store): Extension<SmartButtonStore>,
    Extension(broadcaster): Extension<SmartButtonBroadcast>,
    Extension(automation_store): Extension<crate::routes::devices::automations::AutomationStore>,
    Extension(tapo_cache): Extension<crate::routes::devices::tapo::TapoDeviceCache>,
    Extension(cfg): Extension<Arc<crate::app_config::Config>>,
    Json(payload): Json<CallbackPayload>,
) -> impl IntoResponse {
    let mut devices = store.lock().await;
    let now = now_iso();

    match payload.kind.as_str() {
        "register" => {
            println!(
                "[smart-button] register: device={} ip={}",
                payload.device_id, payload.ip
            );
            let buttons: Vec<ButtonState> = payload
                .state
                .unwrap_or_default()
                .into_iter()
                .map(|b| ButtonState { button: b.button, enabled: b.enabled, uptime_s: 0, name: b.name })
                .collect();

            if let Some(dev) = devices.iter_mut().find(|d| d.device_id == payload.device_id) {
                dev.ip = payload.ip;
                for new_btn in &buttons {
                    if let Some(existing) = dev.buttons.iter_mut().find(|b| b.button == new_btn.button) {
                        existing.enabled = new_btn.enabled;
                        if new_btn.name.is_some() {
                            existing.name = new_btn.name.clone();
                        }
                    } else {
                        dev.buttons.push(new_btn.clone());
                    }
                }
                if payload.device_name.is_some() {
                    dev.device_name = payload.device_name;
                }
                dev.last_seen = now;
            } else {
                devices.push(SmartButton {
                    name: payload.device_id.clone(),
                    device_name: payload.device_name,
                    device_id: payload.device_id,
                    ip: payload.ip,
                    buttons,
                    registered_at: now.clone(),
                    last_seen: now,
                });
            }
        }
        "state_change" => {
            if let (Some(btn), Some(enabled)) = (payload.button, payload.enabled) {
                println!(
                    "[smart-button] state_change: device={} button={} enabled={} uptime={}s",
                    payload.device_id, btn, enabled, payload.uptime_s.unwrap_or(0)
                );
                // Fire automations asynchronously — don't block the callback response.
                let auto_store = automation_store.clone();
                let tapo = tapo_cache.clone();
                let cfg_clone = Arc::clone(&cfg);
                let dev_id = payload.device_id.clone();
                // Prefer the name the ESP32 sends. If absent, look it up from the
                // stored device buttons (set via /rename). Last resort: "button_{n}".
                let btn_name = payload.button_name.clone().unwrap_or_else(|| {
                    devices.iter()
                        .find(|d| d.device_id == payload.device_id)
                        .and_then(|d| d.buttons.iter().find(|b| b.button == btn))
                        .and_then(|b| b.name.clone())
                        .unwrap_or_else(|| format!("button_{}", btn))
                });
                tokio::spawn(async move {
                    crate::routes::devices::automations::run_automations(
                        auto_store, tapo, dev_id, btn_name, enabled, cfg_clone,
                    ).await;
                });
            }
            if let Some(dev) = devices.iter_mut().find(|d| d.device_id == payload.device_id) {
                dev.ip = payload.ip;
                dev.last_seen = now;
                if let (Some(btn), Some(enabled)) = (payload.button, payload.enabled) {
                    if let Some(b) = dev.buttons.iter_mut().find(|b| b.button == btn) {
                        b.enabled = enabled;
                        b.uptime_s = payload.uptime_s.unwrap_or(0);
                    } else {
                        dev.buttons.push(ButtonState {
                            button: btn,
                            enabled,
                            uptime_s: payload.uptime_s.unwrap_or(0),
                            name: None,
                        });
                    }
                }
            }
        }
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "ok": false, "error": "unknown type" })),
            )
                .into_response();
        }
    }

    save_store(&devices);
    let _ = broadcaster.send(devices.clone());
    (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
}

// ── GET /smart-buttons  (protected) ───────────────────────────────────────────
pub async fn get_buttons(
    Extension(store): Extension<SmartButtonStore>,
) -> impl IntoResponse {
    let devices = store.lock().await;
    Json(devices.clone()).into_response()
}

// ── GET /smart-buttons/stream  (protected) ────────────────────────────────────
pub async fn get_stream(
    Extension(broadcaster): Extension<SmartButtonBroadcast>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let rx = broadcaster.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|msg| {
        msg.ok().map(|data| {
            let json = serde_json::to_string(&data).unwrap_or_default();
            Ok(Event::default().data(json))
        })
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ── POST /smart-buttons/{id}/set  (protected) ─────────────────────────────────
#[derive(Deserialize)]
pub struct SetPayload {
    pub button: u8,
    pub enabled: bool,
}

pub async fn post_set(
    Path(id): Path<String>,
    Extension(store): Extension<SmartButtonStore>,
    Extension(broadcaster): Extension<SmartButtonBroadcast>,
    Json(body): Json<SetPayload>,
) -> impl IntoResponse {
    let ip = {
        let devices = store.lock().await;
        match devices.iter().find(|d| d.device_id == id) {
            Some(d) => d.ip.clone(),
            None => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(serde_json::json!({ "ok": false, "error": "device not found" })),
                )
                    .into_response();
            }
        }
    };

    let url = format!("http://{}/api/set", ip);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_default();

    match client
        .post(&url)
        .json(&serde_json::json!({ "button": body.button, "enabled": body.enabled }))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let mut devices = store.lock().await;
            if let Some(dev) = devices.iter_mut().find(|d| d.device_id == id) {
                if let Some(b) = dev.buttons.iter_mut().find(|b| b.button == body.button) {
                    b.enabled = body.enabled;
                } else {
                    dev.buttons.push(ButtonState { button: body.button, enabled: body.enabled, uptime_s: 0, name: None });
                }
            }
            save_store(&devices);
            let _ = broadcaster.send(devices.clone());
            (StatusCode::OK, Json(serde_json::json!({ "ok": true, "button": body.button, "enabled": body.enabled }))).into_response()
        }
        Ok(resp) => {
            let status = resp.status();
            (status, Json(serde_json::json!({ "ok": false, "error": format!("ESP32 returned {}", status) }))).into_response()
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "ok": false, "error": e.to_string() })),
        )
            .into_response(),
    }
}

// ── DELETE /smart-buttons/{id}  (protected) ───────────────────────────────────
pub async fn delete_button(
    Path(id): Path<String>,
    Extension(store): Extension<SmartButtonStore>,
    Extension(broadcaster): Extension<SmartButtonBroadcast>,
) -> impl IntoResponse {
    let mut devices = store.lock().await;
    let before = devices.len();
    devices.retain(|d| d.device_id != id);
    if devices.len() == before {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "ok": false, "error": "device not found" })),
        )
            .into_response();
    }
    save_store(&devices);
    let _ = broadcaster.send(devices.clone());
    (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
}

// ── POST /smart-buttons/{id}/rename  (protected) ──────────────────────────────
#[derive(Deserialize)]
pub struct RenamePayload {
    pub device_name: Option<String>,
    pub button_names: Option<std::collections::HashMap<u8, String>>,
}

pub async fn post_rename(
    Path(id): Path<String>,
    Extension(store): Extension<SmartButtonStore>,
    Extension(broadcaster): Extension<SmartButtonBroadcast>,
    Json(body): Json<RenamePayload>,
) -> impl IntoResponse {
    let mut devices = store.lock().await;
    let dev = match devices.iter_mut().find(|d| d.device_id == id) {
        Some(d) => d,
        None => return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "ok": false, "error": "device not found" })),
        ).into_response(),
    };

    if let Some(name) = body.device_name {
        dev.device_name = Some(name);
    }
    if let Some(names) = body.button_names {
        for (btn_num, name) in names {
            if let Some(btn) = dev.buttons.iter_mut().find(|b| b.button == btn_num) {
                btn.name = Some(name);
            }
        }
    }

    save_store(&devices);
    let _ = broadcaster.send(devices.clone());
    (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
}
