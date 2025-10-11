use crate::system_dns::{error::SystemDNSError, DNSEntry, SystemDNS};
use std::process::Command;

pub(super) struct SystemDNSMacos;

impl SystemDNS for SystemDNSMacos {
    fn set(dns: Vec<DNSEntry>) -> Result<(), SystemDNSError> {
        let interface = "Wi-Fi".to_string();
        let mut args: Vec<String> = vec!["-setdnsservers".to_string(), interface];
        args.extend(dns);

        let output = Command::new("networksetup").args(&args).output()?;

        if output.status.success() {
            Ok(())
        } else {
            Err(SystemDNSError::CommandError(
                String::from_utf8(output.stderr).unwrap(),
            ))
        }
    }

    fn get() -> Result<Vec<DNSEntry>, SystemDNSError> {
        let interface = "Wi-Fi";

        let output = Command::new("networksetup")
            .args(&["-getdnsservers", interface])
            .output()?;

        if !output.status.success() {
            return Err(SystemDNSError::CommandError(
                String::from_utf8(output.stderr).unwrap(),
            ));
        }

        let output_str = String::from_utf8(output.stdout).unwrap(); // output is always valid ip
        let dns_servers: Vec<String> = output_str
            .lines()
            .filter(|line| line != &"There aren't any DNS Servers set on")
            .map(|s| s.to_string())
            .collect();

        Ok(dns_servers)
    }
}
