import { Link, useLocation } from "react-router";
import SidebarItem from "./sidebar-item";
import Docker from "./svg/docker";
import Download from "./svg/download";
import Web from "./svg/web";
import Info from "./svg/info";

export default function Sidebar() {
  const location = useLocation();
  const isActive = location.pathname === "/about";

  return (
    <div className="bg-[#161B22] w-[245px] text-right px-7 py-4 rounded-2xl h-full flex flex-col justify-between min-h-0">
      <div className="w-full">
        <h3 className="w-full text-white text-md font-light text-right mt-2">
          سرویس ها
        </h3>
        <div className="w-full mt-4 flex flex-col gap-2">
          <SidebarItem icon={<Web />} title="تست دامنه" href="/" />
          <SidebarItem
            icon={<Download />}
            title="دانلود بهینه فایل"
            href="/download"
          />
          <SidebarItem icon={<Docker />} title="تست داکر" href="/docker" />
        </div>
      </div>
      <div className="w-full border-t pt-4 border-gray-700">
        <Link
          to="/about"
          className="flex items-center justify-end gap-2 text-right mb-[15px] text-sm rounded-lg px-2 py-1 group hover:text-[#0A3879]"
        >
          <span>درباره ما</span>
          <span className="group-hover:[&>svg>path]:fill-[#0A3879]">
            <Info fill={isActive ? "#FBFBFB" : "white"} />
          </span>
        </Link>
      </div>
    </div>
  );
}
