import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

interface TestSessionValue {
  isTestRunning: boolean;
  setTestRunning: Dispatch<SetStateAction<boolean>>;
}

const TestSessionContext = createContext<TestSessionValue | null>(null);

export function TestSessionProvider({ children }: { children: ReactNode }) {
  const [isTestRunning, setTestRunning] = useState(false);
  const value = useMemo(
    () => ({ isTestRunning, setTestRunning }),
    [isTestRunning]
  );

  return (
    <TestSessionContext.Provider value={value}>
      {children}
    </TestSessionContext.Provider>
  );
}

export function useTestSession() {
  const context = useContext(TestSessionContext);
  if (!context) {
    throw new Error("useTestSession must be used within TestSessionProvider");
  }
  return context;
}

export function useSyncTestRunning(isInProgress: boolean) {
  const { setTestRunning } = useTestSession();
  useEffect(() => {
    setTestRunning(isInProgress);
    return () => setTestRunning(false);
  }, [isInProgress, setTestRunning]);
}
