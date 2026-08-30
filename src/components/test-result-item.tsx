import Clipboard from "./svg/clipboard";
import { useState } from "react";
import { useSetSystemDns } from "../hooks/use-set-system-dns";

export default function TestResultItem(props: {
  dns: string;
  status: boolean;
  responseTime?: number;
  errorMessage?: string;
  isDownloadSpeed?: boolean;
  allowSetDns?: boolean;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const { requestSetDns } = useSetSystemDns();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.dns);
      setIsCopied(true);
      // Reset after 2 seconds
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleSetDns = () => {
    if (!props.status) return;
    requestSetDns(props.dns);
  };

  const formatResponseTime = (time?: number) => {
    if (time === undefined) return "";

    if (props.isDownloadSpeed) {
      // Format as download speed in MB/s or KB/s for slower speeds
      if (time === 0) return "0 KB/s";
      if (time < 0.001) return "< 1 KB/s";
      if (time < 1) {
        // Show in KB/s for speeds under 1 MB/s
        const kbps = Math.round(time * 1024 * 100) / 100;
        return `${kbps} KB/s`;
      }
      return `${time.toFixed(2)} MB/s`;
    }

    // Format as response time in ms/s
    return time < 1000 ? `${time}ms` : `${(time / 1000).toFixed(1)}s`;
  };

  const shortenErrorMessage = (message?: string) => {
    if (!message) return "";

    // Common DNS error patterns and their shortened versions
    const errorMappings = [
      {
        pattern: /DNS lookup failed: request timed out/i,
        short: "درخواست منقضی شد",
      },
      {
        pattern: /DNS lookup failed: connection refused/i,
        short: "اتصال رد شد",
      },
      { pattern: /DNS lookup failed: no response/i, short: "پاسخی دریافت نشد" },
      {
        pattern: /DNS lookup failed: network unreachable/i,
        short: "شبکه در دسترس نیست",
      },
      { pattern: /DNS lookup failed: server failure/i, short: "خطای سرور" },
      { pattern: /Invalid DNS server IP/i, short: "IP سرور نامعتبر" },
      { pattern: /No IP addresses found/i, short: "آدرس IP یافت نشد" },
      { pattern: /DNS lookup failed: no record/i, short: "رکوردی یافت نشد" },
    ];

    for (const mapping of errorMappings) {
      if (mapping.pattern.test(message)) {
        return mapping.short;
      }
    }

    // If no pattern matches, return truncated version
    return message.length > 35 ? message.substring(0, 32) + "..." : message;
  };

  return (
    <div
      className={`${props.status ? "bg-[#142A20]" : "bg-[#301B1F]"
        } min-h-[70px] rounded-lg mb-2 flex justify-between items-center py-3 px-4 dir-en gap-2`}
    >
      <div className="w-9/15 flex flex-col gap-[5px]">
        <p className="w-full flex justify-start items-center gap-2 mb-1 min-w-0">
          <button
            className={`shrink-0 rounded transition-all duration-200 hover:bg-white/10 size-6 flex items-center justify-center ${isCopied
              ? "text-green-400 scale-110"
              : "text-gray-400 hover:text-white cursor-pointer"
              }`}
            onClick={handleCopy}
            disabled={isCopied}
          >
            {isCopied ? <CheckIcon /> : <Clipboard />}
          </button>
          <span className={`transition-colors translate-y-[2.5px] duration-200 text-md truncate min-w-0 ${isCopied ? "text-green-400" : ""}`}>
            {props.dns}
          </span>
          {props.status && props.allowSetDns !== false && (
            <button
              onClick={handleSetDns}
              className="action-chip dir-fa mr-auto"
            >
              تنظیم
            </button>
          )}
        </p>
        {props.responseTime && (
          <p className="pl-1 w-calc(100%-50px) text-xs text-gray-400 text-left">
            {formatResponseTime(props.responseTime)} {props.errorMessage ? `- ${shortenErrorMessage(props.errorMessage)}` : ""}
          </p>
        )}
      </div>
      <div className="w-6/15 flex flex-col items-end">
        <p
          className={`${props.status ? "text-[#3FB950]" : "text-[#F85149]"
            } flex items-center gap-2 mb-1 whitespace-nowrap`}
        >
          {props.status ? "قابل استفاده" : "مسدود شده"}
          <StatusCircle status={props.status} />
        </p>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="animate-bounce-once"
    >
      <path
        fillRule="evenodd"
        d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
      />
    </svg>
  );
}

function StatusCircle({ status }: { status: boolean }) {
  return (
    <div className="w-4 h-4">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="8"
          cy="8"
          r="8"
          fill={status ? "url(#greenGradient)" : "url(#redGradient)"}
        />
        <defs>
          {/* Green gradient for true status */}
          <linearGradient
            id="greenGradient"
            x1="0"
            y1="0"
            x2="16"
            y2="16"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3FB950" />
            <stop offset="1" stopColor="#13641F" />
          </linearGradient>

          {/* Red gradient for false status */}
          <linearGradient
            id="redGradient"
            x1="0"
            y1="0"
            x2="16"
            y2="16"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#F85149" />
            <stop offset="1" stopColor="#741611" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
