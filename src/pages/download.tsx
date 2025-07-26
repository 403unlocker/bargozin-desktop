import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import DoubleChevronDown from "../components/svg/double-chevron-down";
import Question from "../components/svg/question";
import Search from "../components/svg/search";
import DownloadResultItem from "../components/download-result-item";
import { useAlert, useAlertHelpers } from "../components/alert";
import Info from "../components/svg/info";

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
}

export default function Download() {
  // State variables
  const [isLoading, setIsLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [totalExpected] = useState(26); // Number of DNS servers
  const [isCompleted, setIsCompleted] = useState(false);
  const [usableResults, setUsableResults] = useState<DownloadSpeedResult[]>([]);
  const [downloadTime, setDownloadTime] = useState(10);
  const [downloadUrl, setDownloadUrl] = useState("");

  // Refs for scrolling and session management
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const currentSessionRef = useRef<number>(0);

  // Event listeners for real-time updates
  useEffect(() => {
    console.log("Setting up download test event listeners");

    // Listen for individual download test results
    const unlisten = listen<DownloadSpeedResult>(
      "download-test-result",
      (event) => {
        const result = event.payload;
        console.log("Received download test result:", result);

        if (result.success) {
          console.log(
            "Adding successful result:",
            result.dns_server,
            result.download_speed_mbps
          );
          setUsableResults((prev) => [...prev, result]);
          // Auto-scroll right column when new usable result arrives
          setTimeout(() => scrollToBottom(rightColumnRef), 100);
        } else {
          console.log(
            "Adding failed result:",
            result.dns_server,
            result.error_message
          );
          setUsableResults((prev) => [...prev, result]);
          // Auto-scroll left column when new unusable result arrives
          setTimeout(() => scrollToBottom(leftColumnRef), 100);
        }

        // Update total results count
        setTotalResults((prev) => {
          const newCount = prev + 1;
          console.log("Total results count:", newCount);
          return newCount;
        });
      }
    );

    // Listen for completion event
    const unlistenComplete = listen("download-test-complete", () => {
      console.log("Download tests completed");
      setIsLoading(false);
      setIsCompleted(true);
    });

    // Cleanup listeners on component unmount
    return () => {
      console.log("Cleaning up download test event listeners");
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, []);

  // Cleanup effect - Cancel ongoing tests when component unmounts
  useEffect(() => {
    return () => {
      // Cancel any ongoing download tests when user navigates away
      invoke("cancel_download_tests").catch((error) => {
        console.log("Failed to cancel download tests:", error);
      });
    };
  }, []);

  // Reset state when component mounts to ensure clean start
  useEffect(() => {
    let isInitializing = false;

    const initializeSession = async () => {
      if (isInitializing) {
        console.log("Already initializing, skipping...");
        return;
      }

      isInitializing = true;
      console.log("Starting download test initialization...");

      // Clear any existing state from previous sessions
      setIsLoading(false);
      setIsCompleted(false);
      setUsableResults([]);
      setTotalResults(0);

      // Get current session ID WITHOUT cancelling
      console.log("Getting current session ID...");
      const sessionId = await invoke<number>("get_current_session").catch(
        (error) => {
          console.log("Failed to get current session:", error);
          return 0;
        }
      );

      currentSessionRef.current = sessionId;
      console.log("Initialized download test with session:", sessionId);
      console.log("Session stored in ref:", currentSessionRef.current);

      isInitializing = false;
    };

    initializeSession();
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
    setTotalResults(0);

    try {
      // Start download speed tests
      console.log("Invoking test_download_speed_all_dns command");
      console.log("Current session ref:", currentSessionRef.current);

      await invoke("test_download_speed_all_dns", {
        url: downloadUrl.trim(),
        timeoutSeconds: downloadTime,
      });

      console.log("Successfully invoked download speed test command");
    } catch (error) {
      console.error("Download test failed:", error);
      alert(`خطا در تست سرعت دانلود: ${error}`);
      setIsLoading(false);
    }
  };

  const scrollToBottom = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const { showInfo } = useAlertHelpers();
  const { hideAlert } = useAlert();

  return (
    <div className="text-right h-full flex flex-col px-[35px]">
      {/* Input Section - Fixed height */}
      <div className="flex-shrink-0">
        <p className="mb-4 flex justify-end items-center gap-2">
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
        <div className="mb-4 relative">
          {/* Progress Bar Background */}
          {(totalResults > 0 || isLoading) && (
            <div className="absolute inset-0 rounded-md overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isLoading && totalResults === 0
                    ? "bg-gradient-to-r from-blue-500/20 via-blue-500/30 to-blue-500/20 animate-pulse"
                    : isLoading && totalResults < totalExpected
                    ? "bg-green-500/25 animate-pulse"
                    : "bg-green-500/30"
                }`}
                style={{
                  width:
                    isLoading && totalResults === 0
                      ? "100%"
                      : `${
                          totalExpected > 0
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
            className="bg-[#30363D] border border-[#6B7280] rounded-md p-4 text-sm w-full text-right dir-fa focus:outline-none focus:border-[#8B9DC3] relative z-10"
            placeholder="لینکی که مستقیما به شروع دانلود منجر می‌شود را وارد کنید"
            disabled={isLoading}
          />

          {/* Progress Text */}
          {(totalResults > 0 || isLoading) && (
            <div className="absolute left-[200px] top-1/2 transform -translate-y-1/2 text-xs text-gray-400 z-20">
              {isLoading && totalResults === 0
                ? "در حال شروع تست..."
                : `${totalResults} / ${totalExpected} ${
                    isCompleted ? "تکمیل شد" : ""
                  }`}
            </div>
          )}

          <button
            onClick={handleDownloadTest}
            disabled={
              isLoading || (totalResults > 0 && totalResults < totalExpected)
            }
            className="group dir-fa absolute left-2 top-[7px] p-2 px-5 transition rounded bg-[#38727C] text-white flex items-center gap-2 cursor-pointer hover:bg-[#96989A] hover:text-[#848484] disabled:opacity-50 disabled:cursor-not-allowed z-20"
          >
            <Search />
            {isLoading || (totalResults > 0 && totalResults < totalExpected)
              ? "در حال بررسی..."
              : "بررسی سرعت دانلود"}
          </button>
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
          <div className="w-[132px] h-[60px] bg-[#30363D] border-[#444C56] border rounded-xl grid grid-cols-3 cursor-pointer">
            <button
              onClick={() => setDownloadTime(downloadTime + 1)}
              className="h-full w-full flex items-center justify-center hover:bg-[#262a30] rounded-r-xl p-1 select-none cursor-pointer"
            >
              +
            </button>
            <input
              type="text"
              className={`h-full w-full flex items-center justify-center text-center ${
                downloadTime <= 5 || downloadTime > 10 ? "text-[#F5C518]" : ""
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
        <div className="text-right dir-fa mt-3 text-sm text-[#F5C518] flex items-center h-[20px]">
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
      <div className="flex-1 flex flex-col min-h-0 mt-2">
        <p className="text-right mb-2">نتایج تست</p>

        {(totalResults > 0 || isCompleted) && (
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 dir-fa">
            {/* Right Column - Usable DNS servers */}
            <div className="relative flex flex-col overflow-auto justify-center items-center">
              <div
                ref={rightColumnRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4 w-full"
              >
                {usableResults
                  .sort((a, b) => b.download_speed_mbps - a.download_speed_mbps)
                  .map((result, index) => (
                    <DownloadResultItem
                      key={`usable-${index}`}
                      dns={result.dns_server}
                      status={result.success}
                      responseTime={result.download_speed_mbps / 8}
                      errorMessage={result.error_message}
                      isDownloadSpeed={true}
                      isBest={index === 0}
                    />
                  ))}
                {usableResults.filter((result) => result.success).length ===
                  0 &&
                  isCompleted && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                      <p>متأسفانه هیچ سرور DNS قابل استفاده‌ای یافت نشد</p>
                    </div>
                  )}
              </div>

              {usableResults.filter((result) => result.success).length > 5 && (
                <>
                  {/* Black Gradient Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0D1117] to-transparent pointer-events-none"></div>

                  {/* More Items Button */}
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                    <button
                      onClick={() => scrollToBottom(rightColumnRef)}
                      className="text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-lg dir-fa flex items-center gap-2"
                    >
                      <DoubleChevronDown />
                      موارد بیشتر
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Left Column - Unusable DNS servers */}
            <div className="relative flex flex-col overflow-auto justify-center items-center">
              <div
                ref={leftColumnRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4"
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
