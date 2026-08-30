import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useAlert } from "../components/alert";

export function useSetSystemDns() {
  const { showAlert } = useAlert();

  const performSetDns = async (dns: string) => {
    const toastId = toast.loading("در حال تنظیم DNS...", {
      position: "top-left",
      className: "dir-fa text-right",
    });

    try {
      const result = await invoke<string>("set_system_dns", { dnsServer: dns });
      toast.success(result, {
        id: toastId,
        position: "top-left",
        className: "dir-fa text-right",
      });
    } catch (error) {
      toast.error(String(error), {
        id: toastId,
        position: "top-left",
        className: "dir-fa text-right",
      });
    }
  };

  const performResetDns = async () => {
    const toastId = toast.loading("در حال بازنشانی DNS...", {
      position: "top-left",
      className: "dir-fa text-right",
    });

    try {
      const result = await invoke<string>("reset_system_dns");
      toast.success(result, {
        id: toastId,
        position: "top-left",
        className: "dir-fa text-right",
      });
    } catch (error) {
      toast.error(String(error), {
        id: toastId,
        position: "top-left",
        className: "dir-fa text-right",
      });
    }
  };

  const requestSetDns = (dns: string) => {
    showAlert({
      title: "تنظیم DNS سیستم",
      message: `DNS سیستم شما به ${dns} تغییر خواهد کرد.`,
      type: "info",
      buttons: [
        { label: "انصراف", action: () => {}, variant: "secondary" },
        {
          label: "تنظیم",
          action: () => {
            void performSetDns(dns);
          },
          variant: "primary",
        },
      ],
    });
  };

  const requestResetDns = () => {
    showAlert({
      title: "بازنشانی DNS",
      message: "DNS سیستم به حالت خودکار (DHCP) بازمی‌گردد.",
      type: "info",
      buttons: [
        { label: "انصراف", action: () => {}, variant: "secondary" },
        {
          label: "بازنشانی",
          action: () => {
            void performResetDns();
          },
          variant: "destructive",
        },
      ],
    });
  };

  return { requestSetDns, requestResetDns };
}
