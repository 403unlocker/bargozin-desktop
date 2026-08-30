export type ProxyMode = "none" | "system" | "custom";
export type ProxyProtocol = "http" | "socks5";

export interface ProxyConfig {
  mode: ProxyMode;
  protocol: ProxyProtocol;
  host: string;
  port: string;
  username: string;
  password: string;
}

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  mode: "none",
  protocol: "http",
  host: "",
  port: "",
  username: "",
  password: "",
};

export function proxyModeLabel(mode: ProxyMode): string {
  switch (mode) {
    case "system":
      return "پروکسی سیستم";
    case "custom":
      return "پروکسی سفارشی";
    default:
      return "بدون پروکسی";
  }
}

/** Converts Persian and Arabic-Indic digits to ASCII digits. */
export function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}
