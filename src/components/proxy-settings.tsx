import { useEffect, useRef, useState } from "react";
import { useAlert, useAlertHelpers } from "./alert";
import ChevronDown from "./svg/chevron-down";
import { useProxy } from "../context/proxy-context";
import { useTestSession } from "../context/test-session";
import {
  proxyModeLabel,
  toEnglishDigits,
  type ProxyConfig,
  type ProxyMode,
  type ProxyProtocol,
} from "../lib/proxy";

const MODES: { id: ProxyMode; label: string }[] = [
  { id: "none", label: "بدون پروکسی" },
  { id: "system", label: "پروکسی سیستم" },
  { id: "custom", label: "پروکسی سفارشی" },
];

function modeSummary(config: ProxyConfig): string {
  if (config.mode === "custom" && config.host.trim()) {
    return `${config.host}:${config.port}`;
  }
  return proxyModeLabel(config.mode);
}

function RadioOption({
  label,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full flex items-center justify-end gap-2.5 py-2 px-2 text-sm text-right rounded-lg transition-all duration-200 ${
        disabled
          ? "opacity-50 cursor-not-allowed text-[#CDCDCD]"
          : selected
          ? "bg-gradient-to-br from-[#1C4C91] to-[#2F81F7] text-white cursor-pointer"
          : "hover:bg-[#122239]/60 text-[#CDCDCD] cursor-pointer"
      }`}
    >
      <span>{label}</span>
      <span
        className={`size-3.5 rounded-full border flex items-center justify-center shrink-0 ${
          selected ? "border-white/70" : "border-[#6B7280]"
        }`}
      >
        {selected && <span className="size-1.5 rounded-full bg-white" />}
      </span>
    </button>
  );
}

function CustomProxyModalForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ProxyConfig;
  onSave: (config: ProxyConfig) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");

  const save = async () => {
    if (!draft.host.trim() || !draft.port.trim()) {
      setError("آدرس و پورت را وارد کنید");
      return;
    }
    await onSave({ ...draft, mode: "custom" });
  };

  return (
    <div className="dir-fa text-right space-y-5">
      <div>
        <label className="text-xs text-[#9BA3AF] mb-2 block">آدرس پروکسی</label>
        <input
          value={draft.host}
          onChange={(e) =>
            setDraft((p) => ({ ...p, host: toEnglishDigits(e.target.value) }))
          }
          placeholder="127.0.0.1"
          className="proxy-field dir-ltr text-left"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-[#9BA3AF] mb-2 block">پورت</label>
          <input
            value={draft.port}
            onChange={(e) =>
              setDraft((p) => ({ ...p, port: toEnglishDigits(e.target.value) }))
            }
            placeholder="1080"
            className="proxy-field dir-ltr text-left"
          />
        </div>
        <div className="w-[180px] shrink-0">
          <label className="text-xs text-[#9BA3AF] mb-2 block">پروتکل</label>
          <div className="h-[42px] bg-[#30363D] border border-[#444C56] rounded-lg grid grid-cols-2 overflow-hidden p-[3px] gap-[3px]">
            {(["http", "socks5"] as ProxyProtocol[]).map((protocol) => (
              <button
                key={protocol}
                type="button"
                onClick={() => setDraft((p) => ({ ...p, protocol }))}
                className={`rounded-md text-xs font-medium transition-all duration-200 cursor-pointer ${
                  draft.protocol === protocol
                    ? "btn-gradient-primary"
                    : "text-[#9BA3AF] hover:text-white hover:bg-[#262a30]"
                }`}
              >
                {protocol === "http" ? "HTTP" : "SOCKS5"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-[#F85149]">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => void save()}
          className="flex-1 h-11 rounded-lg text-sm font-medium btn-gradient-primary cursor-pointer"
        >
          ذخیره
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-24 h-11 rounded-lg text-sm text-[#CDCDCD] bg-[#30363D] hover:bg-[#3D444D] hover:text-white border border-[#444C56] transition-all duration-200 cursor-pointer"
        >
          انصراف
        </button>
      </div>
    </div>
  );
}

export default function ProxyFloatingButton() {
  const { config, applyConfig, proxyOnline } = useProxy();
  const { isTestRunning } = useTestSession();
  const { showCustom } = useAlertHelpers();
  const { hideAlert } = useAlert();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isTestRunning) {
      setOpen(false);
    }
  }, [isTestRunning]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const openCustomModal = () => {
    if (isTestRunning) {
      return;
    }
    let alertId = "";
    alertId = showCustom(
      <CustomProxyModalForm
        initial={config}
        onCancel={() => hideAlert(alertId)}
        onSave={async (next) => {
          const ok = await applyConfig(next);
          if (ok) {
            hideAlert(alertId);
            setOpen(false);
          }
        }}
      />,
      {
        title: "پروکسی سفارشی",
        type: "info",
        size: "medium",
        closable: true,
      }
    );
  };

  const selectMode = async (mode: ProxyMode) => {
    if (isTestRunning) {
      return;
    }
    if (mode === "custom") {
      openCustomModal();
      return;
    }
    await applyConfig({ ...config, mode });
    setOpen(false);
  };

  const isActive = config.mode !== "none";
  const statusDot =
    !isActive || open
      ? null
      : proxyOnline === null
        ? "bg-[#848484] animate-pulse"
        : proxyOnline
          ? "bg-[#3FB950]"
          : "bg-[#F85149]";

  return (
    <div ref={containerRef} className="fixed bottom-8 left-[100px] z-40 dir-fa">
      <div
        className={`proxy-drawer absolute bottom-full left-0 mb-2.5 w-[250px] bg-[#161B22] border border-[#30363D] rounded-2xl shadow-2xl p-3 ${
          open ? "proxy-drawer-open" : "proxy-drawer-closed"
        }`}
      >
        <div className="border-b border-[#30363D] pb-2 mb-1 flex items-center justify-between">
          <p className="text-[11px] text-[#9BA3AF] text-right dir-ltr">
            {modeSummary(config)}
          </p>
          {isActive && proxyOnline !== null && (
            <span className={`text-[10px] ${proxyOnline ? "text-[#3FB950]" : "text-[#F85149]"}`}>
              {proxyOnline ? "آنلاین" : "آفلاین"}
            </span>
          )}
        </div>

        {MODES.map((mode) => (
          <RadioOption
            key={mode.id}
            label={mode.label}
            selected={config.mode === mode.id}
            disabled={isTestRunning}
            onSelect={() => void selectMode(mode.id)}
          />
        ))}

        {config.mode === "custom" && (
          <button
            type="button"
            onClick={openCustomModal}
            disabled={isTestRunning}
            className="mt-2 w-full h-8 rounded-lg text-[11px] btn-gradient-teal cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ویرایش پروکسی
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={isTestRunning}
        onClick={() => setOpen((v) => !v)}
        title={
          isTestRunning
            ? "تا پایان تست نمی‌توان پروکسی را تغییر داد"
            : modeSummary(config)
        }
        className={`flex items-center justify-between gap-4 px-4 py-2.5 w-[148px] rounded-xl shadow-lg border transition-all duration-200 ${
          isTestRunning
            ? "bg-[#161B22] border-[#30363D] text-[#848484] opacity-60 cursor-not-allowed"
            : open
            ? "btn-gradient-primary border-transparent cursor-pointer"
            : isActive && proxyOnline === false
              ? "bg-[#161B22] border-[#F85149]/60 text-white cursor-pointer"
              : isActive
              ? "bg-[#161B22] border-[#2F81F7] text-white cursor-pointer"
              : "bg-[#161B22] border-[#30363D] text-[#CDCDCD] hover:border-[#444C56] hover:text-white cursor-pointer"
        }`}
      >
        <p className="text-sm whitespace-nowrap flex items-center gap-1.5">
          {statusDot && (
            <span className={`size-1.5 rounded-full shrink-0 ${statusDot}`} />
          )}
          اتصال
        </p>
        <ChevronDown
          fill={open || isActive ? "#FBFBFB" : "#848484"}
          className={`shrink-0 transition-transform duration-300 ease-out ${
            open ? "" : "rotate-180"
          }`}
        />
      </button>
    </div>
  );
}
