import { useAlert, useAlertHelpers } from "../components/alert";
import DoubleChevronDown from "../components/svg/double-chevron-down";
import Question from "../components/svg/question";
import Search from "../components/svg/search";
import TestResultItem from "../components/test-result-item";
import { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import XIcon from "../components/svg/x-icon";
import CheckIcon from "../components/svg/check-icon";
import Retry from "../components/svg/retry";
import { useSetSystemDns } from "../hooks/use-set-system-dns";
import { cancelRunningTests } from "../hooks/use-cancel-test";
import { useScrollHint } from "../hooks/use-scroll-hint";
import { useSyncTestRunning } from "../context/test-session";

interface DnsTestResult {
  dns_server: string;
  status: boolean;
  response_time?: number;
  error_message?: string;
  session_id: number;
}

export default function DomainTest() {
  const { showInfo, showError } = useAlertHelpers();
  const { hideAlert } = useAlert();
  const { requestResetDns } = useSetSystemDns();
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const currentSessionRef = useRef<number>(0);

  const [domain, setDomain] = useState("");
  const [usableResults, setUsableResults] = useState<DnsTestResult[]>([]);
  const [unusableResults, setUnusableResults] = useState<DnsTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const scrollToBottom = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const unlisten = listen<DnsTestResult>("dns-test-result", (event) => {
      const result = event.payload;

      if (result.session_id !== currentSessionRef.current) {
        console.log(
          `Ignoring result from old session ${result.session_id}, current session: ${currentSessionRef.current}`
        );
        return;
      }

      if (result.status) {
        setUsableResults((prev) => [...prev, result]);
      } else {
        setUnusableResults((prev) => [...prev, result]);
        setTimeout(() => scrollToBottom(leftColumnRef), 100);
      }
    });

    const unlistenComplete = listen("dns-test-complete", () => {
      setIsLoading(false);
      setIsCompleted(true);
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const initializeSession = async () => {
      setIsLoading(false);
      setIsCompleted(false);
      setUsableResults([]);
      setUnusableResults([]);
    };

    initializeSession();
    invoke("abort_all_tasks");
  }, []);

  const handleDnsTest = async () => {
    if (!domain.trim()) {
      toast.error("لطفاً یک دامنه وارد کنید", {
        position: "top-left",
        className: "text-right dir-fa",
      });
      return;
    }

    // Basic frontend validation for better UX
    let trimmedDomain = domain.trim();
    trimmedDomain = trimmedDomain.replace("https://", "");
    if (
      trimmedDomain.includes("/") ||
      trimmedDomain.includes("?") ||
      trimmedDomain.includes("#")
    ) {
      toast.error("لطفاً فقط نام دامنه وارد کنید (مثلا: google.com)", {
        position: "top-left",
        className: "dir-fa text-right",
      });
      return;
    }

    // Prevent multiple clicks
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setIsCompleted(false);
    setUsableResults([]);
    setUnusableResults([]);
    currentSessionRef.current = 0;

    try {
      await invoke("test_dns_servers", {
        domain: domain.trim(),
      });
    } catch (error) {
      console.error("DNS test error:", error);
      showError("خطا در انجام تست DNS: " + error);
      setIsLoading(false);
    }
  };

  const totalResults = new Set(
    [...usableResults, ...unusableResults].map((result) => result.dns_server)
  ).size;
  const totalExpected = 27; // Total number of DNS servers
  const isInProgress =
    !isCompleted &&
    (isLoading || (totalResults > 0 && totalResults < totalExpected));
  const showUsableMoreHint = useScrollHint(rightColumnRef, [usableResults.length]);
  const showUnusableMoreHint = useScrollHint(leftColumnRef, [unusableResults.length]);
  useSyncTestRunning(isInProgress);

  const handleCancel = async () => {
    currentSessionRef.current += 1;
    await cancelRunningTests();
    setIsLoading(false);
    setIsCompleted(true);
  };

  return (
    <div className="text-right h-full flex flex-col pr-8.75">
      {/* Input Section - Fixed height */}
      <div className="shrink-0">
        <div className="mb-4 flex justify-between items-center min-h-8">
          <button onClick={requestResetDns} className="reset-dns-btn dir-fa">
            بازنشانی DNS
          </button>
          <p className="flex justify-end items-center gap-2">
            <button
              className="cursor-pointer"
              onClick={() =>
                showInfo(
                  "دامنه موردنظر خود را وارد کنید تا بررسی کنیم کدام سرورهای DNS می‌توانند آن را با موفقیت باز کنند.",
                  {
                    buttons: [
                      {
                        label: "متوجه شدم",
                        action: () => {
                          hideAlert("docker-image-validation-error");
                        },
                        variant: "none",
                      },
                    ],
                  }
                )
              }
            >
              <Question className="w-5 h-5" />
            </button>
            دامنه مورد نظر
          </p>
        </div>
        <div className="mb-4 flex gap-2 items-stretch">
          <div className="relative flex-1 min-w-0">
          {/* Progress Bar Background */}
          {(totalResults > 0 || isLoading) && (
            <div className="absolute inset-0 rounded-md overflow-hidden">
              <div
                className={`h-full bg-green-500/25 transition-all duration-300 ${totalResults > 0 && totalResults < totalExpected
                  ? "pulse-effect"
                  : ""
                  }`}
                style={{
                  width: `${(totalResults / totalExpected) * 100}%`,
                }}
              ></div>
            </div>
          )}

          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDnsTest()}
            className="main-input dir-fa"
            placeholder="مثلا spotify.com"
            disabled={isInProgress}
            autoCorrect="off"
            autoComplete="off"
            spellCheck="false"
          />

          {/* Progress Text */}
          {isInProgress && (
            <div className="absolute left-42.5 top-1/2 transform -translate-y-1/2 text-xs text-gray-400 z-20 pointer-events-none">
              {totalResults} / {totalExpected}
            </div>
          )}

          <button
            onClick={handleDnsTest}
            disabled={isInProgress}
            className="submit-button group dir-fa"
          >
            <Search />
            {isInProgress ? "در حال بررسی..." : "بررسی DNS ها"}
          </button>
          </div>

          {isInProgress && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="cancel-test-button-standalone"
              title="لغو"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="1" width="4.5" height="14" rx="1.2"/><rect x="9.5" y="1" width="4.5" height="14" rx="1.2"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Results Section - Takes remaining space */}
      <div className="flex-1 flex flex-col min-h-0 mb-20">
        {(totalResults > 0 || isCompleted) && (
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 dir-fa">
            {/* Right Column - Usable DNS servers */}
            <div className="relative flex flex-col overflow-auto">
              <div className="mb-4 text-center shrink-0">
                <span className="text-green-400 text-sm font-medium">
                  قابل استفاده ({usableResults.length})
                </span>
              </div>
              <div
                ref={rightColumnRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4"
              >
                {usableResults
                  .sort((a, b) => (a.response_time ?? 1000) - (b.response_time ?? 1000))
                  .map((result, index) => (
                    <TestResultItem
                      key={`usable-${index}`}
                      dns={result.dns_server}
                      status={result.status}
                      responseTime={result.response_time}
                      errorMessage={result.error_message}
                    />
                  ))}
                {usableResults.length === 0 && isCompleted && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center">
                    <XIcon />
                    <p className="text-[#F85149] mt-4 text-[17px]">
                      متأسفانه هیچ سرور DNS قابل استفاده‌ای یافت نشد
                    </p>
                    <p className="text-[14px]">
                      لطفا اتصال اینترنت خود را بررسی کرده و مجدداً تلاش کنید.
                    </p>
                    <button
                      onClick={handleDnsTest}
                      className="flex gap-2 mt-2 cursor-pointer text-white hover:text-[#848484] transition-colors duration-200 shadow-lg dir-fa items-center justify-center px-4 py-2 rounded-lg text-sm"
                    >
                      <Retry />
                      تست مجدد
                    </button>
                  </div>
                )}
              </div>

              {usableResults.length > 5 && showUsableMoreHint && (
                <>
                  {/* Black Gradient Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-[#0D1117] to-transparent pointer-events-none"></div>

                  {/* More Items Button */}
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                    <button
                      onClick={() => scrollToBottom(rightColumnRef)}
                      className="text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-lg dir-fa flex items-center gap-2 cursor-pointer"
                    >
                      <DoubleChevronDown />
                      موارد بیشتر
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Left Column - Unusable DNS servers */}
            <div className="relative flex flex-col overflow-auto">
              <div className="mb-4 text-center shrink-0">
                <span className="text-red-400 text-sm font-medium">
                  مسدود شده ({unusableResults.length})
                </span>
              </div>
              <div
                ref={leftColumnRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4"
              >
                {unusableResults.map((result, index) => (
                  <TestResultItem
                    key={`unusable-${index}`}
                    dns={result.dns_server}
                    status={result.status}
                    responseTime={Number(result.response_time?.toFixed(0))}
                    errorMessage={result.error_message}
                  />
                ))}
                {unusableResults.length === 0 && isCompleted && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <CheckIcon />
                    <p className="text-[#3FB950] mt-4">
                      همه DNS های بررسی‌شده در دسترس هستند
                    </p>
                  </div>
                )}
              </div>

              {unusableResults.length >= 5 && showUnusableMoreHint && (
                <>
                  {/* Black Gradient Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-[#0D1117] to-transparent pointer-events-none"></div>

                  {/* More Items Button */}
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                    <button
                      onClick={() => scrollToBottom(leftColumnRef)}
                      className="text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-lg dir-fa flex items-center gap-2 cursor-pointer"
                    >
                      <DoubleChevronDown />
                      موارد بیشتر
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
