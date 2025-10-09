use std::fmt::Display;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum SystemDNSError {
    NotSupported,
}

impl Display for SystemDNSError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SystemDNSError::NotSupported => f.write_str("NotSupported"),
        }
    }
}
