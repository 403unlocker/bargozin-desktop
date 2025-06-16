import { useAlertHelpers } from "../components/alert";
import DoubleChevronDown from "../components/svg/double-chevron-down";
import Question from "../components/svg/question";
import Search from "../components/svg/search";
import TestResultItem from "../components/test-result-item";
import { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

interface DnsTestResult {
  dns_server: string;
  status: boolean;
  response_time?: number;
  error_message?: string;
  session_id: number;
}

export default function DomainTest() {
  const { showInfo, showError } = useAlertHelpers();
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const currentSessionRef = useRef<number>(0);

  const [domain, setDomain] = useState("");
  const [usableResults, setUsableResults] = useState<DnsTestResult[]>([]);
  const [unusableResults, setUnusableResults] = useState<DnsTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const scrollToBottom = (ref: React.RefObject<HTMLDivElement>) => {
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    // Listen for individual DNS test results
    const unlisten = listen<DnsTestResult>("dns-test-result", (event) => {
      const result = event.payload;

      // Ignore results from old sessions using ref for current value
      if (result.session_id !== currentSessionRef.current) {
        console.log(
          `Ignoring result from old session ${result.session_id}, current session: ${currentSessionRef.current}`
        );
        return;
      }

      if (result.status) {
        setUsableResults((prev) => [...prev, result]);
        // Auto-scroll right column when new usable result arrives
        setTimeout(() => scrollToBottom(rightColumnRef), 100);
      } else {
        setUnusableResults((prev) => [...prev, result]);
        // Auto-scroll left column when new unusable result arrives
        setTimeout(() => scrollToBottom(leftColumnRef), 100);
      }
    });

    // Listen for completion event
    const unlistenComplete = listen("dns-test-complete", () => {
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
      // Cancel any ongoing DNS tests when user navigates away
      invoke("cancel_dns_tests").catch((error) => {
        console.log("Failed to cancel DNS tests:", error);
      });
    };
  }, []);

  // Reset state when component mounts to ensure clean start
  useEffect(() => {
    const initializeSession = async () => {
      // Clear any existing state from previous sessions
      setIsLoading(false);
      setIsCompleted(false);
      setUsableResults([]);
      setUnusableResults([]);

      // Cancel any leftover tests from previous sessions
      await invoke("cancel_dns_tests").catch((error) => {
        console.log("Failed to cancel leftover DNS tests:", error);
      });

      // Get current session ID
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

  const handleDnsTest = async () => {
    if (!domain.trim()) {
      toast.error("لطفاً یک دامنه وارد کنید",
        {
          position: "top-left",
          className: "text-right dir-fa",
        }
      );
      return;
    }

    // Basic frontend validation for better UX
    const trimmedDomain = domain.trim();
    if (
      trimmedDomain.includes("://") ||
      trimmedDomain.includes("/") ||
      trimmedDomain.includes("?") ||
      trimmedDomain.includes("#")
    ) {
      toast.error(
        "لطفاً فقط نام دامنه وارد کنید (مثلا: google.com)",
        {
          position: "top-left",
          className: "dir-fa text-right",
        }
      );
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

    try {
      // Start DNS tests (this will generate a new session ID in backend)
      await invoke("test_dns_servers", {
        domain: domain.trim(),
      });

      // Get the new session ID that was created for this test
      const newSessionId = await invoke<number>("get_current_session");
      currentSessionRef.current = newSessionId;
      console.log("Started DNS test with session:", newSessionId);
    } catch (error) {
      console.error("DNS test error:", error);
      showError("خطا در انجام تست DNS: " + error);
      setIsLoading(false);
    }
  };

  const totalResults = usableResults.length + unusableResults.length;
  const totalExpected = 26; // Total number of DNS servers

  return (
    <div className="text-right h-full flex flex-col">
      {/* Input Section - Fixed height */}
      <div className="flex-shrink-0">
        <p className="mb-4 flex justify-end items-center gap-2">
          <button
            className="cursor-pointer"
            onClick={() =>
              showInfo(
                "دامنه موردنظر خود را وارد کنید تا بررسی کنیم کدام سرورهای DNS می‌توانند آن را با موفقیت باز کنند."
              )
            }
          >
            <Question className="w-5 h-5" />
          </button>
          دامنه مورد نظر
        </p>
        <div className="mb-4 relative">
          {/* Progress Bar Background */}
          {(totalResults > 0 || isLoading) && (
            <div className="absolute inset-0 rounded-md overflow-hidden">
              <div
                className={`h-full bg-green-500/25 transition-all duration-300 ${
                  totalResults > 0 && totalResults < totalExpected
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
            onKeyPress={(e) => e.key === "Enter" && handleDnsTest()}
            className="bg-[#30363d6a] border border-[#6B7280] rounded-md p-4 text-sm w-full text-right dir-fa focus:outline-none focus:border-[#8B9DC3] relative z-10"
            placeholder="مثلا spotify.com"
            disabled={isLoading}
          />

          {/* Progress Text */}
          {(totalResults > 0 || isLoading) && (
            <div className="absolute left-[200px] top-1/2 transform -translate-y-1/2 text-xs text-gray-400 z-20">
              {totalResults} / {totalExpected}
            </div>
          )}

          <button
            onClick={handleDnsTest}
            disabled={
              isLoading || (totalResults > 0 && totalResults < totalExpected)
            }
            className="group dir-fa absolute left-2 top-[7px] p-2 px-5 transition rounded bg-[#38727C] text-white flex items-center gap-2 cursor-pointer hover:bg-[#96989A] hover:text-[#848484] disabled:opacity-50 disabled:cursor-not-allowed z-20"
          >
            <Search />
            {isLoading || (totalResults > 0 && totalResults < totalExpected)
              ? "در حال بررسی..."
              : "بررسی DNS ها"}
          </button>
        </div>
      </div>

      {/* Results Section - Takes remaining space */}
      <div className="flex-1 flex flex-col min-h-0">
        <p className="text-center">نتایج تست</p>

        {(totalResults > 0 || isCompleted) && (
          <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 dir-fa">
            {/* Right Column - Usable DNS servers */}
            <div className="relative flex flex-col overflow-auto">
              <div className="mb-2 text-center flex-shrink-0">
                <span className="text-green-400 text-sm font-medium">
                  قابل استفاده ({usableResults.length})
                </span>
              </div>
              <div
                ref={rightColumnRef}
                className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 pb-4"
              >
                {usableResults.map((result, index) => (
                  <TestResultItem
                    key={`usable-${index}`}
                    dns={result.dns_server}
                    status={result.status}
                    responseTime={result.response_time}
                    errorMessage={result.error_message}
                  />
                ))}
                {usableResults.length === 0 && isCompleted && (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <p>متأسفانه هیچ سرور DNS قابل استفاده‌ای یافت نشد</p>
                  </div>
                )}
              </div>

              {usableResults.length > 5 && (
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
            <div className="relative flex flex-col overflow-auto">
              <div className="mb-2 text-center flex-shrink-0">
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
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <p>هیچ سرور DNS مسدودی یافت نشد!</p>
                  </div>
                )}
              </div>

              {unusableResults.length >= 5 && (
                <>
                  {/* Black Gradient Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0D1117] to-transparent pointer-events-none"></div>

                  {/* More Items Button */}
                  <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
                    <button
                      onClick={() => scrollToBottom(leftColumnRef)}
                      className="text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 shadow-lg dir-fa flex items-center gap-2"
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
