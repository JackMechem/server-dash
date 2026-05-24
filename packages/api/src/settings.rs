use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const SETTINGS_PATH: &str = "/var/lib/server-dash-api/settings.json";

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    #[serde(default)]
    pub allow_system_login: bool,
    /// WebAuthn relying party ID (e.g. "example.com"). Must be a suffix of the site's hostname.
    #[serde(default)]
    pub webauthn_rp_id: Option<String>,
    /// Full origin URL used for WebAuthn (e.g. "https://dashboard.example.com").
    #[serde(default)]
    pub webauthn_origin: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            allow_system_login: false,
            webauthn_rp_id: None,
            webauthn_origin: None,
        }
    }
}

pub fn load() -> AppSettings {
    let path = PathBuf::from(SETTINGS_PATH);
    match std::fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn save(settings: &AppSettings) -> Result<(), String> {
    let path = PathBuf::from(SETTINGS_PATH);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}
