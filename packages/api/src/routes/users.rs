use axum::{extract::Path, http::StatusCode, response::IntoResponse, response::Json};
use base64::{Engine, engine::general_purpose};
use serde::Serialize;
use std::collections::HashSet;

use crate::auth::{load_credentials, save_credentials, CREDENTIAL_DIR};
use crate::totp::{has_totp, TOTP_DIR};

#[derive(Serialize)]
struct CredentialInfo {
    id: String,
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

pub async fn list_users() -> impl IntoResponse {
    let webauthn_users = json_stems(CREDENTIAL_DIR);
    let totp_users = json_stems(TOTP_DIR);
    let mut all_usernames: Vec<String> = webauthn_users.union(&totp_users).cloned().collect();
    all_usernames.sort();

    let users: Vec<UserInfo> = all_usernames
        .into_iter()
        .map(|username| {
            let credentials = load_credentials(&username)
                .map(|s| {
                    s.credentials
                        .iter()
                        .map(|c| CredentialInfo {
                            id: general_purpose::URL_SAFE_NO_PAD.encode(c.cred_id()),
                        })
                        .collect()
                })
                .unwrap_or_default();
            let has_totp = has_totp(&username);
            UserInfo { username, credentials, has_totp }
        })
        .collect();

    Json(UsersResponse { users }).into_response()
}

pub async fn delete_credential(
    Path((username, cred_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let Ok(cred_id_bytes) = general_purpose::URL_SAFE_NO_PAD.decode(&cred_id) else {
        return (StatusCode::BAD_REQUEST, "Invalid credential ID").into_response();
    };

    let Some(mut stored) = load_credentials(&username) else {
        return (StatusCode::NOT_FOUND, "User not found").into_response();
    };

    let original_len = stored.credentials.len();
    stored
        .credentials
        .retain(|c| c.cred_id().as_ref() != cred_id_bytes.as_slice());

    if stored.credentials.len() == original_len {
        return (StatusCode::NOT_FOUND, "Credential not found").into_response();
    }

    if let Err(e) = save_credentials(&username, &stored) {
        eprintln!("Failed to save credentials for {}: {}", username, e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save changes").into_response();
    }

    Json(serde_json::json!({ "success": true })).into_response()
}
