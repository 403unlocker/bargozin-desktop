use std::fmt::Display;

#[derive(Debug)]
pub enum SystemDNSError {
    NotSupported,
    PermissionDenied,
    IOError(std::io::Error),
}

impl Display for SystemDNSError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SystemDNSError::NotSupported => f.write_str("Not Supported"),
            SystemDNSError::PermissionDenied => f.write_str("PermissionDenied"),
            SystemDNSError::IOError(e) => f.write_fmt(format_args!("IOError: {}", e)),
        }
    }
}

impl From<std::io::Error> for SystemDNSError {
    fn from(value: std::io::Error) -> Self {
        match value.kind() {
            std::io::ErrorKind::PermissionDenied => Self::PermissionDenied,
            _ => Self::IOError(value),
        }
    }
}
