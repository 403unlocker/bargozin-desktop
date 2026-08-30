use reqwest::Client;
use std::fs;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;
use std::sync::Arc;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use trust_dns_resolver::TokioAsyncResolver;
use trust_dns_resolver::config::*;
use url::Url;
use reqwest::dns::{Resolve, Resolving, Name, Addrs};

pub const DNS_CONFIG_URL: &str =
    "https://raw.githubusercontent.com/403unlocker/403Unlocker-cli/refs/heads/main/config/dns.yml";

pub fn dns_config_path() -> PathBuf {
    let home = std::env::var("HOME").expect("HOME not set");
    PathBuf::from(home).join(".config/403unlocker/dns.yml")
}

pub async fn read_dns_file(path: &PathBuf) -> anyhow::Result<Vec<String>> {
    let content = fs::read_to_string(path)?;
    let yaml: serde_yaml::Value = serde_yaml::from_str(&content)?;
    let list = yaml["dnsServers"]
        .as_sequence()
        .ok_or_else(|| anyhow::anyhow!("dnsServers key missing"))?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    Ok(list)
}

pub async fn download_config_file(url: &str, path: &PathBuf) -> anyhow::Result<()> {
    let response = reqwest::get(url).await?;
    let content = response.bytes().await?;
    let parent = path.parent().unwrap();
    tokio::fs::create_dir_all(parent).await?;
    let mut file = File::create(path).await?;
    file.write_all(&content).await?;
    Ok(())
}

pub fn ensure_https(input: &str) -> Option<Url> {
    let clean = input.trim().replace("http://", "").replace("https://", "");
    Url::parse(&format!("https://{}/", clean)).ok()
}

// Custom DNS resolver that uses a specific DNS server
struct CustomDnsResolver {
    resolver: TokioAsyncResolver,
}

impl CustomDnsResolver {
    fn new(dns_ip: &str) -> Option<Self> {
        let resolver_config = ResolverConfig::from_parts(
            None,
            vec![],
            vec![NameServerConfig {
                socket_addr: format!("{}:53", dns_ip).parse::<SocketAddr>().ok()?,
                protocol: Protocol::Udp,
                tls_dns_name: None,
                trust_negative_responses: true,
                bind_addr: None,
            }],
        );

        let resolver = TokioAsyncResolver::tokio(resolver_config, ResolverOpts::default());
        Some(Self { resolver })
    }
}

impl Resolve for CustomDnsResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let resolver = self.resolver.clone();
        Box::pin(async move {
            let response = resolver.lookup_ip(name.as_str()).await
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
            
            let addrs: Vec<SocketAddr> = response
                .iter()
                .map(|ip| SocketAddr::new(ip, 443))  // Always use 443 for HTTPS URLs
                .collect();
            
            let addrs: Addrs = Box::new(addrs.into_iter());
            Ok(addrs)
        })
    }
}

pub async fn check_url_with_dns(url: &Url, dns_ip: &str) -> Option<(u16, String)> {
    let resolver = CustomDnsResolver::new(dns_ip)?;
    
    let client = crate::proxy::apply_reqwest_proxy(
        Client::builder()
            .dns_resolver(Arc::new(resolver))
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (compatible; 403Unlocker)"),
    )
    .build()
    .ok()?;

    match client.get(url.as_str()).send().await {
        Ok(res) => {
            let code = res.status().as_u16();
            let msg = res.status().canonical_reason().unwrap_or("Unknown").to_string();
            Some((code, msg))
        }
        Err(_) => None
    }
}
