use axum::extract::Extension;
use axum::middleware;
use axum::response::Redirect;
use axum::{Router, routing::delete, routing::get, routing::post, routing::put};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use tokio::sync::{Mutex, RwLock, broadcast};

mod app_config;
mod auth;
mod config;
mod models;
mod routes;
mod settings;

#[tokio::main]
async fn main() {
    let cfg = app_config::load();

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
        if auth::credentials::load_all().is_empty() {
            match auth::credentials::create_initial_user(username, password) {
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
        let cache: routes::devices::tapo::TapoDeviceCache = Arc::new(Mutex::new(vec![]));
        routes::devices::tapo::refresh_device_cache(
            &cache,
            &cfg.tapo.username,
            &cfg.tapo.password,
            cfg.tapo.subnet.as_deref(),
        ).await;
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

    let smart_button_store: routes::devices::smart_buttons::SmartButtonStore =
        Arc::new(Mutex::new(routes::devices::smart_buttons::load_store()));
    let (sb_tx, _) = broadcast::channel(32);
    let smart_button_broadcast: routes::devices::smart_buttons::SmartButtonBroadcast = Arc::new(sb_tx);

    // Background: scan for JMIoT devices, then re-scan every 5 minutes.
    {
        let store = Arc::clone(&smart_button_store);
        let bcast = Arc::clone(&smart_button_broadcast);
        let cfg2  = Arc::clone(&cfg);
        tokio::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_secs(15)).await;
            loop {
                routes::devices::smart_buttons::scan_and_register(
                    Arc::clone(&store), Arc::clone(&bcast), Arc::clone(&cfg2),
                ).await;
                tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
            }
        });
    }

    // Background: mark devices offline when their heartbeat stops.
    {
        let store = Arc::clone(&smart_button_store);
        let bcast = Arc::clone(&smart_button_broadcast);
        tokio::spawn(async move {
            routes::devices::smart_buttons::run_health_check(store, bcast).await;
        });
    }

    let automation_store: routes::devices::automations::AutomationStore =
        Arc::new(Mutex::new(routes::devices::automations::load_store()));

    let power_history: routes::devices::tapo::PowerHistory =
        Arc::new(Mutex::new(routes::devices::tapo::load_history()));

    // Tapo state is always created so the smart-button callback (which extracts
    // TapoDeviceCache) compiles and runs correctly even when Tapo is disabled.
    let device_cache: routes::devices::tapo::TapoDeviceCache = Arc::new(Mutex::new(vec![]));
    let live_cache: routes::devices::tapo::LivePowerCache = Arc::new(RwLock::new(HashMap::new()));
    let active_timer: routes::devices::tapo::ActiveClientTimer = Arc::new(AtomicU64::new(0));
    let (power_tx, _) = broadcast::channel(64);
    let power_broadcast: routes::devices::tapo::PowerBroadcast = Arc::new(power_tx);

    if cfg.features.tapo {
        // Periodically rediscover Tapo devices on the subnet.
        let bg_cache = Arc::clone(&device_cache);
        let username = cfg.tapo.username.clone();
        let password = cfg.tapo.password.clone();
        let subnet = cfg.tapo.subnet.clone();
        tokio::spawn(async move {
            loop {
                routes::devices::tapo::refresh_device_cache(
                    &bg_cache, &username, &password, subnet.as_deref(),
                ).await;
                tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;
            }
        });

        // Background live-poll loop: fast when clients are active, slow when idle.
        let bg_device_cache = Arc::clone(&device_cache);
        let bg_live_cache = Arc::clone(&live_cache);
        let bg_timer = Arc::clone(&active_timer);
        let bg_broadcast = Arc::clone(&power_broadcast);
        let username2 = cfg.tapo.username.clone();
        let password2 = cfg.tapo.password.clone();
        tokio::spawn(async move {
            routes::devices::tapo::live_poll_loop(
                bg_device_cache, bg_live_cache, bg_timer, bg_broadcast, username2, password2,
            ).await;
        });

        // Periodically snapshot live data into history.
        let bg_history = Arc::clone(&power_history);
        let bg_live_cache2 = Arc::clone(&live_cache);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
                routes::devices::tapo::record_snapshot(&bg_history, &bg_live_cache2).await;
            }
        });
    } else {
        eprintln!("server-dash: Tapo feature disabled — skipping device discovery");
    }

    let mut protected_routes = Router::new()
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
        .route("/users/{username}/totp", delete(auth::totp::delete_totp))
        .route(
            "/users/{username}/password",
            put(routes::users::reset_password),
        )
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
        .route("/smart-buttons", get(routes::devices::smart_buttons::get_buttons))
        .route("/smart-buttons/stream", get(routes::devices::smart_buttons::get_stream))
        .route("/smart-buttons/scan", post(routes::devices::smart_buttons::post_scan))
        .route("/smart-buttons/{id}/set", post(routes::devices::smart_buttons::post_set))
        .route("/smart-buttons/{id}/rename", post(routes::devices::smart_buttons::post_rename))
        .route("/smart-buttons/{id}", delete(routes::devices::smart_buttons::delete_button))
        .route("/automations", get(routes::devices::automations::get_automations))
        .route("/automations", post(routes::devices::automations::post_automation))
        .route("/automations/{id}", put(routes::devices::automations::put_automation))
        .route("/automations/{id}", delete(routes::devices::automations::delete_automation))
        .route("/automations/{id}/trigger", post(routes::devices::automations::trigger_automation));

    if cfg.features.tapo {
        protected_routes = protected_routes
            .route("/power/{device}/on", post(routes::devices::tapo::power_on))
            .route("/power/{device}/off", post(routes::devices::tapo::power_off));
    }

    let protected = protected_routes
        .route_layer(middleware::from_fn(auth::require_auth));

    let mut app = Router::new()
        .route("/", get(|| async { Redirect::permanent("/stats") }))
        .route("/stats", get(routes::stats::get_stats))
        .route("/smart-buttons/callback", post(routes::devices::smart_buttons::post_callback))
        .route("/auth/login", post(auth::post_login))
        .route("/auth/verify", post(auth::post_verify))
        .route("/auth/verify-totp", post(auth::post_verify_totp))
        .route("/auth/register/start", post(auth::post_register_start))
        .route("/auth/register/finish", post(auth::post_register_finish))
        .route(
            "/users/{username}/totp/setup",
            post(auth::totp::post_totp_setup),
        )
        .route(
            "/users/{username}/totp/confirm",
            post(auth::totp::post_totp_confirm),
        );

    if cfg.features.tapo {
        app = app
            .route("/power", get(routes::devices::tapo::get_power))
            .route("/power/stream", get(routes::devices::tapo::get_power_stream))
            .route("/power/history", get(routes::devices::tapo::get_power_history));
    }

    let app = app
        .merge(protected)
        .with_state(state)
        .layer(Extension(device_cache))
        .layer(Extension(power_history))
        .layer(Extension(live_cache))
        .layer(Extension(active_timer))
        .layer(Extension(power_broadcast))
        .layer(Extension(smart_button_store))
        .layer(Extension(smart_button_broadcast))
        .layer(Extension(automation_store))
        .layer(Extension(cfg));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001")
        .await
        .unwrap();
    axum::serve(listener, app).await.unwrap();
}
