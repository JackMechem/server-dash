use axum::{
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
};
use serde::Deserialize;

use crate::app_credentials::{
    find_by_username, hash_password, load_all, save_all, verify_app_password, AppCredential,
    PermissionLevel,
};
use crate::auth::get_token_subject;

// GET /account — returns the current user's app credential info
pub async fn get_account(headers: HeaderMap) -> impl IntoResponse {
    let username = match get_token_subject(&headers) {
        Some(u) => u,
        None => return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response(),
    };

    match find_by_username(&username) {
        Some(cred) => Json(serde_json::json!({
            "username": cred.username,
            "system_user": cred.system_user,
            "permission_level": cred.permission_level,
            "has_app_credential": true,
        }))
        .into_response(),
        None => Json(serde_json::json!({
            "username": username,
            "system_user": null,
            "permission_level": "admin-pl1",
            "has_app_credential": false,
        }))
        .into_response(),
    }
}

#[derive(Deserialize)]
pub struct CreateAccountBody {
    pub app_username: String,
    pub app_password: String,
    pub system_user: Option<String>,
    pub system_password: Option<String>,
}

// POST /account — create an app credential, optionally linked to a system user
pub async fn post_account(
    headers: HeaderMap,
    Json(body): Json<CreateAccountBody>,
) -> impl IntoResponse {
    let current_user = match get_token_subject(&headers) {
        Some(u) => u,
        None => return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response(),
    };

    // If a system user is provided, verify its password
    if let Some(ref sys_user) = body.system_user {
        let sys_pw = match &body.system_password {
            Some(p) => p,
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    "System user password required when linking a system user",
                )
                    .into_response()
            }
        };
        if !crate::auth::verify_password(sys_user, sys_pw) {
            return (StatusCode::UNAUTHORIZED, "Invalid system user credentials").into_response();
        }
    }

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
    pub system_user: Option<String>,
    pub system_password: Option<String>,
}

// PUT /account — update username, password, or linked system user
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

    if let Some(new_sys_user) = &body.system_user {
        let sys_pw = match &body.system_password {
            Some(p) => p,
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    "System user password required to change linked user",
                )
                    .into_response()
            }
        };
        if !crate::auth::verify_password(new_sys_user, sys_pw) {
            return (StatusCode::UNAUTHORIZED, "Invalid system user credentials").into_response();
        }
        all[pos].system_user = Some(new_sys_user.clone());
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
