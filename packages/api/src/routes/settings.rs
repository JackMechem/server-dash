use axum::{
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::Deserialize;

use crate::settings::{self, AppSettings};

// GET /settings
pub async fn get_settings() -> impl IntoResponse {
    Json(settings::load()).into_response()
}

#[derive(Deserialize)]
pub struct UpdateSettingsBody {
    pub allow_system_login: bool,
    pub webauthn_rp_id: Option<String>,
    pub webauthn_origin: Option<String>,
}

// PUT /settings
pub async fn put_settings(Json(body): Json<UpdateSettingsBody>) -> impl IntoResponse {
    let updated = AppSettings {
        allow_system_login: body.allow_system_login,
        webauthn_rp_id: body.webauthn_rp_id.filter(|s| !s.is_empty()),
        webauthn_origin: body.webauthn_origin.filter(|s| !s.is_empty()),
    };
    if let Err(e) = settings::save(&updated) {
        eprintln!("Failed to save settings: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save settings").into_response();
    }
    Json(serde_json::json!({ "success": true })).into_response()
}
