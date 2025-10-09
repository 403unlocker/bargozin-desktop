mod dns;
mod docker;
mod commands;
mod utils;
mod system_dns;

pub use dns::{DnsTestResult, DownloadSpeedResult};
pub use commands::*;
pub use utils::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![test_dns_servers, test_download_speed_all_dns, test_docker_registries, validate_docker_image, abort_all_tasks])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
