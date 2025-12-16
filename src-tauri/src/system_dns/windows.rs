use crate::system_dns::{error::SystemDNSError, DNSEntry, SystemDNS};

pub(super) struct SystemDNSWindows;

impl SystemDNS for SystemDNSWindows {
    fn set(dns: Vec<DNSEntry>) -> Result<(), SystemDNSError> {
        Err(SystemDNSError::NotSupported)
    }

    fn get() -> Result<Vec<DNSEntry>, SystemDNSError> {
        Err(SystemDNSError::NotSupported)
    }
}
