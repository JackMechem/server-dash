use axum::body::Body;
use axum::extract::State;
use axum::{
    http::HeaderMap,
    http::Request,
    http::StatusCode,
    middleware::Next,
    response::IntoResponse,
    response::Json,
    response::Response,
};
use base64::{Engine, engine::general_purpose};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use url::Url;
use uuid::Uuid;
use webauthn_rs::prelude::*;

static JWT_SECRET: OnceLock<String> = OnceLock::new();

const ROTATION_DAYS: u64 = 7;
pub(crate) const CREDENTIAL_DIR: &str = "/var/lib/server-dash-api/webauthn-credentials";
const CHALLENGE_TTL: Duration = Duration::from_secs(300);
const RP_ID: &str = "jackmechem.dev";
const RP_ORIGIN: &str = "https://dashboard.jackmechem.dev";

#[derive(Serialize, Deserialize)]
pub(crate) struct StoredCredentials {
    pub(crate) user_id: Uuid,
    pub(crate) credentials: Vec<SecurityKey>,
    #[serde(default)]
    pub(crate) labels: HashMap<String, String>,
}

pub struct AppState {
    pub webauthn: Webauthn,
    // (auth_state, created_at, system_user, app_username)
    pending_auth: Mutex<HashMap<String, (SecurityKeyAuthentication, Instant, String, String)>>,
    pending_reg: Mutex<HashMap<String, (SecurityKeyRegistration, Instant, String, Uuid)>>,
    // (created_at, system_user, app_username)
    pending_totp: Mutex<HashMap<String, (Instant, String, String)>>,
}

impl AppState {
    pub fn new() -> Self {
        let rp_origin = Url::parse(RP_ORIGIN).expect("Invalid RP origin");
        let webauthn = WebauthnBuilder::new(RP_ID, &rp_origin)
            .expect("Invalid WebAuthn config")
            .rp_name("Server Dashboard")
            .build()
            .expect("Failed to build WebAuthn");
        Self {
            webauthn,
            pending_auth: Mutex::new(HashMap::new()),
            pending_reg: Mutex::new(HashMap::new()),
            pending_totp: Mutex::new(HashMap::new()),
        }
    }
}

fn secret_path() -> PathBuf {
    PathBuf::from("/var/lib/server-dash-api/jwt_secret")
}

fn generate_secret() -> String {
    format!(
        "{:016x}{:016x}",
        rand::random::<u64>(),
        rand::random::<u64>()
    )
}

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

pub fn jwt_secret() -> &'static str {
    JWT_SECRET.get_or_init(|| {
        let path = secret_path();
        std::fs::create_dir_all(path.parent().unwrap()).ok();

        if let Ok(contents) = std::fs::read_to_string(&path) {
            if let Some((ts_str, secret)) = contents.trim().split_once(':') {
                if let Ok(ts) = ts_str.parse::<u64>() {
                    if current_timestamp() - ts < ROTATION_DAYS * 86400 {
                        return secret.to_string();
                    }
                    println!("JWT secret expired, rotating...");
                }
            }
        }

        let secret = generate_secret();
        let contents = format!("{}:{}", current_timestamp(), secret);
        std::fs::write(&path, &contents).ok();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).ok();
        }

        println!("Generated new JWT secret");
        secret
    })
}

#[derive(Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: usize,
}

pub fn create_token(username: &str) -> String {
    let claims = Claims {
        sub: username.to_owned(),
        exp: (chrono::Utc::now() + chrono::Duration::hours(8)).timestamp() as usize,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret().as_bytes()),
    )
    .unwrap()
}

pub fn get_token_subject(headers: &HeaderMap) -> Option<String> {
    let val = headers.get("Authorization")?.to_str().ok()?;
    let token = val.strip_prefix("Bearer ")?;
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret().as_bytes()),
        &Validation::default(),
    )
    .ok()?;
    Some(data.claims.sub)
}

pub fn verify_token(headers: &HeaderMap) -> bool {
    let Some(val) = headers.get("Authorization") else {
        return false;
    };
    let token = val.to_str().unwrap_or("").replace("Bearer ", "");
    decode::<Claims>(
        &token,
        &DecodingKey::from_secret(jwt_secret().as_bytes()),
        &Validation::default(),
    )
    .is_ok()
}

pub fn decode_basic_auth(headers: &HeaderMap) -> Option<(String, String)> {
    let val = headers.get("Authorization")?.to_str().ok()?;
    let encoded = val.strip_prefix("Basic ")?;
    let decoded = general_purpose::STANDARD.decode(encoded).ok()?;
    let s = String::from_utf8(decoded).ok()?;
    let (user, password) = s.split_once(':')?;
    Some((user.to_string(), password.to_string()))
}

pub(crate) fn verify_password(username: &str, password: &str) -> bool {
    let shadow = match std::fs::read_to_string("/etc/shadow") {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to read /etc/shadow: {}", e);
            return false;
        }
    };
    for line in shadow.lines() {
        let mut fields = line.splitn(3, ':');
        let user = fields.next().unwrap_or("");
        let hash = fields.next().unwrap_or("");
        if user != username {
            continue;
        }
        return verify_shadow_hash(password, hash);
    }
    eprintln!("User '{}' not found in shadow", username);
    false
}

fn verify_shadow_hash(password: &str, hash: &str) -> bool {
    use yescrypt::{PasswordHash, PasswordVerifier, Yescrypt};
    match PasswordHash::new(hash) {
        Ok(h) => Yescrypt::default().verify_password(password.as_bytes(), &h).is_ok(),
        Err(_) => false,
    }
}

pub(crate) fn load_credentials(username: &str) -> Option<StoredCredentials> {
    let path = PathBuf::from(CREDENTIAL_DIR).join(format!("{}.json", username));
    let data = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

pub(crate) fn save_credentials(username: &str, creds: &StoredCredentials) -> Result<(), String> {
    let dir = PathBuf::from(CREDENTIAL_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", username));
    let data = serde_json::to_string(creds).map_err(|e| e.to_string())?;
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).ok();
    }
    Ok(())
}

fn generate_session_id() -> String {
    format!(
        "{:016x}{:016x}",
        rand::random::<u64>(),
        rand::random::<u64>()
    )
}

pub async fn require_auth(headers: HeaderMap, request: Request<Body>, next: Next) -> Response {
    if verify_token(&headers) {
        next.run(request).await
    } else {
        (StatusCode::UNAUTHORIZED, "Unauthorized").into_response()
    }
}

// POST /auth/login — verifies password, returns WebAuthn challenge and/or TOTP flag
pub async fn post_login(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let (username, password) = match decode_basic_auth(&headers) {
        Some(c) => c,
        None => {
            return (StatusCode::UNAUTHORIZED, "Missing or invalid Authorization header")
                .into_response()
        }
    };

    // Check app credentials first; only fall back to /etc/shadow if explicitly enabled
    let (system_user, app_username) = {
        let all = crate::app_credentials::load_all();
        if let Some(cred) = all.iter().find(|c| c.username == username) {
            if !crate::app_credentials::verify_app_password(&password, &cred.password_hash) {
                return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
            }
            // Use system_user for 2FA lookups if set, otherwise use app username
            let effective = cred.system_user.clone().unwrap_or_else(|| username.clone());
            (effective, username.clone())
        } else {
            if !crate::settings::load().allow_system_login {
                return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
            }
            if !verify_password(&username, &password) {
                return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
            }
            (username.clone(), username.clone())
        }
    };

    let stored_webauthn = load_credentials(&system_user);
    let has_totp = crate::totp::has_totp(&system_user);

    // No 2FA registered — issue token directly so the user can enroll
    if stored_webauthn.is_none() && !has_totp {
        eprintln!("Warning: no 2FA registered for '{}', issuing password-only token", system_user);
        let token = create_token(&app_username);
        return (
            StatusCode::OK,
            Json(serde_json::json!({
                "token": token,
                "no_2fa": true,
            })),
        )
            .into_response();
    }

    let session_id = generate_session_id();

    if has_totp {
        let mut pending = state.pending_totp.lock().unwrap();
        pending.retain(|_, (t, _, _)| t.elapsed() < CHALLENGE_TTL);
        pending.insert(session_id.clone(), (Instant::now(), system_user.clone(), app_username.clone()));
    }

    if let Some(stored) = stored_webauthn {
        println!("Authentication: {} credential(s) found for {}", stored.credentials.len(), system_user);

        let (rcr, auth_state) = match state
            .webauthn
            .start_securitykey_authentication(&stored.credentials)
        {
            Ok(r) => r,
            Err(e) => {
                println!("WebAuthn start auth error: {:?}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "WebAuthn error").into_response();
            }
        };

        {
            let mut pending = state.pending_auth.lock().unwrap();
            pending.retain(|_, (_, t, _, _)| t.elapsed() < CHALLENGE_TTL);
            pending.insert(session_id.clone(), (auth_state, Instant::now(), system_user.clone(), app_username.clone()));
        }

        return (
            StatusCode::OK,
            Json(serde_json::json!({
                "session_id": session_id,
                "challenge": rcr,
                "has_totp": has_totp,
            })),
        )
            .into_response();
    }

    // TOTP only — no WebAuthn credentials
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "session_id": session_id,
            "challenge": null,
            "has_totp": true,
        })),
    )
        .into_response()
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    session_id: String,
    credential: PublicKeyCredential,
}

// POST /auth/verify — verifies the YubiKey assertion and returns a JWT
pub async fn post_verify(
    State(state): State<Arc<AppState>>,
    Json(body): Json<VerifyRequest>,
) -> impl IntoResponse {
    let (auth_state, system_user, app_username) = {
        let mut pending = state.pending_auth.lock().unwrap();
        match pending.remove(&body.session_id) {
            Some((s, created, sys_u, app_u)) if created.elapsed() < CHALLENGE_TTL => (s, sys_u, app_u),
            Some(_) => return (StatusCode::UNAUTHORIZED, "Challenge expired").into_response(),
            None => return (StatusCode::UNAUTHORIZED, "Invalid session").into_response(),
        }
    };

    let auth_result = match state
        .webauthn
        .finish_securitykey_authentication(&body.credential, &auth_state)
    {
        Ok(r) => r,
        Err(e) => {
            println!("WebAuthn finish auth error: {:?}", e);
            return (StatusCode::UNAUTHORIZED, "WebAuthn verification failed").into_response();
        }
    };

    // Persist updated credential counter
    if let Some(mut stored) = load_credentials(&system_user) {
        for cred in &mut stored.credentials {
            cred.update_credential(&auth_result);
        }
        save_credentials(&system_user, &stored).ok();
    }

    let token = create_token(&app_username);
    (StatusCode::OK, Json(serde_json::json!({ "token": token }))).into_response()
}

#[derive(Deserialize)]
pub struct VerifyTotpRequest {
    session_id: String,
    code: String,
}

// POST /auth/verify-totp — verifies a TOTP code and issues a JWT
pub async fn post_verify_totp(
    State(state): State<Arc<AppState>>,
    Json(body): Json<VerifyTotpRequest>,
) -> impl IntoResponse {
    let (system_user, app_username) = {
        let mut pending = state.pending_totp.lock().unwrap();
        match pending.remove(&body.session_id) {
            Some((created, sys_u, app_u)) if created.elapsed() < CHALLENGE_TTL => (sys_u, app_u),
            Some(_) => return (StatusCode::UNAUTHORIZED, "Session expired").into_response(),
            None => return (StatusCode::UNAUTHORIZED, "Invalid session").into_response(),
        }
    };

    if !crate::totp::verify_totp_code(&system_user, &body.code) {
        return (StatusCode::UNAUTHORIZED, "Invalid TOTP code").into_response();
    }

    // Invalidate any concurrent WebAuthn session for the same session_id
    state.pending_auth.lock().unwrap().remove(&body.session_id);

    let token = create_token(&app_username);
    (StatusCode::OK, Json(serde_json::json!({ "token": token }))).into_response()
}

// POST /auth/register/start — verifies password, returns a WebAuthn registration challenge
pub async fn post_register_start(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let (username, password) = match decode_basic_auth(&headers) {
        Some(c) => c,
        None => {
            return (StatusCode::UNAUTHORIZED, "Missing or invalid Authorization header")
                .into_response()
        }
    };

    if !verify_password(&username, &password) {
        return (StatusCode::UNAUTHORIZED, "Invalid credentials").into_response();
    }

    let user_id = Uuid::new_v4();

    let (ccr, reg_state) = match state
        .webauthn
        .start_securitykey_registration(user_id, &username, &username, None, None, None)
    {
        Ok(r) => r,
        Err(e) => {
            println!("WebAuthn start reg error: {:?}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "WebAuthn error").into_response();
        }
    };

    let session_id = generate_session_id();
    {
        let mut pending = state.pending_reg.lock().unwrap();
        pending.retain(|_, (_, t, _, _)| t.elapsed() < CHALLENGE_TTL);
        pending.insert(
            session_id.clone(),
            (reg_state, Instant::now(), username, user_id),
        );
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "session_id": session_id,
            "challenge": ccr,
        })),
    )
        .into_response()
}

#[derive(Deserialize)]
pub struct RegisterFinishRequest {
    session_id: String,
    credential: RegisterPublicKeyCredential,
    #[serde(default)]
    label: Option<String>,
}

// POST /auth/register/finish — completes YubiKey enrollment and saves the credential
pub async fn post_register_finish(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterFinishRequest>,
) -> impl IntoResponse {
    let (reg_state, username, user_id) = {
        let mut pending = state.pending_reg.lock().unwrap();
        match pending.remove(&body.session_id) {
            Some((s, created, u, id)) if created.elapsed() < CHALLENGE_TTL => (s, u, id),
            Some(_) => return (StatusCode::UNAUTHORIZED, "Challenge expired").into_response(),
            None => return (StatusCode::UNAUTHORIZED, "Invalid session").into_response(),
        }
    };

    let passkey = match state
        .webauthn
        .finish_securitykey_registration(&body.credential, &reg_state)
    {
        Ok(p) => p,
        Err(e) => {
            println!("WebAuthn finish reg error: {:?}", e);
            return (StatusCode::BAD_REQUEST, "WebAuthn registration failed").into_response();
        }
    };

    let path = std::path::PathBuf::from(CREDENTIAL_DIR).join(format!("{}.json", username));
    let mut stored = if path.exists() {
        match load_credentials(&username) {
            Some(s) => {
                println!("Loaded {} existing credential(s) for {}", s.credentials.len(), username);
                s
            }
            None => {
                println!("ERROR: credential file exists for {} but could not be parsed — refusing to overwrite", username);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read existing credentials").into_response();
            }
        }
    } else {
        StoredCredentials {
            user_id,
            credentials: vec![],
            labels: HashMap::new(),
        }
    };

    let cred_id_str = general_purpose::URL_SAFE_NO_PAD.encode(passkey.cred_id());
    stored.credentials.push(passkey);
    if let Some(label) = body.label.as_deref().map(str::trim).filter(|l| !l.is_empty()) {
        stored.labels.insert(cred_id_str, label.to_string());
    }
    println!("Saving {} credential(s) for {}", stored.credentials.len(), username);

    if let Err(e) = save_credentials(&username, &stored) {
        println!("Failed to save credentials: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to save credential").into_response();
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "message": "YubiKey registered successfully" })),
    )
        .into_response()
}
