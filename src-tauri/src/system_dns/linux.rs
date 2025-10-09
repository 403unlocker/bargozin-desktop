use crate::system_dns::{error::SystemDNSError, SystemDNS};

pub(super) struct SystemDNSLinux;

impl SystemDNS for SystemDNSLinux {
    fn set(dns: Vec<super::DNSEntry>) -> Result<(), super::error::SystemDNSError> {
        Err(SystemDNSError::NotSupported)
    }

    fn get() -> Result<Vec<super::DNSEntry>, super::error::SystemDNSError> {
        Err(SystemDNSError::NotSupported)
    }
}
