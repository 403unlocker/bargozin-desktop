use std::net::IpAddr;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use std::process::Command;
use std::str::FromStr;

#[cfg(target_os = "windows")]
mod windows;

pub fn validate_dns_ip(dns: &str) -> Result<(), String> {
    IpAddr::from_str(dns.trim()).map_err(|_| "Invalid DNS address".to_string())?;
    Ok(())
}

pub fn set_system_dns_sync(dns_server: &str) -> Result<String, String> {
    validate_dns_ip(dns_server)?;
    let dns = dns_server.trim();

    #[cfg(target_os = "macos")]
    return set_dns_macos(dns);

    #[cfg(target_os = "windows")]
    return windows::set_dns_windows(dns);

    #[cfg(target_os = "linux")]
    return set_dns_linux(dns);

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return Err("Unsupported operating system".to_string());
}

#[tauri::command]
pub async fn set_system_dns(dns_server: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || set_system_dns_sync(&dns_server))
        .await
        .map_err(|e| format!("Internal error: {}", e))?
}

pub fn reset_system_dns_sync() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    return reset_dns_macos();

    #[cfg(target_os = "windows")]
    return windows::reset_dns_windows();

    #[cfg(target_os = "linux")]
    return reset_dns_linux();

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    return Err("Unsupported operating system".to_string());
}

#[tauri::command]
pub async fn reset_system_dns() -> Result<String, String> {
    tokio::task::spawn_blocking(reset_system_dns_sync)
        .await
        .map_err(|e| format!("Internal error: {}", e))?
}

#[cfg(target_os = "macos")]
fn set_dns_macos(dns: &str) -> Result<String, String> {
    let service = get_active_network_service()?;
    let escaped_service = escape_for_shell(&service);
    let script = format!(
        "networksetup -setdnsservers \"{escaped_service}\" {dns} && dscacheutil -flushcache && killall -HUP mDNSResponder"
    );
    run_osascript_admin(&script)?;
    Ok(format!("DNS set to {dns} on {service}"))
}

#[cfg(target_os = "macos")]
fn get_active_network_service() -> Result<String, String> {
    let route_output = Command::new("route")
        .args(["-n", "get", "default"])
        .output()
        .map_err(|e| format!("Failed to detect network interface: {e}"))?;

    let route_str = String::from_utf8_lossy(&route_output.stdout);
    let interface = route_str
        .lines()
        .find(|line| line.trim().starts_with("interface:"))
        .and_then(|line| line.split(':').nth(1))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "No active network interface found".to_string())?;

    let hw_output = Command::new("networksetup")
        .arg("-listallhardwareports")
        .output()
        .map_err(|e| format!("Failed to list network services: {e}"))?;

    let hw_str = String::from_utf8_lossy(&hw_output.stdout);
    let mut current_port = String::new();

    for line in hw_str.lines() {
        if let Some(port) = line.strip_prefix("Hardware Port:") {
            current_port = port.trim().to_string();
        } else if let Some(device) = line.strip_prefix("Device:") {
            if device.trim() == interface {
                return Ok(current_port);
            }
        }
    }

    for fallback in ["Wi-Fi", "Ethernet"] {
        if network_service_exists(fallback) {
            return Ok(fallback.to_string());
        }
    }

    Err("No supported network service found".to_string())
}

#[cfg(target_os = "macos")]
fn network_service_exists(service: &str) -> bool {
    Command::new("networksetup")
        .args(["-getdnsservers", service])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn run_osascript_admin(script: &str) -> Result<(), String> {
    let escaped = script.replace('\\', "\\\\").replace('"', "\\\"");
    let osa = format!("do shell script \"{escaped}\" with administrator privileges");

    let output = Command::new("osascript")
        .args(["-e", &osa])
        .output()
        .map_err(|e| format!("Failed to run command: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("User canceled") || stderr.contains("-128") {
        return Err("Operation cancelled by user".to_string());
    }

    Err(format!("Failed to set DNS: {}", stderr.trim()))
}

#[cfg(target_os = "linux")]
fn set_dns_linux(dns: &str) -> Result<String, String> {
    if command_exists("nmcli") {
        return set_dns_nmcli(dns);
    }

    if command_exists("resolvectl") {
        return set_dns_resolvectl(dns);
    }

    Err("NetworkManager (nmcli) or systemd-resolved (resolvectl) is required".to_string())
}

#[cfg(target_os = "linux")]
fn set_dns_nmcli(dns: &str) -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(["-t", "-f", "NAME", "con", "show", "--active"])
        .output()
        .map_err(|e| format!("Failed to detect active connection: {e}"))?;

    let connection = String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| "No active network connection found".to_string())?
        .trim()
        .to_string();

    let script = format!(
        "nmcli con mod \"{connection}\" ipv4.dns \"{dns}\" ipv4.ignore-auto-dns yes && nmcli con up \"{connection}\""
    );
    run_pkexec(&script)?;
    Ok(format!("DNS set to {dns} on {connection}"))
}

#[cfg(target_os = "linux")]
fn set_dns_resolvectl(dns: &str) -> Result<String, String> {
    let output = Command::new("ip")
        .args(["route", "show", "default"])
        .output()
        .map_err(|e| format!("Failed to detect network interface: {e}"))?;

    let interface = String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .nth(4)
        .ok_or_else(|| "No active network interface found".to_string())?
        .to_string();

    let script = format!("resolvectl dns {interface} {dns} && resolvectl flush-caches");
    run_pkexec(&script)?;
    Ok(format!("DNS set to {dns} on {interface}"))
}

#[cfg(target_os = "linux")]
fn run_pkexec(script: &str) -> Result<(), String> {
    let output = Command::new("pkexec")
        .args(["sh", "-c", script])
        .output()
        .map_err(|e| format!("Failed to run command: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains(" dismissed") || stderr.contains("Not authorized") {
        return Err("Operation cancelled or not authorized".to_string());
    }

    Err(format!("Failed to set DNS: {}", stderr.trim()))
}

#[cfg(target_os = "linux")]
fn command_exists(command: &str) -> bool {
    Command::new("which")
        .arg(command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn reset_dns_macos() -> Result<String, String> {
    let service = get_active_network_service()?;
    let escaped_service = escape_for_shell(&service);
    let script = format!(
        "networksetup -setdnsservers \"{escaped_service}\" empty && dscacheutil -flushcache && killall -HUP mDNSResponder"
    );
    run_osascript_admin(&script)?;
    Ok(format!("DNS reset to automatic (DHCP) on {service}"))
}

#[cfg(target_os = "linux")]
fn reset_dns_linux() -> Result<String, String> {
    if command_exists("nmcli") {
        return reset_dns_nmcli();
    }
    if command_exists("resolvectl") {
        return reset_dns_resolvectl();
    }
    Err("NetworkManager (nmcli) or systemd-resolved (resolvectl) is required".to_string())
}

#[cfg(target_os = "linux")]
fn reset_dns_nmcli() -> Result<String, String> {
    let output = Command::new("nmcli")
        .args(["-t", "-f", "NAME", "con", "show", "--active"])
        .output()
        .map_err(|e| format!("Failed to detect active connection: {e}"))?;

    let connection = String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| "No active network connection found".to_string())?
        .trim()
        .to_string();

    let script = format!(
        "nmcli con mod \"{connection}\" ipv4.dns \"\" ipv4.ignore-auto-dns no && nmcli con up \"{connection}\""
    );
    run_pkexec(&script)?;
    Ok(format!("DNS reset to automatic (DHCP) on {connection}"))
}

#[cfg(target_os = "linux")]
fn reset_dns_resolvectl() -> Result<String, String> {
    let output = Command::new("ip")
        .args(["route", "show", "default"])
        .output()
        .map_err(|e| format!("Failed to detect network interface: {e}"))?;

    let interface = String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .nth(4)
        .ok_or_else(|| "No active network interface found".to_string())?
        .to_string();

    let script = format!("resolvectl revert {interface} && resolvectl flush-caches");
    run_pkexec(&script)?;
    Ok(format!("DNS reset to automatic on {interface}"))
}

#[cfg(target_os = "macos")]
fn escape_for_shell(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}
