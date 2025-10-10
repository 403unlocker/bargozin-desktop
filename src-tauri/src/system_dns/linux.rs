use std::{
    fs::{self, File},
    io::Read,
};

use crate::system_dns::SystemDNS;

pub(super) struct SystemDNSLinux;

const DNS_CONFIG_FILE_PATH: &str = "/etc/resolv.conf";

impl SystemDNS for SystemDNSLinux {
    fn set(dns: Vec<super::DNSEntry>) -> Result<(), super::error::SystemDNSError> {
        let mut content = String::from("\n");
        for i in dns {
            content.push_str(&format!("nameserver {}\n", i));
        }

        fs::write(DNS_CONFIG_FILE_PATH, content)?;

        Ok(())
    }

    fn get() -> Result<Vec<super::DNSEntry>, super::error::SystemDNSError> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_and_read() {
        let dns = vec![
            "1.1.1.1".to_string(),
            "8.8.8.8".to_string(),
            "8.8.4.4".to_string(),
        ];

        SystemDNSLinux::set(dns).unwrap();
        let readed = SystemDNSLinux::get().unwrap();

        dbg!(&readed);

        assert_eq!(readed.len(), 3);
        assert_eq!(readed.get(0), Some(&"1.1.1.1".to_string()));
        assert_eq!(readed.get(1), Some(&"8.8.8.8".to_string()));
        assert_eq!(readed.get(2), Some(&"8.8.4.4".to_string()));
    }
}
