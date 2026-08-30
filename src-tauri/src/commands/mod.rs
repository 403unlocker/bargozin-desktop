use crate::dns::{test_download_speed_with_dns, test_single_dns_server, DNS_SERVERS};
use crate::docker::{
    docker_config_path, download_docker_config_file, read_docker_registries_file,
    test_docker_registry_download_speed, validate_docker_image_name, DOCKER_CONFIG_URL,
};
use crate::task_control::{is_cancelled, request_cancel, reset_cancel};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

async fn spawn_with_cleanup<F, Fut>(
    task_key: String,
    task_fn: F,
)
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    let task_key_for_cleanup = task_key.clone();
    let task_key_for_log = task_key.clone();
    
    let handle = tokio::spawn(async move {
        task_fn().await;
        let mut active_tasks = ACTIVE_TASKS.lock().unwrap();
        active_tasks.remove(&task_key_for_cleanup);
        crate::proxy::set_settings_locked(!active_tasks.is_empty());
        println!("Cleaned up completed task: {}", task_key_for_cleanup);
    });
    
    {
        let mut active_tasks = ACTIVE_TASKS.lock().unwrap();
        active_tasks.insert(task_key, vec![handle]);
        crate::proxy::set_settings_locked(true);
        println!("Added task to active_tasks: {}", task_key_for_log);
    }
}

lazy_static::lazy_static! {
    static ref ACTIVE_TASKS: Arc<Mutex<HashMap<String, Vec<JoinHandle<()>>>>> = Arc::new(Mutex::new(HashMap::new()));
}

#[tauri::command]
pub async fn test_dns_servers(domain: String, app_handle: AppHandle) -> Result<(), String> {
    println!("Testing DNS servers for domain: {}", domain);

    {
        let result = abort_all_tasks().await;
        if let Err(e) = result {
            eprintln!("Failed to abort all tasks: {}", e);
        }
    }
    reset_cancel();

    let domain = domain.trim().to_string();

    if domain.is_empty() {
        return Err("Please enter a valid domain name".to_string());
    }

    let results_count = Arc::new(Mutex::new(1));

    for &dns_server in DNS_SERVERS {
        let domain_clone = domain.clone();
        let dns_server_string = dns_server.to_string();
        let app_handle_clone = app_handle.clone();
        let results_count_clone = Arc::clone(&results_count);
        let task_key = domain.clone() + "-" + dns_server;

        spawn_with_cleanup(task_key.clone(), move || async move {
            let result = test_single_dns_server(domain_clone, dns_server_string, 0).await;

            if let Err(e) = app_handle_clone.emit("dns-test-result", &result) {
                eprintln!("Failed to emit DNS test result: {}", e);
            }
            let mut result_count = results_count_clone.lock().unwrap();
            *result_count += 1;

            if *result_count == DNS_SERVERS.len() {
                if let Err(e) = app_handle_clone.emit("dns-test-complete", ()) {
                    eprintln!("Failed to emit completion event: {}", e);
                }
            }
        }).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn test_download_speed_all_dns(
    url: String,
    timeout_seconds: u64,
    app_handle: AppHandle,
) -> Result<(), String> {
    {
        let result = abort_all_tasks().await;
        if let Err(e) = result {
            eprintln!("Failed to abort all tasks: {}", e);
        }
    }
    reset_cancel();

    let url = url.trim().to_string();

    if url.is_empty() {
        return Err("Please enter a valid URL".to_string());
    }

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL must start with http:// or https://".to_string());
    }

    let url_for_storage = url.clone();

    spawn_with_cleanup(url_for_storage.clone(), move || async move {
        println!("Starting download tests for URL: {}", url);

        for (index, &dns_server) in DNS_SERVERS.iter().enumerate() {
            if is_cancelled() {
                println!("Download tests cancelled, stopping before {}", dns_server);
                break;
            }

            println!(
                "Testing DNS server {} ({}/{}): {}",
                dns_server,
                index + 1,
                DNS_SERVERS.len(),
                dns_server
            );

            let url_clone = url.clone();
            let dns_server_string = dns_server.to_string();
            let app_handle_clone = app_handle.clone();

            let result =
                test_download_speed_with_dns(url_clone, dns_server_string, timeout_seconds, 0)
                    .await;

            if is_cancelled() {
                println!("Download tests cancelled after {}", dns_server);
                break;
            }

            println!(
                "Download test result for {}: success={}, speed={:.3} Mbps",
                result.dns_server, result.success, result.download_speed_mbps
            );

            if let Err(e) = app_handle_clone.emit("download-test-result", &result) {
                eprintln!("Failed to emit download test result: {}", e);
            } else {
                println!("Successfully emitted result for {}", result.dns_server);
            }
        }

        println!("All download tests completed");
        if let Err(e) = app_handle.emit("download-test-complete", ()) {
            eprintln!("Failed to emit completion event: {}", e);
        } else {
            println!("Successfully emitted completion event");
        }
    }).await;

    Ok(())
}

#[tauri::command]
pub async fn test_docker_registries(
    image_name: String,
    timeout_seconds: u64,
    app_handle: AppHandle,
) -> Result<(), String> {
    let image_name = image_name.trim().to_string();

    if image_name.is_empty() {
        return Err("Please enter a valid Docker image name".to_string());
    }

    if !validate_docker_image_name(&image_name) {
        return Err("Invalid Docker image name format".to_string());
    }

    println!("Starting Docker registry tests for image: {}", image_name);

    {
        let result = abort_all_tasks().await;
        if let Err(e) = result {
            eprintln!("Failed to abort all tasks: {}", e);
        }
    }
    reset_cancel();

    // Get registries list
    let docker_file_path = docker_config_path();
    let registries = match read_docker_registries_file(&docker_file_path).await {
        Ok(list) => list,
        Err(_) => {
            // Download config file if it doesn't exist
            if let Err(e) = download_docker_config_file(DOCKER_CONFIG_URL, &docker_file_path).await
            {
                return Err(format!("Failed to download Docker registry config: {}", e));
            }
            match read_docker_registries_file(&docker_file_path).await {
                Ok(list) => list,
                Err(e) => {
                    return Err(format!("Failed to read Docker registry config: {}", e));
                }
            }
        }
    };

    println!(
        "Testing {} registries sequentially with {}s timeout",
        registries.len(),
        timeout_seconds
    );

    let image_name_for_task = image_name.clone();
    spawn_with_cleanup(image_name.clone(), move || async move {
        for (index, registry) in registries.iter().enumerate() {
            if is_cancelled() {
                println!("Docker registry tests cancelled, stopping before {}", registry);
                break;
            }

            println!(
                "Testing registry {}/{}: {}",
                index + 1,
                registries.len(),
                registry
            );

            let mut result = test_docker_registry_download_speed(
                registry,
                &image_name_for_task,
                timeout_seconds,
            )
            .await;

            if is_cancelled() {
                println!("Docker registry tests cancelled after {}", registry);
                break;
            }

            // Set the session ID to 0
            result.session_id = 0;

            println!(
                "Registry {} test completed: success={}, speed={:.2} Mbps",
                registry, result.success, result.download_speed_mbps
            );

            // Emit result immediately
            if let Err(e) = app_handle.emit("docker-registry-test-result", &result) {
                eprintln!("Failed to emit Docker registry test result: {}", e);
            } else {
                println!("Successfully emitted result for {}", registry);
            }
        }

        // All tests completed
        println!("All Docker registry tests completed");
        if let Err(e) = app_handle.emit("docker-registry-test-complete", ()) {
            eprintln!(
                "Failed to emit Docker registry test completion event: {}",
                e
            );
        } else {
            println!("Successfully emitted completion event");
        }
    }).await;

    Ok(())
}

#[tauri::command]
pub async fn validate_docker_image(image_name: String) -> Result<bool, String> {
    Ok(validate_docker_image_name(&image_name))
}

#[tauri::command]
pub async fn has_active_tasks() -> bool {
    let active_tasks = ACTIVE_TASKS.lock().unwrap();
    !active_tasks.is_empty()
}

#[tauri::command]
pub async fn get_active_task_count() -> usize {
    let active_tasks = ACTIVE_TASKS.lock().unwrap();
    active_tasks.len()
}

#[tauri::command]
pub async fn abort_all_tasks() -> Result<(), String> {
    request_cancel();

    let mut active_tasks = ACTIVE_TASKS.lock().unwrap();
    println!("Aborting All Tasks, total tasks: {}", active_tasks.len());

    // Collect all keys to remove after aborting
    let keys_to_remove: Vec<String> = active_tasks.keys().cloned().collect();
    println!("Keys to abort: {:?}", keys_to_remove);

    for key in &keys_to_remove {
        if let Some(handles) = active_tasks.get(key) {
            println!("Aborting Task {} with {} handles", key, handles.len());
            for (i, handle) in handles.iter().enumerate() {
                handle.abort();
                println!("Aborted handle {} for task {}", i, key);
            }
            println!("Aborted Task {}", key);
        }
    }

    // Clear all tasks from storage
    active_tasks.clear();
    crate::proxy::set_settings_locked(false);
    println!("Cleared {} tasks from storage", keys_to_remove.len());

    Ok(())
}
