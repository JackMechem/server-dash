use axum::extract::Extension;
use axum::middleware;
use axum::response::Redirect;
use axum::{Router, routing::delete, routing::get, routing::post};
use std::sync::Arc;
use tokio::sync::Mutex;

mod auth;
mod config;
mod models;
mod routes;

#[tokio::main]
async fn main() {
    if std::env::args().any(|a| a == "-d") {
        let cache: routes::power::TapoDeviceCache = Arc::new(Mutex::new(vec![]));
        routes::power::refresh_device_cache(&cache).await;
        let devices = cache.lock().await;
        if devices.is_empty() {
            println!("No Tapo devices found.");
        } else {
            for (name, ip) in devices.iter() {
                println!("{name}  {ip}");
            }
        }
        return;
    }

    let state = Arc::new(auth::AppState::new());

    let power_history: routes::power::PowerHistory =
        Arc::new(Mutex::new(routes::power::load_history()));

    let device_cache: routes::power::TapoDeviceCache = Arc::new(Mutex::new(vec![]));

    let bg_cache = Arc::clone(&device_cache);
    tokio::spawn(async move {
        loop {
            routes::power::refresh_device_cache(&bg_cache).await;
            tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;
        }
    });

    let bg_history = Arc::clone(&power_history);
    let bg_cache2 = Arc::clone(&device_cache);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
            routes::power::record_snapshot(&bg_history, &bg_cache2).await;
        }
    });

    let protected = Router::new()
        .route("/users", get(routes::users::list_users))
        .route(
            "/users/{username}/credentials/{cred_id}",
            delete(routes::users::delete_credential),
        )
        .route("/power/{device}/on", post(routes::power::power_on))
        .route("/power/{device}/off", post(routes::power::power_off))
        .route(
            "/services/{service}/restart",
            post(routes::services::restart_service),
        )
        .route(
            "/services/{service}/start",
            post(routes::services::start_service),
        )
        .route(
            "/services/{service}/stop",
            post(routes::services::stop_service),
        )
        .route(
            "/services/{service}/logs",
            get(routes::services::service_logs),
        )
        .route("/system/reboot", post(routes::system::system_reboot))
        .route("/system/shutdown", post(routes::system::system_shutdown))
        .route_layer(middleware::from_fn(auth::require_auth));

    let app = Router::new()
        .route("/", get(|| async { Redirect::permanent("/stats") }))
        .route("/stats", get(routes::stats::get_stats))
        .route("/power", get(routes::power::get_power))
        .route("/power/history", get(routes::power::get_power_history))
        .route("/auth/login", post(auth::post_login))
        .route("/auth/verify", post(auth::post_verify))
        .route("/auth/register/start", post(auth::post_register_start))
        .route("/auth/register/finish", post(auth::post_register_finish))
        .merge(protected)
        .with_state(state)
        .layer(Extension(device_cache))
        .layer(Extension(power_history));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
        .await
        .unwrap();
    axum::serve(listener, app).await.unwrap();
}
