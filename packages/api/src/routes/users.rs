use axum::{extract::Path, http::StatusCode, response::IntoResponse, response::Json};
use base64::{Engine, engine::general_purpose};
use serde::Serialize;

use crate::auth::{load_credentials, save_credentials, CREDENTIAL_DIR};

#[derive(Serialize)]
struct CredentialInfo {
    id: String,
}

#[derive(Serialize)]
struct UserInfo {
    username: String,
    credentials: Vec<CredentialInfo>,
}

#[derive(Serialize)]
struct UsersResponse {
    users: Vec<UserInfo>,
}

pub async fn list_users() -> impl IntoResponse {
    let dir = std::path::Path::new(CREDENTIAL_DIR);
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Json(UsersResponse { users: vec![] }).into_response();
    };

    let mut users: Vec<UserInfo> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension()?.to_str() != Some("json") {
                return None;
            }
            let username = path.file_stem()?.to_str()?.to_string();
            let stored = load_credentials(&username)?;
            let credentials = stored
                .credentials
                .iter()
                .map(|c| CredentialInfo {
                    id: general_purpose::URL_SAFE_NO_PAD.encode(c.cred_id()),
                })
                .collect();
            Some(UserInfo { username, credentials })
        })
        .collect();

    users.sort_by(|a, b| a.username.cmp(&b.username));
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
