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
}

// PUT /settings
pub async fn put_settings(Json(body): Json<UpdateSettingsBody>) -> impl IntoResponse {
    let updated = AppSettings {
        allow_system_login: body.allow_system_login,
    };
    if let Err(e) = settings::save(&updated) {
        eprintln!("Failed to save settings: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save settings").into_response();
    }
    Json(serde_json::json!({ "success": true })).into_response()
}
