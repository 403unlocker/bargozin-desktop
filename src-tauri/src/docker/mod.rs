use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use anyhow::Result;
use regex::Regex;
use std::io::Read;
use futures_util::StreamExt;

use crate::task_control::is_cancelled;

mod get_manifest;
use get_manifest::{fetch_tag_manifest, fetch_digest_manifest};

pub const DOCKER_CONFIG_URL: &str = "https://raw.githubusercontent.com/403unlocker/403Unlocker-cli/refs/heads/main/config/dockerRegistry.yml";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerRegistryTestResult {
    pub registry: String,
    pub image_name: String,
    pub success: bool,
    pub download_speed_mbps: f64,
    pub downloaded_bytes: u64,
    pub test_duration_seconds: f64,
    pub error_message: Option<String>,
    pub session_id: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerRegistryBulkTestResult {
    pub image_name: String,
    pub total_registries: usize,
    pub successful_tests: Vec<DockerRegistryTestResult>,
    pub failed_tests: Vec<DockerRegistryTestResult>,
    pub test_duration_ms: u64,
    pub best_registry: Option<String>,
    pub best_speed_mbps: f64,
}

// Config management functions
pub fn docker_config_path() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    config_dir.join("bargozin").join("dockerRegistry.yml")
}

pub async fn read_docker_registries_file(path: &PathBuf) -> Result<Vec<String>> {
    let content = tokio::fs::read_to_string(path).await?;
    let yaml: serde_yaml::Value = serde_yaml::from_str(&content)?;
    let list = yaml["registryList"]
        .as_sequence()
        .ok_or_else(|| anyhow::anyhow!("registryList key missing"))?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    Ok(list)
}

pub async fn download_docker_config_file(url: &str, path: &PathBuf) -> Result<()> {
    let content = tokio::task::spawn_blocking({
        let url = url.to_string();
        move || -> Result<Vec<u8>> {
            let agent = crate::proxy::apply_ureq_proxy(ureq::AgentBuilder::new()).build();
            let response = agent.get(&url).call()?;
            let mut buffer = Vec::new();
            response.into_reader().read_to_end(&mut buffer)?;
            Ok(buffer)
        }
    }).await??;
    
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut file = File::create(path).await?;
    file.write_all(&content).await?;
    Ok(())
}

// Docker image name validation
pub fn validate_docker_image_name(image_name: &str) -> bool {
    // Pattern similar to Go code
    let pattern = r"^(?:[a-zA-Z0-9\-._]+(?::[0-9]+)?/)?(?:[a-z0-9\-._]+/)?[a-z0-9\-._]+(?::[a-zA-Z0-9\-._]+)?(?:@[a-zA-Z0-9\-._:]+)?$";
    let regex = Regex::new(pattern).unwrap();
    regex.is_match(image_name) && !image_name.contains("@@")
}

// Speed-test blob download. Must be async: ureq in spawn_blocking cannot be
// aborted, so Cancel would keep reading until max_duration. Dropping this
// future closes the HTTP connection and stops the traffic.
pub async fn download_with_ureq(url: &str, max_duration: Duration) -> Result<u64> {
    if is_cancelled() {
        return Err(anyhow::anyhow!("Download cancelled"));
    }

    let start_time = Instant::now();
    println!("Starting download from: {}", url);

    let client = crate::proxy::apply_reqwest_proxy(
        reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .http1_only()
            .connect_timeout(max_duration.min(Duration::from_secs(10)))
            .timeout(max_duration)
            .user_agent("registry-speed-tester/0.1"),
    )
    .build()?;

    let response = client.get(url).send().await?;

    if !response.status().is_success() {
        return Err(anyhow::anyhow!("HTTP error: {}", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut total_bytes: u64 = 0;
    let mut last_log_time = start_time;

    loop {
        if is_cancelled() {
            println!("Download cancelled after {} bytes, dropping connection", total_bytes);
            break;
        }

        let elapsed = start_time.elapsed();
        if elapsed >= max_duration {
            println!("Download timeout reached after {} seconds, downloaded {} bytes", elapsed.as_secs_f64(), total_bytes);
            break;
        }

        // Wake frequently so Cancel is observed even if the sender stalls.
        let poll = max_duration.saturating_sub(elapsed).min(Duration::from_millis(200));

        match tokio::time::timeout(poll, stream.next()).await {
            Ok(Some(Ok(chunk))) => {
                total_bytes += chunk.len() as u64;

                if last_log_time.elapsed() >= Duration::from_secs(1) {
                    let speed_mbps = (total_bytes as f64 * 8.0) / (elapsed.as_secs_f64() * 1_000_000.0);
                    println!("Downloaded {} bytes in {:.1}s, speed: {:.2} Mbps", total_bytes, elapsed.as_secs_f64(), speed_mbps);
                    last_log_time = Instant::now();
                }
            }
            Ok(Some(Err(e))) => {
                if total_bytes > 0 {
                    println!("Download interrupted after downloading {} bytes: {}", total_bytes, e);
                    break;
                } else {
                    return Err(anyhow::anyhow!("Download failed: {}", e));
                }
            }
            Ok(None) => break,
            Err(_) => continue,
        }
    }

    if is_cancelled() {
        return Err(anyhow::anyhow!("Download cancelled"));
    }

    let final_elapsed = start_time.elapsed();
    let final_speed_mbps = if final_elapsed.as_secs_f64() > 0.0 {
        (total_bytes as f64 * 8.0) / (final_elapsed.as_secs_f64() * 1_000_000.0)
    } else {
        0.0
    };

    println!("Download completed: {} bytes in {:.2}s, final speed: {:.2} Mbps", total_bytes, final_elapsed.as_secs_f64(), final_speed_mbps);
    Ok(total_bytes)
}

pub async fn test_docker_registry_download_speed(
    registry: &str,
    image_name: &str,
    timeout_seconds: u64,
) -> DockerRegistryTestResult {
    let start_time = Instant::now();

    if is_cancelled() {
        return DockerRegistryTestResult {
            registry: registry.to_string(),
            image_name: image_name.to_string(),
            success: false,
            download_speed_mbps: 0.0,
            downloaded_bytes: 0,
            test_duration_seconds: 0.0,
            error_message: Some("Download cancelled".to_string()),
            session_id: 0,
        };
    }
    
    // Validate image name
    if !validate_docker_image_name(image_name) {
        return DockerRegistryTestResult {
            registry: registry.to_string(),
            image_name: image_name.to_string(),
            success: false,
            download_speed_mbps: 0.0,
            downloaded_bytes: 0,
            test_duration_seconds: 0.0,
            error_message: Some("Invalid Docker image name format".to_string()),
            session_id: 0, // No longer using sessions
        };
    }

    // Parse image name to extract repository and tag
    let (repository, tag) = parse_image_name(image_name);
    
    // Build registry URL
    let registry_url = if registry.contains("://") {
        registry.to_string()
    } else {
        format!("https://{}", registry)
    };

    let download_duration = Duration::from_secs(timeout_seconds); // Enforce user's timeout

    // Try the blob-based download approach
    match test_registry_with_manifest_approach(&registry_url, &repository, &tag, download_duration).await {
        Ok(downloaded_bytes) => {
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed_mbps = if elapsed > 0.0 {
                (downloaded_bytes as f64 * 8.0) / (elapsed * 1_000_000.0)
            } else {
                0.0
            };

            // If we downloaded any data, consider it a success (even if it timed out)
            if downloaded_bytes > 0 {
                println!("✅ Download succeeded for {}: {} bytes, {:.3} Mbps", registry, downloaded_bytes, speed_mbps);

                DockerRegistryTestResult {
                    registry: registry.to_string(),
                    image_name: image_name.to_string(),
                    success: true,
                    download_speed_mbps: speed_mbps,
                    downloaded_bytes,
                    test_duration_seconds: elapsed,
                    error_message: None,
                    session_id: 0, // No longer using sessions
                }
            } else {
                println!("❌ No data downloaded from {}", registry);
                
                DockerRegistryTestResult {
                    registry: registry.to_string(),
                    image_name: image_name.to_string(),
                    success: false,
                    download_speed_mbps: 0.0,
                    downloaded_bytes: 0,
                    test_duration_seconds: elapsed,
                    error_message: Some("No data downloaded".to_string()),
                    session_id: 0, // No longer using sessions
                }
            }
        }
        Err(e) => {
            let elapsed = start_time.elapsed().as_secs_f64();
            println!("❌ Download failed for {}: {}", registry, e);
            
            DockerRegistryTestResult {
                registry: registry.to_string(),
                image_name: image_name.to_string(),
                success: false,
                download_speed_mbps: 0.0,
                downloaded_bytes: 0, // No bytes downloaded on failure
                test_duration_seconds: elapsed,
                error_message: Some(e.to_string()),
                session_id: 0, // No longer using sessions
            }
        }
    }
}

// Parse image name to extract repository and tag
fn parse_image_name(image_name: &str) -> (String, String) {
    if let Some(at_pos) = image_name.find('@') {
        // Handle digest format (e.g., ubuntu@sha256:...)
        (image_name[..at_pos].to_string(), "latest".to_string())
    } else if let Some(colon_pos) = image_name.rfind(':') {
        // Handle tag format (e.g., ubuntu:latest)
        let before_colon = &image_name[..colon_pos];
        let after_colon = &image_name[colon_pos + 1..];
        
        // Check if after colon looks like a port number (for registry URLs)
        if after_colon.chars().all(|c| c.is_ascii_digit()) && before_colon.contains('/') {
            // This is likely a registry with port, treat whole thing as repository
            (image_name.to_string(), "latest".to_string())
        } else {
            // This is a tag
            (before_colon.to_string(), after_colon.to_string())
        }
    } else {
        // No tag specified, use latest
        (image_name.to_string(), "latest".to_string())
    }
}

// New manifest-based testing approach
async fn test_registry_with_manifest_approach(
    registry_url: &str,
    repository: &str,
    tag: &str,
    max_duration: Duration,
) -> Result<u64> {
    let start_time = Instant::now();
    
    println!("Testing registry: {} with image: {}:{}", registry_url, repository, tag);
    
    // Try to get the actual manifest that contains layer information
    let layer_digest = match tokio::task::spawn_blocking({
        let registry_url = registry_url.to_string();
        let repository = repository.to_string();
        let tag = tag.to_string();
        move || get_first_layer_digest(&registry_url, &repository, &tag)
    }).await? {
        Ok(digest) => {
            println!("Got layer digest: {}", digest);
            digest
        },
        Err(e) => {
            println!("Failed to get layer digest: {}", e);
            return Err(anyhow::anyhow!("Failed to get layer digest: {}", e));
        },
    };
    
    // Check if we still have time for downloading
    if start_time.elapsed() >= max_duration {
        return Err(anyhow::anyhow!("Timeout during manifest fetching"));
    }
    
    // Download layer blob for speed testing
    let blob_url = format!("{}/v2/{}/blobs/{}", registry_url, repository, layer_digest);
    println!("Downloading blob from: {}", blob_url);
    
    if is_cancelled() {
        return Err(anyhow::anyhow!("Download cancelled"));
    }

    let remaining_duration = max_duration.saturating_sub(start_time.elapsed());
    let downloaded_bytes = download_with_ureq(&blob_url, remaining_duration).await?;
    
    println!("Downloaded {} bytes from {}", downloaded_bytes, registry_url);
    Ok(downloaded_bytes)
}

// Simplified helper function to get the first layer digest - following the user's example
fn get_first_layer_digest(registry_url: &str, repository: &str, tag: &str) -> Result<String, anyhow::Error> {
    if is_cancelled() {
        return Err(anyhow::anyhow!("Download cancelled"));
    }

    println!("Fetching tag manifest for {}:{}", repository, tag);
    
    // Step 1: Fetch tag manifest (exactly like user's example)
    let manifest_list = fetch_tag_manifest(registry_url, repository, tag)
        .map_err(|e| anyhow::anyhow!("Failed to fetch tag manifest: {}", e))?;
    
    if manifest_list.manifests.is_empty() {
        // Try direct manifest fetch as fallback
        println!("No manifests in list, trying direct manifest fetch");
        let direct_manifest = fetch_digest_manifest(registry_url, repository, tag)
            .map_err(|e| anyhow::anyhow!("Failed to fetch direct manifest: {}", e))?;
        
        if direct_manifest.layers.is_empty() {
            return Err(anyhow::anyhow!("No layers found in direct manifest"));
        }
        
        return Ok(direct_manifest.layers[0].digest.clone());
    }
    
    // Step 2: Get first manifest digest (exactly like user's example)
    let first_manifest_digest = &manifest_list.manifests[0].digest;
    println!("First manifest digest: {}", first_manifest_digest);
    
    // Step 3: Fetch digest manifest (exactly like user's example)
    let digest_manifest = fetch_digest_manifest(registry_url, repository, first_manifest_digest)
        .map_err(|e| anyhow::anyhow!("Failed to fetch digest manifest: {}", e))?;
    
    if digest_manifest.layers.is_empty() {
        return Err(anyhow::anyhow!("No layers found in digest manifest"));
    }
    
    // Step 4: Get first layer digest (exactly like user's example)
    let layer_digest = &digest_manifest.layers[0].digest;
    let layer_size = digest_manifest.layers[0].size;
    println!("First layer digest: {}, size: {} bytes ({:.2} MB)", layer_digest, layer_size, layer_size as f64 / (1024.0 * 1024.0));
    
    // If first layer is very small, try to find a larger one
    if layer_size < 1024 * 1024 && digest_manifest.layers.len() > 1 { // If < 1MB and more layers available
        for (i, layer) in digest_manifest.layers.iter().enumerate().skip(1) {
            if layer.size > layer_size {
                println!("Using larger layer {} instead: {}, size: {} bytes ({:.2} MB)", 
                    i, layer.digest, layer.size, layer.size as f64 / (1024.0 * 1024.0));
                return Ok(layer.digest.clone());
            }
        }
    }
    
    Ok(layer_digest.clone())
}