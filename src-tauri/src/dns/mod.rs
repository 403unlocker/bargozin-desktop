use std::net::IpAddr;
use std::time::{Duration, Instant};
use trust_dns_resolver::config::{ResolverConfig, ResolverOpts, NameServerConfig, Protocol};
use trust_dns_resolver::TokioAsyncResolver;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use std::net::SocketAddr;
use url::Url;
use futures_util::StreamExt;

// Original DNS servers constants
pub const DNS_SERVERS: &[&str] = &[
    "178.22.122.100", 
    "185.51.200.2",   
    "192.104.158.78",
    "194.104.158.48", 
    "172.29.0.100",   
    "172.29.2.100",   
    "10.202.10.202",  
    "10.202.10.102",  
    "185.55.226.26",  
    "185.55.225.25",  
    "10.202.10.10",   
    "10.202.10.11",   
    "37.27.41.228",   
    "87.107.52.11",   
    "87.107.52.13",   
    "5.202.100.100",
    "5.202.100.101",  
    "94.103.125.157", 
    "94.103.125.158", 
    "8.8.8.8",
    "8.8.4.4",
    "1.1.1.1",
    "1.0.0.1",
    "9.9.9.9",
    "149.112.112.112",
    "149.112.112.112",
];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum HttpStatus {
    Success,
    Forbidden403,
    Other(u16),
    Failed(String),
    NotTested,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DnsTestResult {
    pub dns_server: String,
    pub status: bool,
    pub response_time: Option<u64>, 
    pub error_message: Option<String>,
    pub session_id: u64,
    pub http_status: HttpStatus,
    pub test_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadSpeedResult {
    pub dns_server: String,
    pub url: String,
    pub success: bool,
    pub download_speed_mbps: f64,
    pub downloaded_bytes: u64,
    pub test_duration_seconds: f64,
    pub error_message: Option<String>,
    pub resolution_time_ms: Option<u64>,
    pub session_id: u64,
}


pub fn ensure_https_url(input: &str) -> Option<Url> {
    let clean = input.trim().replace("http://", "").replace("https://", "");
    Url::parse(&format!("https://{}/", clean)).ok()
}

// Simpler approach: manually resolve DNS, then use reqwest's .resolve() method
pub async fn check_url_with_custom_dns(url: &Url, dns_ip: &str) -> Option<(u16, String)> {
    println!("Testing URL: {} with DNS: {}", url, dns_ip);
    
    // Get the hostname from the URL
    let host = url.host_str()?;
    println!("Resolving hostname: {} using DNS: {}", host, dns_ip);
    
    let socket_addr: SocketAddr = format!("{}:53", dns_ip).parse().ok()?;
    let nameserver = NameServerConfig {
        socket_addr,
        protocol: Protocol::Udp,
        tls_dns_name: None,
        bind_addr: None,
        trust_negative_responses: false,
    };

    let resolver_config = ResolverConfig::from_parts(None, vec![], vec![nameserver]);
    let mut resolver_opts = ResolverOpts::default();
    resolver_opts.timeout = Duration::from_secs(5);
    resolver_opts.attempts = 2;
    
    let resolver = TokioAsyncResolver::tokio(resolver_config, resolver_opts);

    // Resolve the hostname to an IP address
    let lookup_result = match resolver.lookup_ip(host).await {
        Ok(result) => result,
        Err(e) => {
            println!("DNS resolution failed for {} using DNS {}: {:?}", host, dns_ip, e);
            return None;
        }
    };

    let resolved_ip = match lookup_result.iter().next() {
        Some(ip) => ip,
        None => {
            println!("No IP addresses found for {} using DNS {}", host, dns_ip);
            return None;
        }
    };

    println!("DNS resolution successful: {} -> {} (using DNS {})", host, resolved_ip, dns_ip);

    // Determine the port based on the URL scheme
    let port = match url.scheme() {
        "https" => 443,
        "http" => 80,
        _ => {
            println!("Unsupported URL scheme: {}", url.scheme());
            return None;
        }
    };

    let socket_addr = SocketAddr::new(resolved_ip, port);

    // Build HTTP client with the resolved IP address
    // The .resolve() method tells reqwest to use this specific IP for this hostname
    let client = match Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(Duration::from_secs(10))
        .user_agent("Mozilla/5.0 (compatible; Bargozin-DNS-Tester)")
        .resolve(host, socket_addr)  // Map hostname to resolved IP
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            println!("Failed to build HTTP client: {:?}", e);
            return None;
        }
    };

    // Make the HTTP request
    match client.get(url.as_str()).send().await {
        Ok(res) => {
            let code = res.status().as_u16();
            let msg = res.status().canonical_reason().unwrap_or("Unknown").to_string();
            println!("HTTP request succeeded: {} - {} {} (DNS: {})", host, code, msg, dns_ip);
            Some((code, msg))
        }
        Err(e) => {
            println!("HTTP request failed for {} using DNS {}: {:?}", host, dns_ip, e);
            None
        }
    }
}

// Original functions (keeping existing functionality)
pub async fn test_single_dns_server(domain: String, dns_server: String, _session_id: u64) -> DnsTestResult {
    let start_time = std::time::Instant::now();
    
    // Ensure HTTPS URL like in CLI code
    let url_string = ensure_https(&domain);
    let parsed_url = match ensure_https_url(&domain) {
        Some(url) => url,
        None => {
            return DnsTestResult {
                dns_server,
                status: false,
                response_time: Some(start_time.elapsed().as_millis() as u64),
                error_message: Some("Invalid domain format".to_string()),
                session_id: 0,
                http_status: HttpStatus::Failed("Invalid domain".to_string()),
                test_url: Some(url_string),
            };
        }
    };
    
    // Use custom DNS resolver like in CLI
    match check_url_with_custom_dns(&parsed_url, &dns_server).await {
        Some((status_code, status_msg)) => {
            let response_time = start_time.elapsed().as_millis() as u64;
            
            let http_status = match status_code {
                200..=299 => HttpStatus::Success,
                403 => HttpStatus::Forbidden403,
                _ => HttpStatus::Other(status_code),
            };
            
            // Consider 200-299 as usable (like CLI)
            let is_usable = status_code >= 200 && status_code < 300;
            
            DnsTestResult {
                dns_server,
                status: is_usable,
                response_time: Some(response_time),
                error_message: if is_usable { 
                    None 
                } else { 
                    Some(format!("HTTP {} - {}", status_code, status_msg)) 
                },
                session_id: 0,
                http_status,
                test_url: Some(url_string),
            }
        }
        None => {
            let response_time = start_time.elapsed().as_millis() as u64;
            DnsTestResult {
                dns_server,
                status: false,
                response_time: Some(response_time),
                error_message: Some("DNS resolution or HTTP request failed".to_string()),
                session_id: 0,
                http_status: HttpStatus::Failed("Connection failed".to_string()),
                test_url: Some(url_string),
            }
        }
    }
}

fn ensure_https(domain: &str) -> String {
    let mut url = domain.to_string();
    
    // Remove existing protocol if present
    if url.starts_with("http://") {
        url = url.strip_prefix("http://").unwrap().to_string();
    }
    if url.starts_with("https://") {
        url = url.strip_prefix("https://").unwrap().to_string();
    }
    
    // Add https:// and ensure it ends with /
    let mut result = format!("https://{}", url);
    
    // Parse to extract just the host part (like Go code)
    if let Ok(parsed) = url::Url::parse(&result) {
        if let Some(host) = parsed.host_str() {
            result = format!("https://{}/", host);
        }
    }
    
    result
}

async fn resolve_host_with_dns(host: &str, dns_server: &str) -> anyhow::Result<IpAddr> {
    let socket_addr: SocketAddr = format!("{}:53", dns_server).parse()?;
    let nameserver = NameServerConfig {
        socket_addr,
        protocol: Protocol::Udp,
        tls_dns_name: None,
        bind_addr: None,
        trust_negative_responses: false,
    };

    let resolver_config = ResolverConfig::from_parts(None, vec![], vec![nameserver]);
    
    // Configure resolver options with a reasonable timeout for DNS resolution
    let mut resolver_opts = ResolverOpts::default();
    resolver_opts.timeout = Duration::from_secs(5); // 5 second timeout for DNS resolution
    resolver_opts.attempts = 2; // 2 attempts max
    
    let resolver = TokioAsyncResolver::tokio(resolver_config, resolver_opts);

    let response = resolver.lookup_ip(host).await?;
    response
        .iter()
        .next()
        .ok_or_else(|| anyhow::anyhow!("No IP found for host"))
}

async fn download_with_custom_dns(url: &str, dns_ip: &str, timeout_seconds: u64, _session_id: u64) -> anyhow::Result<DownloadSpeedResult> {
    println!("Starting download test: {} with DNS: {}", url, dns_ip);
    
    // Start the overall timer from the beginning (includes DNS resolution + connection + download)
    let overall_start = Instant::now();
    let timeout_duration = std::time::Duration::from_secs(timeout_seconds);
    
    let resolution_start = Instant::now();
    
    let parsed_url = reqwest::Url::parse(url)?;
    let host = parsed_url.host_str().ok_or_else(|| anyhow::anyhow!("Invalid host"))?;
    
    println!("Parsed URL - host: {}, scheme: {}", host, parsed_url.scheme());

    // Resolve host with custom DNS with timeout
    println!("Resolving {} using DNS {}", host, dns_ip);
    
    // Apply timeout to DNS resolution
    let resolved_ip = tokio::time::timeout(
        timeout_duration,
        resolve_host_with_dns(host, dns_ip)
    ).await
    .map_err(|_| anyhow::anyhow!("DNS resolution timed out after {} seconds", timeout_seconds))?
    .map_err(|e| anyhow::anyhow!("DNS resolution failed: {}", e))?;
    
    let resolution_time_ms = resolution_start.elapsed().as_millis() as u64;
    println!("DNS resolution successful: {} -> {} ({}ms)", host, resolved_ip, resolution_time_ms);

    // Check if we still have time left after DNS resolution
    if overall_start.elapsed() >= timeout_duration {
        return Err(anyhow::anyhow!("Operation timed out during DNS resolution"));
    }

    // Determine port based on scheme
    let port = match parsed_url.scheme() {
        "https" => 443,
        "http" => 80,
        _ => return Err(anyhow::anyhow!("Unsupported scheme")),
    };

    let socket_addr = SocketAddr::new(resolved_ip, port);

    // Calculate remaining time for HTTP operations
    let remaining_time = timeout_duration.saturating_sub(overall_start.elapsed());
    if remaining_time.is_zero() {
        return Err(anyhow::anyhow!("Operation timed out before HTTP request"));
    }

    let client = Client::builder()
        .danger_accept_invalid_certs(true)
        .timeout(remaining_time) // Use remaining time, not extra time
        .resolve(host, socket_addr)
        .build()?;

    let download_start = Instant::now();
    
    let response = client.get(url).send().await
        .map_err(|e| anyhow::anyhow!("HTTP request failed: {}", e))?;

    let mut downloaded_bytes = 0u64;
    let mut stream = response.bytes_stream();

    while let Some(chunk_result) = stream.next().await {
        // Check if overall timeout has been reached
        if overall_start.elapsed() >= timeout_duration {
            break;
        }

        let chunk = chunk_result
            .map_err(|e| anyhow::anyhow!("Stream error: {}", e))?;
        downloaded_bytes += chunk.len() as u64;
        
        // Add periodic check for cancellation (every 1MB or every 1 second)
        if downloaded_bytes % (1024 * 1024) == 0 || download_start.elapsed().as_secs() > 1 {
            tokio::task::yield_now().await; // Allow other tasks to run and check for cancellation
        }
    }

    let elapsed = overall_start.elapsed().as_secs_f64(); // Use overall elapsed time
    let speed_mbps = (downloaded_bytes as f64 * 8.0) / (elapsed * 1_000_000.0);

    Ok(DownloadSpeedResult {
        dns_server: dns_ip.to_string(),
        url: url.to_string(),
        success: true,
        download_speed_mbps: speed_mbps,
        downloaded_bytes,
        test_duration_seconds: elapsed,
        error_message: None,
        resolution_time_ms: Some(resolution_time_ms),
        session_id: 0, // This will be set by the calling function
    })
}

pub async fn test_download_speed_with_dns(url: String, dns_server: String, timeout_seconds: u64, session_id: u64) -> DownloadSpeedResult {
    // Add a small delay to allow for cancellation check
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    
    match download_with_custom_dns(&url, &dns_server, timeout_seconds, session_id).await {
        Ok(mut result) => {
            result.session_id = session_id;
            result
        },
        Err(e) => DownloadSpeedResult {
            dns_server,
            url,
            success: false,
            download_speed_mbps: 0.0,
            downloaded_bytes: 0,
            test_duration_seconds: 0.0,
            error_message: Some(e.to_string()),
            resolution_time_ms: None,
            session_id,
        },
    }
}