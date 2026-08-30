import { useLocation } from "react-router";
import Sidebar from "./sidebar";
import Bargozin from "./svg/bargozin";
import ProxyFloatingButton from "./proxy-settings";

export default function Layout(props: { children: React.ReactNode }) {
  const location = useLocation();
  const isAboutPage = location.pathname === "/about";

  return (
    <div className="h-screen bg-[#0D1117] flex flex-col overflow-hidden relative">
      <header data-tauri-drag-region className="h-30 gap-4 text-white bg-gradient-to-b from-[#30363D90] to-[var(--color-bg)] flex items-center justify-end px-[100px] flex-shrink-0">
        <div className="text-right">
          <h1 className="text-xl font-bold">برگُزین</h1>
          <p className="text-sm text-[#CDCDCD]">انتخاب بهترین گزینه</p>
        </div>
        <Bargozin />
      </header>
      <section className="px-[100px] margin-auto pb-8 text-white flex flex-1 min-h-0 w-full">
        <main className={`flex-1 overflow-auto ${!isAboutPage ? "mr-4" : ""}`}>
          {props.children}
        </main>
        {!isAboutPage && <Sidebar />}
      </section>
      {!isAboutPage && <ProxyFloatingButton />}
    </div>
  );
}
