use axum::{http::HeaderMap, http::StatusCode, response::IntoResponse};
use zbus::Connection;

use crate::auth;
use crate::models;

// POST /system/shutdown
pub async fn system_shutdown(headers: HeaderMap) -> impl IntoResponse {
    let conn = match Connection::system().await {
        Ok(c) => c,
        Err(e) => {
            return models::ActionResponse::err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
                .into_response();
        }
    };

    let result = conn
        .call_method(
            Some("org.freedesktop.login1"),
            "/org/freedesktop/login1",
            Some("org.freedesktop.login1.Manager"),
            "PowerOff",
            &(false,),
        )
        .await;

    match result {
        Ok(_) => models::ActionResponse::ok("Shutting down...".to_string()).into_response(),
        Err(e) => models::ActionResponse::err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
            .into_response(),
    }
}

// POST /system/reboot
pub async fn system_reboot(headers: HeaderMap) -> impl IntoResponse {
    let conn = match Connection::system().await {
        Ok(c) => c,
        Err(e) => {
            return models::ActionResponse::err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
                .into_response();
        }
    };

    let result = conn
        .call_method(
            Some("org.freedesktop.login1"),
            "/org/freedesktop/login1",
            Some("org.freedesktop.login1.Manager"),
            "Reboot",
            &(false,), // false = don't ask for confirmation
        )
        .await;

    match result {
        Ok(_) => models::ActionResponse::ok("Rebooting...".to_string()).into_response(),
        Err(e) => models::ActionResponse::err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string())
            .into_response(),
    }
}
