use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use anyhow::Result;
use std::io::Read;

fn ensure_not_cancelled() -> Result<()> {
    if crate::task_control::is_cancelled() {
        anyhow::bail!("Download cancelled");
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestList {
    pub schema_version: u32,
    pub media_type: String,
    pub manifests: Vec<Manifest>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub digest: String,
    pub media_type: String,
    pub size: u64,
    pub platform: Platform,
    pub annotations: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Platform {
    pub architecture: String,
    pub os: String,
    pub variant: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestManifest {
    pub schema_version: u32,
    pub media_type: String,
    pub config: ConfigDescriptor,
    pub layers: Vec<LayerDescriptor>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDescriptor {
    pub media_type: String,
    pub size: u64,
    pub digest: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerDescriptor {
    pub media_type: String,
    pub size: u64,
    pub digest: String,
}

// Create a configured HTTP client
fn create_http_client() -> Result<ureq::Agent> {
    let agent = crate::proxy::apply_ureq_proxy(
        ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    )
    .build();
    Ok(agent)
}

/// Fetch and parse a manifest list from a registry URL
pub fn fetch_tag_manifest(registry_url: &str, image_name: &str, tag: &str) -> Result<ManifestList> {
    ensure_not_cancelled()?;
    let agent = create_http_client()?;
    let url = format!("{}/v2/{}/manifests/{}", registry_url, image_name, tag);
    
    let response = agent
        .get(&url)
        .set("Accept", "application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json,application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json")
        .call()?;

    if response.status() != 200 {
        return Err(anyhow::anyhow!("HTTP error {}: {}", response.status(), url));
    }

    // Get headers before consuming response
    let _content_type = response.header("content-type").unwrap_or("");

    let mut response_text = String::new();
    response.into_reader().read_to_string(&mut response_text)?;
    
    // Try to parse as ManifestList first
    if let Ok(manifest_list) = serde_json::from_str::<ManifestList>(&response_text) {
        return Ok(manifest_list);
    }
    
    // If that fails, we might have received a single manifest
    // Return an empty ManifestList to indicate we should try direct manifest fetch
    Ok(ManifestList {
        schema_version: 2,
        media_type: "application/vnd.docker.distribution.manifest.list.v2+json".to_string(),
        manifests: vec![], // Empty manifests array signals to try direct fetch
    })
}

pub fn fetch_digest_manifest(registry_url: &str, image_name: &str, digest: &str) -> Result<DigestManifest> {
    ensure_not_cancelled()?;
    let agent = create_http_client()?;
    let url = format!("{}/v2/{}/manifests/{}", registry_url, image_name, digest);
    
    let response = agent
        .get(&url)
        .set("Accept", "application/vnd.docker.distribution.manifest.v2+json")
        .call()?;

    if response.status() != 200 {
        return Err(anyhow::anyhow!("HTTP error {}: {}", response.status(), url));
    }

    let mut response_text = String::new();
    response.into_reader().read_to_string(&mut response_text)?;
    let digest_manifest: DigestManifest = serde_json::from_str(&response_text)?;
    Ok(digest_manifest)
}
