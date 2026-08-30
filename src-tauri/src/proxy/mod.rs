use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

static SETTINGS_LOCKED: AtomicBool = AtomicBool::new(false);

pub fn set_settings_locked(locked: bool) {
    SETTINGS_LOCKED.store(locked, Ordering::SeqCst);
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyMode {
    None,
    System,
    Custom,
}

impl Default for ProxyMode {
    fn default() -> Self {
        Self::None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyProtocol {
    Http,
    Socks5,
}

impl Default for ProxyProtocol {
    fn default() -> Self {
        Self::Http
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProxySettings {
    pub mode: ProxyMode,
    pub protocol: ProxyProtocol,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
}

impl ProxySettings {
    fn custom_url(&self, remote_dns: bool) -> Result<String, String> {
        let host = self.host.trim();
        if host.is_empty() || self.port == 0 {
            return Err("Please enter a proxy host and port".to_string());
        }

        let mut scheme = match self.protocol {
            ProxyProtocol::Http => "http",
            ProxyProtocol::Socks5 => "socks5",
        };

        if remote_dns && matches!(self.protocol, ProxyProtocol::Socks5) {
            scheme = "socks5h";
        }

        let mut parsed = url::Url::parse(&format!("{scheme}://{host}:{port}", port = self.port))
            .map_err(|e| format!("Invalid proxy address: {e}"))?;

        if !self.username.trim().is_empty() {
            parsed
                .set_username(self.username.trim())
                .map_err(|_| "Invalid proxy username".to_string())?;
            parsed
                .set_password(Some(&self.password))
                .map_err(|_| "Invalid proxy password".to_string())?;
        }

        Ok(parsed.to_string())
    }
}

lazy_static::lazy_static! {
    static ref PROXY_SETTINGS: Mutex<ProxySettings> = Mutex::new(ProxySettings::default());
}

pub fn current_settings() -> ProxySettings {
    PROXY_SETTINGS
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn set_proxy_settings(settings: ProxySettings) -> Result<ProxySettings, String> {
    if SETTINGS_LOCKED.load(Ordering::SeqCst) {
        return Err("Cannot change proxy settings while a test is running".to_string());
    }

    if settings.mode == ProxyMode::Custom {
        settings.custom_url(true)?;
    }

    let mut guard = PROXY_SETTINGS
        .lock()
        .map_err(|_| "Failed to update proxy settings".to_string())?;
    *guard = settings.clone();
    Ok(settings)
}

#[tauri::command]
pub async fn get_proxy_settings() -> ProxySettings {
    current_settings()
}

#[tauri::command]
pub async fn check_proxy_reachable() -> Result<bool, String> {
    let settings = current_settings();
    if settings.mode == ProxyMode::None {
        return Ok(false);
    }

    let client_builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .connect_timeout(std::time::Duration::from_secs(4));

    let client_builder = apply_reqwest_proxy(client_builder);
    let client = client_builder.build().map_err(|e| e.to_string())?;

    match client.head("https://www.gstatic.com/generate_204").send().await {
        Ok(resp) => Ok(resp.status().is_success() || resp.status().as_u16() == 204),
        Err(_) => Ok(false),
    }
}

pub fn apply_reqwest_proxy(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    let settings = current_settings();
    match settings.mode {
        ProxyMode::None => builder.no_proxy(),
        ProxyMode::System => builder,
        ProxyMode::Custom => match settings.custom_url(true).and_then(|url| {
            reqwest::Proxy::all(url).map_err(|e| e.to_string())
        }) {
            Ok(proxy) => builder.proxy(proxy),
            Err(e) => {
                eprintln!("Invalid custom proxy, falling back to no proxy: {e}");
                builder.no_proxy()
            }
        },
    }
}

pub fn apply_ureq_proxy(builder: ureq::AgentBuilder) -> ureq::AgentBuilder {
    let settings = current_settings();
    match settings.mode {
        ProxyMode::None => builder,
        ProxyMode::System => {
            if let Some(proxy) = env_proxy() {
                builder.proxy(proxy)
            } else {
                builder
            }
        }
        ProxyMode::Custom => match settings
            .custom_url(false)
            .and_then(|url| ureq::Proxy::new(&url).map_err(|e| e.to_string()))
        {
            Ok(proxy) => builder.proxy(proxy),
            Err(e) => {
                eprintln!("Invalid custom ureq proxy: {e}");
                builder
            }
        },
    }
}

fn env_proxy() -> Option<ureq::Proxy> {
    const KEYS: &[&str] = &[
        "ALL_PROXY",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "all_proxy",
        "https_proxy",
        "http_proxy",
    ];

    for key in KEYS {
        if let Ok(value) = std::env::var(key) {
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            if let Ok(proxy) = ureq::Proxy::new(value) {
                return Some(proxy);
            }
        }
    }

    None
}
