import { useAlertHelpers, useAlert } from "../components/alert";
import DoubleChevronDown from "../components/svg/double-chevron-down";
import Question from "../components/svg/question";
import Search from "../components/svg/search";
import DownloadResultItem from "../components/download-result-item";
import { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import Info from "../components/svg/info";

interface DockerRegistryTestResult {
  registry: string;
  image_name: string;
  success: boolean;
  download_speed_mbps: number;
  downloaded_bytes: number;
  test_duration_seconds: number;
  error_message?: string;
  session_id: number;
}

export default function Docker() {
  const { showInfo, showError } = useAlertHelpers();
  const { hideAlert } = useAlert();
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const currentSessionRef = useRef<number>(0);

  const [domain, setDomain] = useState("");
  const [allResults, setAllResults] = useState<DockerRegistryTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(10);

  const scrollToBottom = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    // Listen for individual Docker registry test results
    const unlisten = listen<DockerRegistryTestResult>(
      "docker-registry-test-result",
      (event) => {
        const result = event.payload;

        // Ignore results from old sessions using ref for current value
        if (result.session_id !== currentSessionRef.current) {
          console.log(
            `Ignoring result from old session ${result.session_id}, current session: ${currentSessionRef.current}`
          );
          return;
        }

        setAllResults((prev) => [...prev, result]);
        // Auto-scroll when new result arrives
        setTimeout(() => scrollToBottom(rightColumnRef), 100);
      }
    );

    // Listen for completion event
    const unlistenComplete = listen("docker-registry-test-complete", () => {
      setIsLoading(false);
      setIsCompleted(true);
    });

    // Cleanup listeners on component unmount
    return () => {
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, []);

  // Cleanup effect - Cancel ongoing tests when component unmounts
  useEffect(() => {
    return () => {
      // Cancel any ongoing Docker registry tests when user navigates away
      invoke("cancel_docker_registry_tests").catch((error) => {
        console.log("Failed to cancel Docker registry tests:", error);
      });
    };
  }, []);

  // Reset state when component mounts to ensure clean start
  useEffect(() => {
    const initializeSession = async () => {
      // Clear any existing state from previous sessions
      setIsLoading(false);
      setIsCompleted(false);
      setAllResults([]);

      // Get current session ID WITHOUT cancelling
      const sessionId = await invoke<number>("get_current_session").catch(
        (error) => {
          console.log("Failed to get current session:", error);
          return 0;
        }
      );

      currentSessionRef.current = sessionId;
      console.log("Initialized with session:", sessionId);
    };

    initializeSession();
  }, []);

  const handleDockerRegistryTest = async () => {
    if (!domain.trim()) {
      toast.error("لطفاً یک نام ایمیج داکر وارد کنید", {
        position: "top-left",
        className: "text-right dir-fa",
      });
      return;
    }

    // Basic frontend validation for better UX
    const trimmedDomain = domain.trim();

    // Validate Docker image name format
    try {
      const isValid = await invoke<boolean>("validate_docker_image", {
        imageName: trimmedDomain,
      });

      if (!isValid) {
        toast.error(
          "لطفاً یک نام ایمیج داکر معتبر وارد کنید (مثلا: ubuntu:latest)",
          {
            position: "top-left",
            className: "dir-fa text-right",
          }
        );
        return;
      }
    } catch (error) {
      toast.error("خطا در اعتبارسنجی نام ایمیج: " + error, {
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
    setAllResults([]);

    try {
      // Start Docker registry tests (this will generate a new session ID in backend)
      await invoke("test_docker_registries", {
        imageName: domain.trim(),
        timeoutSeconds: timeoutSeconds,
      });

      // Get the new session ID that was created for this test
      const newSessionId = await invoke<number>("get_current_session");
      currentSessionRef.current = newSessionId;
      console.log("Started Docker registry test with session:", newSessionId);
    } catch (error) {
      console.error("Docker registry test error:", error);
      showError("خطا در انجام تست رجیستری داکر: " + error);
      setIsLoading(false);
    }
  };

  const totalResults = allResults.length;
  const totalExpected = 9; // Total number of Docker registries

  return (
    <div className="text-right h-full flex flex-col px-[35px]">
      {/* Input Section - Fixed height */}
      <div className="flex-shrink-0">
        <p className="mb-4 flex justify-end items-center gap-2">
          <button
            className="cursor-pointer"
            onClick={() =>
              showInfo(
                "در این فیلد باید نام کامل ایمیج داکر مورد نظر خود را وارد کنید. این نام شامل ریپازیتوری، تگ و در صورت نیاز، آدرس ریجیستری خواهد بود. اطمینان حاصل کنید که نام وارد شده دقیق و صحیح باشد تا فرآیند دانلود به درستی انجام شود.",
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
          ایمیج داکر
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
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleDockerRegistryTest()}
            className="bg-[#30363D] border border-[#6B7280] rounded-md p-4 text-sm w-full text-right dir-fa focus:outline-none focus:border-[#8B9DC3] relative z-10"
            placeholder="مثلا ubuntu:latest"
            disabled={isLoading}
            autoCorrect="off"
            autoComplete="off"
            spellCheck="false"
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
            onClick={handleDockerRegistryTest}
            disabled={
              isLoading || (totalResults > 0 && totalResults < totalExpected)
            }
            className="group dir-fa absolute left-2 top-[7px] p-2 px-5 transition rounded bg-[#38727C] text-white flex items-center gap-2 cursor-pointer hover:bg-[#96989A] hover:text-[#848484] disabled:opacity-50 disabled:cursor-not-allowed z-20"
          >
            <Search />
            {isLoading || (totalResults > 0 && totalResults < totalExpected)
              ? "در حال بررسی..."
              : "بررسی رجیستری‌ها"}
          </button>
        </div>

        <div>
          <div className="flex items-center gap-2 justify-start dir-fa mb-4">
            <h2>مدت زمان تست هر رجیستری</h2>
            <button
              className="cursor-pointer"
              onClick={() => {
                showInfo(
                  "این زمان برای اینکه سرعت هر رجیستری را بسنجیم، به آن فرصت می‌دهیم تا در یک بازه زمانی مشخص، بخشی از فایل شما را دانلود کند. با این روش، سرعت دانلود هر رجیستری را مشخص می‌کنیم.پیشنهاد ما برای این زمان، بین ۷ تا ۱۵ ثانیه است.",
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
                onClick={() => setTimeoutSeconds(timeoutSeconds + 1)}
                className="h-full w-full flex items-center justify-center hover:bg-[#262a30] rounded-r-xl p-1 select-none cursor-pointer"
              >
                +
              </button>
              <input
                type="text"
                className="h-full w-full flex items-center justify-center text-center"
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              />
              <button
                onClick={() => setTimeoutSeconds(timeoutSeconds - 1)}
                className="h-full w-full flex items-center justify-center hover:bg-[#262a30] rounded-l-xl p-1 select-none cursor-pointer"
              >
                -
              </button>
            </div>
            <p className="h-full text-md">ثانیه</p>
          </div>

          <div className="text-right dir-fa mt-3 text-sm text-[#F5C518] flex items-center h-[20px]">
            {timeoutSeconds <= 5 ? (
              <>
                <Info fill="#F5C518" />
                <p className="mr-1">
                  زمان تست کوتاه (کمتر از ۷ ثانیه) ممکن است نتایج را نامعتبر
                  کند.
                </p>
              </>
            ) : null}

            {timeoutSeconds > 10 ? (
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
      </div>

      {/* Results Section - Takes remaining space */}
      <div className="flex-1 flex flex-col min-h-0">
        <p className="text-right mb-2 mt-2">نتایج تست</p>

        {(totalResults > 0 || isCompleted) && (
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 dir-fa">
            {/* Right Column - Docker registries */}
            <div className="relative flex flex-col overflow-auto justify-center items-center">
              <div
                ref={rightColumnRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4 w-full"
              >
                {allResults
                  .sort((a, b) => b.download_speed_mbps - a.download_speed_mbps)
                  .map((result, index) => (
                    <DownloadResultItem
                      key={`registry-${index}`}
                      dns={result.registry}
                      status={result.success}
                      responseTime={result.download_speed_mbps / 8} // Convert to MB/s
                      errorMessage={result.error_message}
                      isDownloadSpeed={true}
                      isBest={index === 0 && result.success}
                    />
                  ))}
              </div>

              {allResults.length > 5 && (
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

            {/* Left Column - Empty (matching download page) */}
            <div className="relative flex flex-col overflow-auto justify-center items-center">
              <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
