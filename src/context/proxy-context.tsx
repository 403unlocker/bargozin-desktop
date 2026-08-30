import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  DEFAULT_PROXY_CONFIG,
  type ProxyConfig,
} from "../lib/proxy";

const STORAGE_KEY = "bargozin.proxy";

interface ProxyContextValue {
  config: ProxyConfig;
  applyConfig: (next: ProxyConfig) => Promise<boolean>;
  proxyOnline: boolean | null;
}

const ProxyContext = createContext<ProxyContextValue | null>(null);

function loadStoredConfig(): ProxyConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROXY_CONFIG;
    return { ...DEFAULT_PROXY_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROXY_CONFIG;
  }
}

function toBackendPayload(config: ProxyConfig) {
  return {
    mode: config.mode,
    protocol: config.protocol,
    host: config.host.trim(),
    port: Number(config.port) || 0,
    username: config.username,
    password: config.password,
  };
}

export function ProxyProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ProxyConfig>(loadStoredConfig);
  const [proxyOnline, setProxyOnline] = useState<boolean | null>(null);

  const checkReachability = useCallback(async (cfg: ProxyConfig) => {
    if (cfg.mode === "none") {
      setProxyOnline(null);
      return;
    }
    setProxyOnline(null);
    try {
      const ok = await invoke<boolean>("check_proxy_reachable");
      setProxyOnline(ok);
    } catch {
      setProxyOnline(false);
    }
  }, []);

  useEffect(() => {
    void invoke("set_proxy_settings", { settings: toBackendPayload(config) })
      .then(() => checkReachability(config))
      .catch(() => {});
  }, []);

  // Re-check every 30s when proxy is active
  useEffect(() => {
    if (config.mode === "none") return;
    const id = setInterval(() => void checkReachability(config), 30_000);
    return () => clearInterval(id);
  }, [config, checkReachability]);

  const applyConfig = useCallback(async (next: ProxyConfig) => {
    try {
      await invoke("set_proxy_settings", { settings: toBackendPayload(next) });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setConfig(next);
      void checkReachability(next);
      return true;
    } catch (error) {
      toast.error(String(error), {
        position: "top-left",
        className: "dir-fa text-right",
      });
      return false;
    }
  }, [checkReachability]);

  const value = useMemo(() => ({ config, applyConfig, proxyOnline }), [config, applyConfig, proxyOnline]);

  return <ProxyContext.Provider value={value}>{children}</ProxyContext.Provider>;
}

export function useProxy() {
  const context = useContext(ProxyContext);
  if (!context) {
    throw new Error("useProxy must be used within ProxyProvider");
  }
  return context;
}
