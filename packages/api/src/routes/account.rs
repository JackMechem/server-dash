use axum::{
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
};
use base64::{Engine, engine::general_purpose};
use serde::Deserialize;

use crate::auth::credentials::{
    find_by_username, hash_password, load_all, resolve_effective_user, save_all,
    verify_app_password, AppCredential, PermissionLevel,
};
use crate::auth::{get_token_subject, load_credentials};
use crate::auth::totp::has_totp;

// GET /account — returns the current user's app credential info
pub async fn get_account(headers: HeaderMap) -> impl IntoResponse {
    let username = match get_token_subject(&headers) {
        Some(u) => u,
        None => return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response(),
    };

    let effective = resolve_effective_user(&username);

    let credentials: Vec<serde_json::Value> = load_credentials(&effective)
        .map(|s| {
            s.credentials
                .iter()
                .map(|c| {
                    let id = general_purpose::URL_SAFE_NO_PAD.encode(c.cred_id());
                    let label = s.labels.get(&id).cloned();
                    serde_json::json!({ "id": id, "label": label })
                })
                .collect()
        })
        .unwrap_or_default();

    let has_totp_val = has_totp(&effective);

    match find_by_username(&username) {
        Some(cred) => Json(serde_json::json!({
            "username": cred.username,
            "system_user": cred.system_user,
            "permission_level": cred.permission_level,
            "has_app_credential": true,
            "credentials": credentials,
            "has_totp": has_totp_val,
        }))
        .into_response(),
        None => Json(serde_json::json!({
            "username": username,
            "system_user": null,
            "permission_level": "admin-pl1",
            "has_app_credential": false,
            "credentials": credentials,
            "has_totp": has_totp_val,
        }))
        .into_response(),
    }
}

#[derive(Deserialize)]
pub struct CreateAccountBody {
    pub app_username: String,
    pub app_password: String,
    pub system_user: Option<String>,
}

// POST /account — create an app credential
pub async fn post_account(
    headers: HeaderMap,
    Json(body): Json<CreateAccountBody>,
) -> impl IntoResponse {
    let current_user = match get_token_subject(&headers) {
        Some(u) => u,
        None => return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response(),
    };

    let app_username = body.app_username.trim().to_string();
    if app_username.is_empty() || app_username.len() > 64 {
        return (StatusCode::BAD_REQUEST, "Invalid username").into_response();
    }

    let mut all = load_all();

    if all
        .iter()
        .any(|c| c.username == app_username && c.username != current_user)
    {
        return (StatusCode::CONFLICT, "Username already taken").into_response();
    }

    all.retain(|c| c.username != current_user);

    let hash = match hash_password(&body.app_password) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("Failed to hash password: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to hash password")
                .into_response();
        }
    };

    all.push(AppCredential {
        username: app_username,
        password_hash: hash,
        system_user: body.system_user,
        permission_level: PermissionLevel::default(),
    });

    if let Err(e) = save_all(&all) {
        eprintln!("Failed to save app credentials: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save credentials").into_response();
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
}

#[derive(Deserialize)]
pub struct UpdateAccountBody {
    pub new_username: Option<String>,
    pub current_password: Option<String>,
    pub new_password: Option<String>,
}

// PUT /account — update username or password
pub async fn put_account(
    headers: HeaderMap,
    Json(body): Json<UpdateAccountBody>,
) -> impl IntoResponse {
    let current_user = match get_token_subject(&headers) {
        Some(u) => u,
        None => return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response(),
    };

    let mut all = load_all();
    let pos = match all.iter().position(|c| c.username == current_user) {
        Some(i) => i,
        None => {
            return (
                StatusCode::NOT_FOUND,
                "No app credential found. Create one first.",
            )
                .into_response()
        }
    };

    // Changing username or password requires current password verification
    if body.new_username.is_some() || body.new_password.is_some() {
        let curr_pw = match &body.current_password {
            Some(p) => p,
            None => {
                return (StatusCode::BAD_REQUEST, "Current password required").into_response()
            }
        };
        if !verify_app_password(curr_pw, &all[pos].password_hash) {
            return (StatusCode::UNAUTHORIZED, "Invalid current password").into_response();
        }
    }

    if let Some(new_pw) = &body.new_password {
        all[pos].password_hash = match hash_password(new_pw) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("Failed to hash password: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to hash password")
                    .into_response();
            }
        };
    }

    if let Some(new_u) = body.new_username.as_deref().map(str::trim) {
        if new_u.is_empty() || new_u.len() > 64 {
            return (StatusCode::BAD_REQUEST, "Invalid username").into_response();
        }
        if all
            .iter()
            .enumerate()
            .any(|(i, c)| c.username == new_u && i != pos)
        {
            return (StatusCode::CONFLICT, "Username already taken").into_response();
        }
        all[pos].username = new_u.to_string();
    }

    if let Err(e) = save_all(&all) {
        eprintln!("Failed to save app credentials: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save credentials").into_response();
    }

    (StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response()
}
