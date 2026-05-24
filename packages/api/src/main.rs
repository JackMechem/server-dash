use axum::extract::Extension;
use axum::middleware;
use axum::response::Redirect;
use axum::{Router, routing::delete, routing::get, routing::post, routing::put};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use tokio::sync::{Mutex, RwLock, broadcast};

mod app_credentials;
mod auth;
mod config;
mod models;
mod routes;
mod settings;
mod totp;

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    // --create-user <username> <password>
    // Creates the initial app user if none are configured yet, then starts the server.
    if let Some(pos) = args.iter().position(|a| a == "--create-user") {
        let username = args.get(pos + 1).map(String::as_str).unwrap_or("");
        let password = args.get(pos + 2).map(String::as_str).unwrap_or("");
        if username.is_empty() || password.is_empty() {
            eprintln!("Usage: server-dash-api --create-user <username> <password>");
            std::process::exit(1);
        }
        if app_credentials::load_all().is_empty() {
            match app_credentials::create_initial_user(username, password) {
                Ok(_) => println!("Created initial user '{}'.", username),
                Err(e) => {
                    eprintln!("Failed to create user: {}", e);
                    std::process::exit(1);
                }
            }
        } else {
            println!("Users already configured — skipping user creation.");
        }
    }

    if args.iter().any(|a| a == "-d") {
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
    let live_cache: routes::power::LivePowerCache = Arc::new(RwLock::new(HashMap::new()));
    let active_timer: routes::power::ActiveClientTimer = Arc::new(AtomicU64::new(0));
    let (power_tx, _) = broadcast::channel(64);
    let power_broadcast: routes::power::PowerBroadcast = Arc::new(power_tx);

    // Periodically rediscover Tapo devices on the subnet.
    let bg_cache = Arc::clone(&device_cache);
    tokio::spawn(async move {
        loop {
            routes::power::refresh_device_cache(&bg_cache).await;
            tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;
        }
    });

    // Background live-poll loop: fast when clients are active, slow when idle.
    let bg_device_cache = Arc::clone(&device_cache);
    let bg_live_cache = Arc::clone(&live_cache);
    let bg_timer = Arc::clone(&active_timer);
    let bg_broadcast = Arc::clone(&power_broadcast);
    tokio::spawn(async move {
        routes::power::live_poll_loop(bg_device_cache, bg_live_cache, bg_timer, bg_broadcast).await;
    });

    // Periodically snapshot live data into history.
    let bg_history = Arc::clone(&power_history);
    let bg_live_cache2 = Arc::clone(&live_cache);
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
            routes::power::record_snapshot(&bg_history, &bg_live_cache2).await;
        }
    });

    let protected = Router::new()
        .route("/account", get(routes::account::get_account))
        .route("/account", post(routes::account::post_account))
        .route("/account", put(routes::account::put_account))
        .route("/settings", get(routes::settings::get_settings))
        .route("/settings", put(routes::settings::put_settings))
        .route("/users", get(routes::users::list_users))
        .route(
            "/users/{username}/credentials/{cred_id}",
            delete(routes::users::delete_credential),
        )
        .route(
            "/users/{username}/credentials/{cred_id}/label",
            put(routes::users::rename_credential),
        )
        .route("/users/{username}/totp", delete(totp::delete_totp))
        .route(
            "/users/{username}/password",
            put(routes::users::reset_password),
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
        .route("/power/stream", get(routes::power::get_power_stream))
        .route("/power/history", get(routes::power::get_power_history))
        .route("/auth/login", post(auth::post_login))
        .route("/auth/verify", post(auth::post_verify))
        .route("/auth/verify-totp", post(auth::post_verify_totp))
        .route("/auth/register/start", post(auth::post_register_start))
        .route("/auth/register/finish", post(auth::post_register_finish))
        .route(
            "/users/{username}/totp/setup",
            post(totp::post_totp_setup),
        )
        .route(
            "/users/{username}/totp/confirm",
            post(totp::post_totp_confirm),
        )
        .merge(protected)
        .with_state(state)
        .layer(Extension(device_cache))
        .layer(Extension(power_history))
        .layer(Extension(live_cache))
        .layer(Extension(active_timer))
        .layer(Extension(power_broadcast));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3001")
        .await
        .unwrap();
    axum::serve(listener, app).await.unwrap();
}
