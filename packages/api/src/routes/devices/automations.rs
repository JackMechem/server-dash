use axum::extract::{Extension, Path};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::routes::devices::tapo::TapoDeviceCache;

// ── Types ─────────────────────────────────────────────────────────────────────

/// What event fires the automation.
/// kind = "button_state" → fires when a JMIoT button changes state.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AutomationTrigger {
    pub kind: String,
    pub device_id: String,
    pub button_name: String,
    /// None = any state change, Some(true) = button turned on, Some(false) = turned off
    pub on_state: Option<bool>,
}

/// What the automation does when it fires.
/// kind = "tapo_power" → turn a Tapo device on or off.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AutomationAction {
    pub kind: String,
    pub device_name: String,
    pub power: bool,
}

/// Stored automation. Serializes with `actions` (array).
/// Deserializes from both old `action` (singular) and new `actions` (array) for migration.
#[derive(Serialize, Clone, Debug)]
pub struct Automation {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub trigger: AutomationTrigger,
    pub actions: Vec<AutomationAction>,
    pub created_at: String,
    pub last_triggered_at: Option<String>,
}

impl<'de> Deserialize<'de> for Automation {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Raw {
            id: String,
            name: String,
            enabled: bool,
            trigger: AutomationTrigger,
            // Old format: single action
            action: Option<AutomationAction>,
            // New format: multiple actions
            #[serde(default)]
            actions: Vec<AutomationAction>,
            created_at: String,
            last_triggered_at: Option<String>,
        }

        let raw = Raw::deserialize(deserializer)?;
        let actions = if !raw.actions.is_empty() {
            raw.actions
        } else if let Some(a) = raw.action {
            vec![a]
        } else {
            vec![]
        };

        Ok(Automation {
            id: raw.id,
            name: raw.name,
            enabled: raw.enabled,
            trigger: raw.trigger,
            actions,
            created_at: raw.created_at,
            last_triggered_at: raw.last_triggered_at,
        })
    }
}

pub type AutomationStore = Arc<Mutex<Vec<Automation>>>;

// ── Persistence ───────────────────────────────────────────────────────────────

const STORE_FILE: &str = "/var/lib/server-dash-api/automations.json";

pub fn load_store() -> Vec<Automation> {
    let path = std::path::Path::new(STORE_FILE);
    if !path.exists() { return vec![]; }
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => vec![],
    }
}

fn save_store(items: &[Automation]) {
    if let Ok(json) = serde_json::to_string(items) {
        let _ = std::fs::write(STORE_FILE, json);
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ── Create/Update payload ─────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct TriggerPayload {
    pub device_id: String,
    pub button_name: String,
    pub on_state: Option<bool>,
}

#[derive(Deserialize)]
pub struct ActionPayload {
    pub kind: String,
    pub device_name: String,
    pub power: bool,
}

#[derive(Deserialize)]
pub struct AutomationPayload {
    pub name: String,
    pub enabled: bool,
    pub trigger: TriggerPayload,
    pub actions: Vec<ActionPayload>,
}

// ── GET /automations  (protected) ─────────────────────────────────────────────
pub async fn get_automations(
    Extension(store): Extension<AutomationStore>,
) -> impl IntoResponse {
    let items = store.lock().await;
    Json(items.clone()).into_response()
}

// ── POST /automations  (protected) ────────────────────────────────────────────
pub async fn post_automation(
    Extension(store): Extension<AutomationStore>,
    Json(body): Json<AutomationPayload>,
) -> impl IntoResponse {
    let auto = Automation {
        id: Uuid::new_v4().to_string(),
        name: body.name,
        enabled: body.enabled,
        trigger: AutomationTrigger {
            kind: "button_state".to_string(),
            device_id: body.trigger.device_id,
            button_name: body.trigger.button_name,
            on_state: body.trigger.on_state,
        },
        actions: body.actions.into_iter().map(|a| AutomationAction {
            kind: a.kind,
            device_name: a.device_name,
            power: a.power,
        }).collect(),
        created_at: now_iso(),
        last_triggered_at: None,
    };

    let mut items = store.lock().await;
    items.push(auto.clone());
    save_store(&items);

    (StatusCode::CREATED, Json(auto)).into_response()
}

// ── PUT /automations/{id}  (protected) ────────────────────────────────────────
pub async fn put_automation(
    Path(id): Path<String>,
    Extension(store): Extension<AutomationStore>,
    Json(body): Json<AutomationPayload>,
) -> impl IntoResponse {
    let mut items = store.lock().await;
    let item = match items.iter_mut().find(|a| a.id == id) {
        Some(a) => a,
        None => return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "ok": false, "error": "not found" })),
        ).into_response(),
    };

    item.name = body.name;
    item.enabled = body.enabled;
    item.trigger = AutomationTrigger {
        kind: "button_state".to_string(),
        device_id: body.trigger.device_id,
        button_name: body.trigger.button_name,
        on_state: body.trigger.on_state,
    };
    item.actions = body.actions.into_iter().map(|a| AutomationAction {
        kind: a.kind,
        device_name: a.device_name,
        power: a.power,
    }).collect();

    let item = item.clone();
    save_store(&items);

    (StatusCode::OK, Json(item)).into_response()
}

// ── DELETE /automations/{id}  (protected) ─────────────────────────────────────
pub async fn delete_automation(
    Path(id): Path<String>,
    Extension(store): Extension<AutomationStore>,
) -> impl IntoResponse {
    let mut items = store.lock().await;
    let before = items.len();
    items.retain(|a| a.id != id);
    if items.len() == before {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "ok": false, "error": "not found" })),
        ).into_response();
    }
    save_store(&items);
    (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
}

// ── Automation engine ─────────────────────────────────────────────────────────

/// Execute all actions for a single automation. Returns results per action.
async fn execute_actions(auto: &Automation, tapo_cache: &TapoDeviceCache) -> Vec<Result<String, String>> {
    let mut results = Vec::new();
    for action in &auto.actions {
        let result = if action.kind == "tapo_power" {
            let cache_names: Vec<String> = tapo_cache.lock().await.iter().map(|(n, _)| n.clone()).collect();
            eprintln!(
                "[automation] cache has {} device(s): {:?}",
                cache_names.len(), cache_names
            );

            match crate::routes::devices::tapo::tapo_set_power(
                tapo_cache,
                &action.device_name,
                action.power,
            ).await {
                Ok(()) => Ok(format!(
                    "Tapo '{}' turned {}",
                    action.device_name,
                    if action.power { "on" } else { "off" }
                )),
                Err(e) => Err(e),
            }
        } else {
            Err(format!("unknown action kind '{}'", action.kind))
        };
        results.push(result);
    }
    results
}

/// Called from the smart-button callback when a button state changes.
/// Checks all enabled automations for matching triggers and executes their actions.
pub async fn run_automations(
    store: AutomationStore,
    tapo_cache: TapoDeviceCache,
    device_id: String,
    button_name: String,
    new_state: bool,
) {
    eprintln!(
        "[automation] checking: device={} button_name={} state={}",
        device_id, button_name, new_state
    );

    let matching: Vec<Automation> = {
        let items = store.lock().await;
        eprintln!("[automation] {} automation(s) in store", items.len());
        items
            .iter()
            .filter(|a| {
                if !a.enabled {
                    eprintln!("[automation] '{}' skipped (disabled)", a.name);
                    return false;
                }
                let t = &a.trigger;
                if t.device_id != device_id {
                    eprintln!(
                        "[automation] '{}' skipped: device_id '{}' != '{}'",
                        a.name, t.device_id, device_id
                    );
                    return false;
                }
                if t.button_name != button_name {
                    eprintln!(
                        "[automation] '{}' skipped: button_name '{}' != '{}'",
                        a.name, t.button_name, button_name
                    );
                    return false;
                }
                let state_match = match t.on_state {
                    None => true,
                    Some(expected) => expected == new_state,
                };
                if !state_match {
                    eprintln!(
                        "[automation] '{}' skipped: on_state {:?} != state={}",
                        a.name, t.on_state, new_state
                    );
                    return false;
                }
                eprintln!("[automation] '{}' MATCHED", a.name);
                true
            })
            .cloned()
            .collect()
    };

    if matching.is_empty() {
        eprintln!("[automation] no matching automations");
        return;
    }

    let now = now_iso();
    let mut triggered_ids: Vec<String> = Vec::new();

    for auto in &matching {
        eprintln!("[automation] executing '{}' ({} action(s)) …", auto.name, auto.actions.len());
        let results = execute_actions(auto, &tapo_cache).await;
        let all_ok = results.iter().all(|r| r.is_ok());
        for (i, result) in results.iter().enumerate() {
            match result {
                Ok(msg) => eprintln!("[automation] '{}' action[{}] OK: {}", auto.name, i, msg),
                Err(e) => eprintln!("[automation] '{}' action[{}] FAILED: {}", auto.name, i, e),
            }
        }
        if all_ok || results.iter().any(|r| r.is_ok()) {
            triggered_ids.push(auto.id.clone());
        }
    }

    // Update last_triggered_at for automations that had at least one successful action
    if !triggered_ids.is_empty() {
        let mut items = store.lock().await;
        for id in &triggered_ids {
            if let Some(a) = items.iter_mut().find(|a| &a.id == id) {
                a.last_triggered_at = Some(now.clone());
            }
        }
        save_store(&items);
    }
}

// ── POST /automations/{id}/trigger  (protected) ───────────────────────────────

pub async fn trigger_automation(
    Path(id): Path<String>,
    Extension(store): Extension<AutomationStore>,
    Extension(tapo_cache): Extension<TapoDeviceCache>,
) -> impl IntoResponse {
    let auto = {
        let items = store.lock().await;
        match items.iter().find(|a| a.id == id).cloned() {
            Some(a) => a,
            None => return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "ok": false, "error": "automation not found" })),
            ).into_response(),
        }
    };

    eprintln!("[automation] manual trigger: '{}' ({} action(s))", auto.name, auto.actions.len());

    let results = execute_actions(&auto, &tapo_cache).await;
    let messages: Vec<String> = results.iter().filter_map(|r| r.as_ref().ok().cloned()).collect();
    let errors: Vec<String> = results.iter().filter_map(|r| r.as_ref().err().cloned()).collect();

    if errors.is_empty() {
        // All actions succeeded
        let now = now_iso();
        let mut items = store.lock().await;
        if let Some(a) = items.iter_mut().find(|a| a.id == id) {
            a.last_triggered_at = Some(now);
        }
        save_store(&items);
        let msg = messages.join(", ");
        (StatusCode::OK, Json(serde_json::json!({ "ok": true, "message": msg }))).into_response()
    } else if messages.is_empty() {
        // All actions failed
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "ok": false, "error": errors.join(", ") })),
        ).into_response()
    } else {
        // Partial success
        let now = now_iso();
        let mut items = store.lock().await;
        if let Some(a) = items.iter_mut().find(|a| a.id == id) {
            a.last_triggered_at = Some(now);
        }
        save_store(&items);
        let msg = format!("{} (errors: {})", messages.join(", "), errors.join(", "));
        (StatusCode::OK, Json(serde_json::json!({ "ok": true, "message": msg }))).into_response()
    }
}
