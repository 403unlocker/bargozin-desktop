mod error;

// --- platforms
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use crate::system_dns::error::SystemDNSError;

pub type DNSEntry = String;

pub trait SystemDNS {
    fn set(dns: Vec<DNSEntry>) -> Result<(), SystemDNSError>;
    fn get() -> Result<Vec<DNSEntry>, SystemDNSError>;

    fn add(dns: DNSEntry) -> Result<(), SystemDNSError> {
        Self::set(Self::get().map(|mut x| {
            x.push(dns);
            x
        })?)?;
        Ok(())
    }
    fn exists(dns: DNSEntry) -> Result<bool, SystemDNSError> {
        Ok(Self::get()?.contains(&dns))
    }

    fn add_all(dns: Vec<DNSEntry>) -> Result<(), SystemDNSError> {
        for i in dns {
            Self::add(i)?;
        }
        Ok(())
    }
}

// cross platform implementation

pub fn set(dns: Vec<DNSEntry>) -> Result<(), SystemDNSError> {
    #[cfg(target_os = "macos")]
    return macos::SystemDNSMacos::set(dns);
    #[cfg(target_os = "linux")]
    return linux::SystemDNSLinux::set(dns);
    #[cfg(target_os = "windows")]
    return windows::SystemDNSWindows::set(dns);
}

pub fn get() -> Result<Vec<DNSEntry>, SystemDNSError> {
    #[cfg(target_os = "macos")]
    return macos::SystemDNSMacos::get();
    #[cfg(target_os = "linux")]
    return linux::SystemDNSLinux::get();
    #[cfg(target_os = "windows")]
    return windows::SystemDNSWindows::get();
}

pub fn add(dns: DNSEntry) -> Result<(), SystemDNSError> {
    #[cfg(target_os = "macos")]
    return macos::SystemDNSMacos::add(dns);
    #[cfg(target_os = "linux")]
    return linux::SystemDNSLinux::add(dns);
    #[cfg(target_os = "windows")]
    return windows::SystemDNSWindows::add(dns);
}

pub fn add_all(dns: Vec<DNSEntry>) -> Result<(), SystemDNSError> {
    #[cfg(target_os = "macos")]
    return macos::SystemDNSMacos::add_all(dns);
    #[cfg(target_os = "linux")]
    return linux::SystemDNSLinux::add_all(dns);
    #[cfg(target_os = "windows")]
    return windows::SystemDNSWindows::add_all(dns);
}

pub fn exists(dns: DNSEntry) -> Result<bool, SystemDNSError> {
    #[cfg(target_os = "macos")]
    return macos::SystemDNSMacos::exists(dns);
    #[cfg(target_os = "linux")]
    return linux::SystemDNSLinux::exists(dns);
    #[cfg(target_os = "windows")]
    return windows::SystemDNSWindows::exists(dns);
}

pub fn is_supported() -> bool {
    if let Err(SystemDNSError::NotSupported) = get() {
        return false;
    }
    true
}
