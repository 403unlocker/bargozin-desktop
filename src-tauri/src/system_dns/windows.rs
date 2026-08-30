use std::os::windows::process::CommandExt;
use std::process::Command;

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, BOOL, ERROR_BUFFER_OVERFLOW, ERROR_CANCELLED, ERROR_SUCCESS, HANDLE,
};
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetAdaptersAddresses, GAA_FLAG_INCLUDE_GATEWAYS, IF_TYPE_SOFTWARE_LOOPBACK,
    IP_ADAPTER_ADDRESSES_LH,
};
use windows_sys::Win32::NetworkManagement::Ndis::IfOperStatusUp;
use windows_sys::Win32::Networking::WinSock::AF_INET;
use windows_sys::Win32::System::Threading::{GetExitCodeProcess, WaitForSingleObject, INFINITE};
use windows_sys::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SEE_MASK_NO_CONSOLE,
    SHELLEXECUTEINFOW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SW_HIDE};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn set_dns_windows(dns: &str) -> Result<String, String> {
    let interface = get_active_windows_interface()?;
    run_elevated_netsh(&format!(
        "interface ipv4 set dnsservers name=\"{interface}\" source=static address={dns} register=primary validate=no"
    ))?;
    flush_dns_cache();
    Ok(format!("DNS set to {dns} on {interface}"))
}

pub fn reset_dns_windows() -> Result<String, String> {
    let interface = get_active_windows_interface()?;
    run_elevated_netsh(&format!(
        "interface ipv4 set dnsservers name=\"{interface}\" source=dhcp register=primary validate=no"
    ))?;
    flush_dns_cache();
    Ok(format!("DNS reset to automatic (DHCP) on {interface}"))
}

fn get_active_windows_interface() -> Result<String, String> {
    unsafe {
        let mut size = 0u32;
        let flags = GAA_FLAG_INCLUDE_GATEWAYS;
        let family = AF_INET as u32;

        let status = GetAdaptersAddresses(
            family,
            flags,
            std::ptr::null(),
            std::ptr::null_mut(),
            &mut size,
        );
        if status != ERROR_BUFFER_OVERFLOW {
            return Err("Failed to list network adapters".to_string());
        }

        let mut buffer = vec![0u8; size as usize];
        let status = GetAdaptersAddresses(
            family,
            flags,
            std::ptr::null(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        );
        if status != ERROR_SUCCESS {
            return Err("Failed to list network adapters".to_string());
        }

        let mut current = buffer.as_ptr().cast::<IP_ADAPTER_ADDRESSES_LH>();
        let mut best: Option<(u32, String)> = None;

        while !current.is_null() {
            let adapter = &*current;
            let is_up = adapter.OperStatus == IfOperStatusUp;
            let not_loopback = adapter.IfType != IF_TYPE_SOFTWARE_LOOPBACK;
            let has_gateway = !adapter.FirstGatewayAddress.is_null();

            if is_up && not_loopback && has_gateway {
                let name = wide_to_string(adapter.FriendlyName);
                if is_usable_interface_name(&name)
                    && best
                        .as_ref()
                        .is_none_or(|(metric, _)| adapter.Ipv4Metric < *metric)
                {
                    best = Some((adapter.Ipv4Metric, name));
                }
            }

            current = adapter.Next;
        }

        best.map(|(_, name)| name)
            .ok_or_else(|| "No active network interface found".to_string())
    }
}

fn run_elevated_netsh(params: &str) -> Result<(), String> {
    let file = to_wide("netsh");
    let parameters = to_wide(params);
    let verb = to_wide("runas");

    let mut info = unsafe { std::mem::zeroed::<SHELLEXECUTEINFOW>() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_NO_CONSOLE;
    info.hwnd = unsafe { GetForegroundWindow() };
    info.lpVerb = verb.as_ptr();
    info.lpFile = file.as_ptr();
    info.lpParameters = parameters.as_ptr();
    info.nShow = SW_HIDE;

    let success: BOOL = unsafe { ShellExecuteExW(&mut info) };
    if success == 0 {
        let error = unsafe { GetLastError() };
        if error == ERROR_CANCELLED {
            return Err("Operation cancelled by user".to_string());
        }
        return Err(format!("Failed to start elevated netsh (error {error})"));
    }

    let process: HANDLE = info.hProcess;
    if process.is_null() {
        return Ok(());
    }

    unsafe {
        WaitForSingleObject(process, INFINITE);
        let mut exit_code = 0u32;
        let got_code = GetExitCodeProcess(process, &mut exit_code);
        CloseHandle(process);

        if got_code == 0 {
            return Err("Failed to read netsh result".to_string());
        }
        if exit_code != 0 {
            return Err(format!("Failed to set DNS (netsh exit code {exit_code})"));
        }
    }

    Ok(())
}

fn flush_dns_cache() {
    let _ = Command::new("ipconfig")
        .arg("/flushdns")
        .creation_flags(CREATE_NO_WINDOW)
        .output();
}

fn is_usable_interface_name(name: &str) -> bool {
    !name.is_empty() && !name.contains(['"', '\0'])
}

fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn wide_to_string(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }

    unsafe {
        let mut len = 0;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
    }
}
