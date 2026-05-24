use axum::{extract::Path, http::StatusCode, response::IntoResponse, response::Json};
use base64::{Engine, engine::general_purpose};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::app_credentials;
use crate::auth::{load_credentials, save_credentials, CREDENTIAL_DIR};
use crate::totp::{has_totp, TOTP_DIR};

#[derive(Deserialize)]
pub struct ResetPasswordBody {
    pub new_password: String,
}

pub async fn reset_password(
    Path(username): Path<String>,
    Json(body): Json<ResetPasswordBody>,
) -> impl IntoResponse {
    let mut all = app_credentials::load_all();
    let Some(pos) = all.iter().position(|c| c.username == username) else {
        return (StatusCode::NOT_FOUND, "User not found").into_response();
    };

    let hash = match app_credentials::hash_password(&body.new_password) {
        Ok(h) => h,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    };

    all[pos].password_hash = hash;

    if let Err(e) = app_credentials::save_all(&all) {
        return (StatusCode::INTERNAL_SERVER_ERROR, e).into_response();
    }

    Json(serde_json::json!({ "success": true })).into_response()
}

#[derive(Serialize)]
struct CredentialInfo {
    id: String,
    label: Option<String>,
}

#[derive(Serialize)]
struct UserInfo {
    username: String,
    credentials: Vec<CredentialInfo>,
    has_totp: bool,
}

#[derive(Serialize)]
struct UsersResponse {
    users: Vec<UserInfo>,
}

fn json_stems(dir: &str) -> HashSet<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return HashSet::new();
    };
    entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension()?.to_str() != Some("json") {
                return None;
            }
            Some(p.file_stem()?.to_str()?.to_string())
        })
        .collect()
}

fn credentials_for(effective: &str) -> Vec<CredentialInfo> {
    load_credentials(effective)
        .map(|s| {
            s.credentials
                .iter()
                .map(|c| {
                    let id = general_purpose::URL_SAFE_NO_PAD.encode(c.cred_id());
                    let label = s.labels.get(&id).cloned();
                    CredentialInfo { id, label }
                })
                .collect()
        })
        .unwrap_or_default()
}

pub async fn list_users() -> impl IntoResponse {
    let app_creds = app_credentials::load_all();

    // Build list from app credentials (show app usernames, look up by system_user)
    let mut seen_effective: HashSet<String> = HashSet::new();
    let mut users: Vec<UserInfo> = app_creds
        .into_iter()
        .map(|cred| {
            let effective = cred.system_user.clone().unwrap_or_else(|| cred.username.clone());
            seen_effective.insert(effective.clone());
            UserInfo {
                username: cred.username,
                credentials: credentials_for(&effective),
                has_totp: has_totp(&effective),
            }
        })
        .collect();

    // Also surface any orphaned credential files not linked to an app user
    let webauthn_users = json_stems(CREDENTIAL_DIR);
    let totp_users = json_stems(TOTP_DIR);
    let mut orphans: Vec<String> = webauthn_users
        .union(&totp_users)
        .filter(|u| !seen_effective.contains(*u))
        .cloned()
        .collect();
    orphans.sort();
    for username in orphans {
        users.push(UserInfo {
            credentials: credentials_for(&username),
            has_totp: has_totp(&username),
            username,
        });
    }

    users.sort_by(|a, b| a.username.cmp(&b.username));
    Json(UsersResponse { users }).into_response()
}

pub async fn delete_credential(
    Path((username, cred_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let effective = app_credentials::resolve_effective_user(&username);

    let Ok(cred_id_bytes) = general_purpose::URL_SAFE_NO_PAD.decode(&cred_id) else {
        return (StatusCode::BAD_REQUEST, "Invalid credential ID").into_response();
    };

    let Some(mut stored) = load_credentials(&effective) else {
        return (StatusCode::NOT_FOUND, "User not found").into_response();
    };

    let original_len = stored.credentials.len();
    stored
        .credentials
        .retain(|c| c.cred_id().as_ref() != cred_id_bytes.as_slice());

    if stored.credentials.len() == original_len {
        return (StatusCode::NOT_FOUND, "Credential not found").into_response();
    }

    if let Err(e) = save_credentials(&effective, &stored) {
        eprintln!("Failed to save credentials for {}: {}", effective, e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save changes").into_response();
    }

    Json(serde_json::json!({ "success": true })).into_response()
}

#[derive(Deserialize)]
pub struct RenameLabelBody {
    label: String,
}

pub async fn rename_credential(
    Path((username, cred_id)): Path<(String, String)>,
    Json(body): Json<RenameLabelBody>,
) -> impl IntoResponse {
    let effective = app_credentials::resolve_effective_user(&username);

    let Some(mut stored) = load_credentials(&effective) else {
        return (StatusCode::NOT_FOUND, "User not found").into_response();
    };

    let exists = stored
        .credentials
        .iter()
        .any(|c| general_purpose::URL_SAFE_NO_PAD.encode(c.cred_id()) == cred_id);

    if !exists {
        return (StatusCode::NOT_FOUND, "Credential not found").into_response();
    }

    let label = body.label.trim().to_string();
    if label.is_empty() {
        stored.labels.remove(&cred_id);
    } else {
        stored.labels.insert(cred_id, label);
    }

    if let Err(e) = save_credentials(&effective, &stored) {
        eprintln!("Failed to save credentials for {}: {}", effective, e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save changes").into_response();
    }

    Json(serde_json::json!({ "success": true })).into_response()
}
