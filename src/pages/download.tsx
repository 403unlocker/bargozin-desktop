import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import DoubleChevronDown from "../components/svg/double-chevron-down";
import Question from "../components/svg/question";
import Search from "../components/svg/search";
import DownloadResultItem from "../components/download-result-item";
import { useAlert, useAlertHelpers } from "../components/alert";
import Info from "../components/svg/info";
import { useSetSystemDns } from "../hooks/use-set-system-dns";
import { cancelRunningTests } from "../hooks/use-cancel-test";
import { useScrollHint } from "../hooks/use-scroll-hint";
import { useSyncTestRunning } from "../context/test-session";

// Type definition for download speed test results
interface DownloadSpeedResult {
  dns_server: string;
  url: string;
  success: boolean;
  download_speed_mbps: number;
  downloaded_bytes: number;
  test_duration_seconds: number;
  error_message?: string;
  resolution_time_ms?: number;
  session_id: number;
}

export default function Download() {
  const [isLoading, setIsLoading] = useState(false);
  const [totalExpected] = useState(27);
  const [isCompleted, setIsCompleted] = useState(false);
  const [usableResults, setUsableResults] = useState<DownloadSpeedResult[]>([]);
  const [downloadTime, setDownloadTime] = useState(10);
  const [downloadUrl, setDownloadUrl] = useState("");

  const rightColumnRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const currentSessionRef = useRef<number>(0);

  useEffect(() => {
    console.log("Setting up download test event listeners");

    const unlisten = listen<DownloadSpeedResult>(
      "download-test-result",
      (event) => {
        const result = event.payload;
        console.log("Received download test result:", result);

        if (result.session_id !== currentSessionRef.current) {
          return;
        }

        if (result.success) {
          console.log(
            "Adding successful result:",
            result.dns_server,
            result.download_speed_mbps
          );
          setUsableResults((prev) => [...prev, result]);
          setTimeout(() => scrollToBottom(rightColumnRef), 100);
        } else {
          console.log(
            "Adding failed result:",
            result.dns_server,
            result.error_message
          );
          setUsableResults((prev) => [...prev, result]);
          setTimeout(() => scrollToBottom(leftColumnRef), 100);
        }

      }
    );

    const unlistenComplete = listen("download-test-complete", () => {
      console.log("Download tests completed");
      setIsLoading(false);
      setIsCompleted(true);
    });

    return () => {
      console.log("Cleaning up download test event listeners");
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    console.log("Initializing download test component");

    setIsLoading(false);
    setIsCompleted(false);
    setUsableResults([]);

    invoke("abort_all_tasks");
  }, []);

  // Handler functions
  const handleDownloadTest = async () => {
    console.log("Download test button clicked");
    console.log("URL:", downloadUrl);
    console.log("Timeout:", downloadTime);

    if (!downloadUrl.trim()) {
      alert("لطفاً یک URL معتبر وارد کنید");
      return;
    }

    // Prevent multiple clicks
    if (isLoading) {
      console.log("Test already in progress, ignoring click");
      return;
    }

    console.log("Starting download speed test...");
    setIsLoading(true);
    setIsCompleted(false);
    setUsableResults([]);
    currentSessionRef.current = 0;

    try {
      console.log("About to start download test...");
      // Start download speed tests
      await invoke("test_download_speed_all_dns", {
        url: downloadUrl.trim(),
        timeoutSeconds: downloadTime,
      });

      console.log("Download test started successfully");
    } catch (error) {
      console.error("Download test failed:", error);
      alert(`خطا در تست سرعت دانلود: ${error}`);
      setIsLoading(false);
    }
  };

  const scrollToBottom = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const { showInfo } = useAlertHelpers();
  const { hideAlert } = useAlert();
  const { requestResetDns } = useSetSystemDns();

  const successResults = usableResults.filter((r) => r.success);
  const failedResults = usableResults.filter((r) => !r.success);
  const totalResults = new Set(usableResults.map((result) => result.dns_server)).size;

  const isInProgress =
    !isCompleted &&
    (isLoading || (totalResults > 0 && totalResults < totalExpected));
  const showSuccessMoreHint = useScrollHint(rightColumnRef, [successResults.length]);
  const showFailedMoreHint = useScrollHint(leftColumnRef, [failedResults.length]);
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
              onClick={() => {
                showInfo(
                  "لینک فایلی را وارد کنید که به‌صورت مستقیم قابل دانلود باشد تا سرعت واقعی دانلود از دید DNSهای مختلف سنجیده شود. ",
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
                );
              }}
            >
              <Question className="w-5 h-5" />
            </button>
            آدرس فایل دانلودی{" "}
          </p>
        </div>
        <div className="mb-4 flex gap-2 items-stretch">
          <div className="relative flex-1 min-w-0">
          {/* Progress Bar Background */}
          {(totalResults > 0 || isLoading) && (
            <div className="absolute inset-0 rounded-md overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${isLoading && totalResults === 0
                  ? "bg-linear-to-r from-blue-500/20 via-blue-500/30 to-blue-500/20 animate-pulse"
                  : isLoading && totalResults < totalExpected
                    ? "bg-green-500/25 animate-pulse"
                    : "bg-green-500/30"
                  }`}
                style={{
                  width:
                    isLoading && totalResults === 0
                      ? "100%"
                      : `${totalExpected > 0
                        ? (totalResults / totalExpected) * 100
                        : 0
                      }%`,
                }}
              ></div>
            </div>
          )}

          <input
            type="text"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleDownloadTest();
              }
            }}
            className="main-input dir-fa"
            placeholder="لینکی که مستقیما به شروع دانلود منجر می‌شود را وارد کنید"
            disabled={isInProgress}
          />

          {/* Progress Text */}
          {isInProgress && (
            <div className="absolute left-50 top-1/2 transform -translate-y-1/2 text-xs text-gray-400 z-20 pointer-events-none">
              {isLoading && totalResults === 0
                ? "در حال شروع تست..."
                : `${totalResults} / ${totalExpected}`}
            </div>
          )}

          <button
            onClick={handleDownloadTest}
            disabled={isInProgress}
            className="submit-button group dir-fa"
          >
            <Search />
            {isInProgress ? "در حال بررسی..." : "بررسی سرعت دانلود"}
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

      <div>
        <div className="flex items-center gap-2 justify-start dir-fa mb-4">
          <h2>مدت زمان تست هر DNS</h2>
          <button
            className="cursor-pointer"
            onClick={() => {
              showInfo(
                "این زمان برای اینکه سرعت هر DNS را بسنجیم، به آن فرصت می‌دهیم تا در یک بازه زمانی مشخص، بخشی از فایل شما را دانلود کند. با این روش، سرعت دانلود هر DNS را مشخص می‌کنیم.پیشنهاد ما برای این زمان، بین ۷ تا ۱۵ ثانیه است.",
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
              );
            }}
          >
            <Question className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-end gap-2 dir-fa">
          <div className="w-30.5 h-10.75 bg-[#30363D] border-[#444C56] border rounded-xl grid grid-cols-3 cursor-pointer">
            <button
              onClick={() => setDownloadTime(downloadTime + 1)}
              className="h-full w-full flex items-center justify-center hover:bg-[#262a30] rounded-r-xl p-1 select-none cursor-pointer"
            >
              +
            </button>
            <input
              type="text"
              className={`h-full w-full flex items-center justify-center text-center pt-[0.2rem] ${downloadTime <= 5 || downloadTime > 10 ? "text-[#F5C518]" : ""
                }`}
              value={downloadTime}
              onChange={(e) => setDownloadTime(Number(e.target.value) || 0)}
            />
            <button
              onClick={() => setDownloadTime(downloadTime - 1)}
              className="h-full w-full flex items-center justify-center hover:bg-[#262a30] rounded-l-xl p-1 select-none cursor-pointer"
            >
              -
            </button>
          </div>
          <p className="h-full text-md">ثانیه</p>
        </div>
        <div className="text-right dir-fa mt-3 text-sm text-[#F5C518] flex items-center h-5">
          {downloadTime <= 5 ? (
            <>
              <Info fill="#F5C518" />
              <p className="mr-1">
                زمان تست کوتاه (کمتر از ۷ ثانیه) ممکن است نتایج را نامعتبر کند.
              </p>
            </>
          ) : null}

          {downloadTime > 10 ? (
            <>
              <Info fill="#F5C518" />
              <p className="mr-1">
                زمان تست طولانی (بیشتر از ۱۵ ثانیه) می‌تواند انتظار شما را به
                شدت افزایش دهد.{" "}
              </p>
            </>
          ) : null}
        </div>
      </div>

      {/* Results Section - Takes remaining space */}
      <div className="flex-1 flex flex-col min-h-0 mt-2 mb-20">
        {(totalResults > 0 || isCompleted) && (
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 dir-fa">
            {/* Right Column - Successful */}
            <div className="relative flex flex-col overflow-auto">
              <div className="mb-4 text-center shrink-0">
                <span className="text-green-400 text-sm font-medium">
                  قابل استفاده ({successResults.length})
                </span>
              </div>
              <div
                ref={rightColumnRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4 w-full"
              >
                {successResults
                  .sort((a, b) => b.download_speed_mbps - a.download_speed_mbps)
                  .map((result, index) => (
                    <DownloadResultItem
                      key={`success-${index}`}
                      dns={result.dns_server}
                      status={true}
                      responseTime={result.download_speed_mbps / 8}
                      errorMessage={result.error_message}
                      isDownloadSpeed={true}
                      isBest={index === 0}
                    />
                  ))}
                {successResults.length === 0 && isCompleted && (
                  <div className="flex items-center justify-center h-full text-gray-400 text-center">
                    <p>متأسفانه هیچ سرور DNS قابل استفاده‌ای یافت نشد</p>
                  </div>
                )}
              </div>

              {successResults.length > 5 && showSuccessMoreHint && (
                <>
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-[#0D1117] to-transparent pointer-events-none"></div>
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

            {/* Left Column - Failed */}
            <div className="relative flex flex-col overflow-auto">
              <div className="mb-4 text-center shrink-0">
                <span className="text-red-400 text-sm font-medium">
                  ناموفق ({failedResults.length})
                </span>
              </div>
              <div
                ref={leftColumnRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4 w-full"
              >
                {failedResults.map((result, index) => (
                  <DownloadResultItem
                    key={`failed-${index}`}
                    dns={result.dns_server}
                    status={false}
                    responseTime={0}
                    errorMessage={result.error_message}
                    isDownloadSpeed={true}
                    allowSetDns={false}
                  />
                ))}
              </div>

              {failedResults.length > 5 && showFailedMoreHint && (
                <>
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-[#0D1117] to-transparent pointer-events-none"></div>
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
