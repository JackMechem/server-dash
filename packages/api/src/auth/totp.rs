use axum::{
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Json},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use totp_rs::{Algorithm, Secret, TOTP};

use super::{decode_basic_auth, verify_password};
use super::credentials as app_credentials;

pub(crate) const TOTP_DIR: &str = "/var/lib/server-dash-api/totp";

#[derive(Serialize, Deserialize)]
pub(crate) struct StoredTotp {
    pub(crate) secret: String,
}

pub(crate) fn has_totp(username: &str) -> bool {
    PathBuf::from(TOTP_DIR)
        .join(format!("{}.json", username))
        .exists()
}

pub(crate) fn load_totp(username: &str) -> Option<StoredTotp> {
    let path = PathBuf::from(TOTP_DIR).join(format!("{}.json", username));
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

fn save_totp_file(username: &str, totp: &StoredTotp) -> Result<(), String> {
    let dir = PathBuf::from(TOTP_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", username));
    let data = serde_json::to_string(totp).map_err(|e| e.to_string())?;
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).ok();
    }
    Ok(())
}

pub(crate) fn remove_totp_file(username: &str) -> Result<(), String> {
    let path = PathBuf::from(TOTP_DIR).join(format!("{}.json", username));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn make_totp(secret_base32: &str) -> Result<TOTP, String> {
    let bytes = Secret::Encoded(secret_base32.to_string())
        .to_bytes()
        .map_err(|e| e.to_string())?;
    TOTP::new(Algorithm::SHA1, 6, 1, 30, bytes).map_err(|e| e.to_string())
}

fn totp_uri(secret_base32: &str, username: &str) -> String {
    let label = format!("{}@server-dash", username)
        .bytes()
        .fold(String::new(), |mut acc, b| {
            match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    acc.push(b as char);
                }
                _ => acc.push_str(&format!("%{:02X}", b)),
            }
            acc
        });
    format!(
        "otpauth://totp/{}?secret={}&issuer=Server%20Dashboard&algorithm=SHA1&digits=6&period=30",
        label, secret_base32,
    )
}

pub(crate) fn verify_totp_code(username: &str, code: &str) -> bool {
    let stored = match load_totp(username) {
        Some(s) => s,
        None => return false,
    };
    let totp = match make_totp(&stored.secret) {
        Ok(t) => t,
        Err(_) => return false,
    };
    totp.check_current(code).unwrap_or(false)
}

// POST /users/{username}/totp/setup
pub async fn post_totp_setup(
    Path(username): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let (auth_user, password) = match decode_basic_auth(&headers) {
        Some(c) => c,
        None => return (StatusCode::UNAUTHORIZED, "Missing credentials").into_response(),
    };
    if auth_user != username {
        return (StatusCode::FORBIDDEN, "Username mismatch").into_response();
    }

    // Check app credentials first, fall back to /etc/shadow
    let system_user = {
        let all = app_credentials::load_all();
        if let Some(cred) = all.iter().find(|c| c.username == auth_user) {
            if !app_credentials::verify_app_password(&password, &cred.password_hash) {
                return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
            }
            cred.system_user.clone().unwrap_or_else(|| auth_user.clone())
        } else {
            if !crate::settings::load().allow_system_login {
                return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
            }
            if !verify_password(&auth_user, &password) {
                return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
            }
            auth_user.clone()
        }
    };

    let secret = Secret::generate_secret();
    let secret_base32 = match secret.to_encoded() {
        Secret::Encoded(s) => s,
        _ => {
            return (StatusCode::INTERNAL_SERVER_ERROR, "Secret encoding failed").into_response()
        }
    };

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "secret": secret_base32,
            "uri": totp_uri(&secret_base32, &system_user),
        })),
    )
        .into_response()
}

#[derive(Deserialize)]
pub struct ConfirmTotpBody {
    pub secret: String,
    pub code: String,
}

// POST /users/{username}/totp/confirm
pub async fn post_totp_confirm(
    Path(username): Path<String>,
    Json(body): Json<ConfirmTotpBody>,
) -> impl IntoResponse {
    let effective = app_credentials::resolve_effective_user(&username);

    let totp = match make_totp(&body.secret) {
        Ok(t) => t,
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid secret").into_response(),
    };

    if !totp.check_current(&body.code).unwrap_or(false) {
        return (
            StatusCode::BAD_REQUEST,
            "Invalid code — make sure your clock is synced",
        )
            .into_response();
    }

    let stored = StoredTotp { secret: body.secret };
    if let Err(e) = save_totp_file(&effective, &stored) {
        eprintln!("Failed to save TOTP for {}: {}", effective, e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save TOTP").into_response();
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "message": "TOTP configured" })),
    )
        .into_response()
}

// DELETE /users/{username}/totp  (JWT-protected)
pub async fn delete_totp(Path(username): Path<String>) -> impl IntoResponse {
    let effective = app_credentials::resolve_effective_user(&username);
    match remove_totp_file(&effective) {
        Ok(_) => Json(serde_json::json!({ "success": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}
