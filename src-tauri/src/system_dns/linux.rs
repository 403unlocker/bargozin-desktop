use std::{
    fs::{self, File},
    io::Read,
};

use crate::system_dns::{error::SystemDNSError, DNSEntry, SystemDNS};

pub(super) struct SystemDNSLinux;

const DNS_CONFIG_FILE_PATH: &str = "/etc/resolv.conf";

impl SystemDNS for SystemDNSLinux {
    fn set(dns: Vec<DNSEntry>) -> Result<(), SystemDNSError> {
        let mut content = String::from("\n");
        for i in dns {
            content.push_str(&format!("nameserver {}\n", i));
        }

        fs::write(DNS_CONFIG_FILE_PATH, content)?;

        Ok(())
    }

    fn get() -> Result<Vec<DNSEntry>, SystemDNSError> {
        let mut dns = Vec::new();
        let mut file = File::open(DNS_CONFIG_FILE_PATH)?;
        let mut buffer = String::new();

        file.read_to_string(&mut buffer)?;
        for line in buffer.split("\n") {
            let line = line.trim();
            if line.starts_with("#") {
                continue;
            }
            if line.starts_with("nameserver ") {
                dns.push(line.chars().skip(11).collect());
            }
        }

        Ok(dns)
    }
}
