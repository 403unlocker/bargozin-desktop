import Clipboard from "./svg/clipboard";
import { useState } from "react";
import { useSetSystemDns } from "../hooks/use-set-system-dns";

export default function DownloadResultItem(props: {
  dns: string;
  status: boolean;
  responseTime?: number;
  errorMessage?: string;
  isDownloadSpeed?: boolean;
  isBest?: boolean;
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

  return (
    <div
      className={`${props.isBest ? "bg-[#263B43] border-[#38727C] border" : props.responseTime == 0 ? "bg-[#301B1F]" : "bg-[#30363D]"
        } min-h-[50px] w-full rounded-lg mb-2 flex justify-between items-center px-3 dir-en py-2`}
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
          <span
            className={`transition-colors translate-y-[2.5px] duration-200 text-left text-[15px] truncate min-w-0 ${isCopied ? "text-green-400" : ""
              }`}
          >
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
      </div>
      <div className="w-6/15 flex flex-col items-end justify-center">
        <p className="flex items-center gap-2 mb-1 whitespace-nowrap">
          <p className="text-left ml-4 text-white text-sm mr-2 translate-y-[2px]">
            {formatResponseTime(props.responseTime)}
          </p>
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
