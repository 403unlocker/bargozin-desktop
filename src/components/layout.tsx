import { useLocation } from "react-router";
import Sidebar from "./sidebar";
import Bargozin from "./svg/bargozin";
import { useTranslation } from "react-i18next";

export default function Layout(props: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isAboutPage = location.pathname === "/about";

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="h-screen bg-[#0D1117] flex flex-col overflow-hidden">
      <header className="h-30 gap-4 text-white bg-gradient-to-b from-[#30363D80] to-[var(--color-bg)] flex items-center justify-between px-10 flex-shrink-0">
        <div>
          <button onClick={() => changeLanguage("en")}>English</button>
          <button onClick={() => changeLanguage("fa")}>فارسی</button>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">{t("layout.title")}</h1>
          <p className="text-sm">{t("layout.subtitle")}</p>
        </div>
        <Bargozin />
      </header>
      <section className="px-4 pb-8 text-white flex flex-1 min-h-0 w-full">
        <main className={`flex-1 overflow-auto ${!isAboutPage ? "mr-4" : ""}`}>
          {props.children}
        </main>
        {!isAboutPage && <Sidebar />}
      </section>
    </div>
  );
}
