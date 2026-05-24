use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const APP_CREDS_PATH: &str = "/var/lib/server-dash-api/app-credentials.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum PermissionLevel {
    #[serde(rename = "admin-pl1")]
    AdminPl1,
    #[serde(rename = "admin-pl2")]
    AdminPl2,
    #[serde(rename = "admin-pl3")]
    AdminPl3,
    #[serde(rename = "admin-pl4")]
    AdminPl4,
    #[serde(rename = "admin-pl5")]
    AdminPl5,
    #[serde(rename = "admin-pl6")]
    AdminPl6,
    #[serde(rename = "admin-pl7")]
    AdminPl7,
    #[serde(rename = "admin-pl8")]
    AdminPl8,
    #[serde(rename = "admin-pl9")]
    AdminPl9,
    #[serde(rename = "admin-pl10")]
    AdminPl10,
}

impl Default for PermissionLevel {
    fn default() -> Self {
        PermissionLevel::AdminPl1
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppCredential {
    pub username: String,
    pub password_hash: String,
    #[serde(default)]
    pub system_user: Option<String>,
    #[serde(default)]
    pub permission_level: PermissionLevel,
}

pub fn load_all() -> Vec<AppCredential> {
    let path = PathBuf::from(APP_CREDS_PATH);
    match std::fs::read_to_string(&path) {
        Ok(data) => serde_json::from_str(&data).unwrap_or_default(),
        Err(_) => vec![],
    }
}

pub fn save_all(creds: &[AppCredential]) -> Result<(), String> {
    let path = PathBuf::from(APP_CREDS_PATH);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(creds).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).ok();
    }
    Ok(())
}

pub fn find_by_username(username: &str) -> Option<AppCredential> {
    load_all().into_iter().find(|c| c.username == username)
}

pub fn hash_password(password: &str) -> Result<String, String> {
    bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())
}

pub fn verify_app_password(password: &str, hash: &str) -> bool {
    bcrypt::verify(password, hash).unwrap_or(false)
}

/// Creates the initial user when no credentials are configured yet.
/// Called from CLI args on first startup.
pub fn create_initial_user(username: &str, password: &str) -> Result<(), String> {
    let mut all = load_all();
    if all.iter().any(|c| c.username == username) {
        return Err(format!("User '{}' already exists", username));
    }
    let hash = hash_password(password)?;
    all.push(AppCredential {
        username: username.to_string(),
        password_hash: hash,
        system_user: None,
        permission_level: PermissionLevel::default(),
    });
    save_all(&all)
}
