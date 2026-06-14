use serde::Deserialize;
use std::sync::Arc;

pub const CONFIG_PATH: &str = "/etc/server-dash/config.toml";

const DEFAULT_CONFIG: &str = r#"# server-dash configuration
# Set useDefaultConfig = false and fill in your settings below.

useDefaultConfig = true

[features]
# Set to false to disable all Tapo smart-plug features (polling, power routes, history).
tapo = true

# Set to true to open the /enroll registration flow so new users can register.
# Keep false after initial setup.
enrollment_open = false

[tapo]
# Your Tapo account credentials (the email/password used in the Tapo mobile app).
username = ""
password = ""

# Subnet to scan for Tapo devices (e.g. "192.168.1").
# Leave commented out to auto-detect from the local network interface.
# subnet = "192.168.1"

[server]
# LAN IP of this server — used as the callback URL registered with ESP32 smart buttons.
# Leave commented out to auto-detect.
# dellserv_ip = "192.168.1.100"
"#;

#[derive(Deserialize, Clone, Default)]
pub struct Config {
    /// When true (or when no config file exists), all settings are ignored and
    /// defaults are used. Set to false once you have filled in your configuration.
    #[serde(rename = "useDefaultConfig", default)]
    pub use_default_config: bool,
    #[serde(default)]
    pub features: FeaturesConfig,
    #[serde(default)]
    pub tapo: TapoConfig,
    #[serde(default)]
    pub server: ServerConfig,
}

#[derive(Deserialize, Clone)]
pub struct FeaturesConfig {
    #[serde(default = "default_true")]
    pub tapo: bool,
    #[serde(default)]
    pub enrollment_open: bool,
}

fn default_true() -> bool {
    true
}

impl Default for FeaturesConfig {
    fn default() -> Self {
        Self {
            tapo: true,
            enrollment_open: false,
        }
    }
}

#[derive(Deserialize, Clone, Default)]
pub struct TapoConfig {
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    /// Subnet to scan (e.g. "192.168.1"). Auto-detected from the local interface if absent.
    pub subnet: Option<String>,
}

impl TapoConfig {
    pub fn is_configured(&self) -> bool {
        !self.username.is_empty() && !self.password.is_empty()
    }
}

#[derive(Deserialize, Clone, Default)]
pub struct ServerConfig {
    /// LAN IP of this server — used as the ESP32 smart-button callback host.
    /// Auto-detected via UDP if absent.
    pub dellserv_ip: Option<String>,
}

pub fn load() -> Arc<Config> {
    let path = std::path::Path::new(CONFIG_PATH);

    if !path.exists() {
        match create_default_config() {
            Ok(()) => eprintln!("server-dash: created default config at {CONFIG_PATH}"),
            Err(e) => eprintln!("server-dash: could not create config at {CONFIG_PATH}: {e}"),
        }
        return Arc::new(Config::default());
    }

    let s = match std::fs::read_to_string(CONFIG_PATH) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("server-dash: could not read {CONFIG_PATH}: {e}");
            return Arc::new(Config::default());
        }
    };

    let cfg = match toml::from_str::<Config>(&s) {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("server-dash: config error in {CONFIG_PATH}: {e}");
            return Arc::new(Config::default());
        }
    };

    if cfg.use_default_config {
        eprintln!("server-dash: useDefaultConfig = true, using defaults");
        return Arc::new(Config::default());
    }

    eprintln!("server-dash: loaded config from {CONFIG_PATH}");
    Arc::new(cfg)
}

fn create_default_config() -> std::io::Result<()> {
    if let Some(parent) = std::path::Path::new(CONFIG_PATH).parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(CONFIG_PATH, DEFAULT_CONFIG)
}
