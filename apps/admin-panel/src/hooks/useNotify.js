import { useNotification } from "@/components/ui/NotificationProvider";

export const useNotify = () => {
  const { showToast } = useNotification();
  
  return {
    success: (msg, dur) => showToast(msg, "success", dur),
    error: (msg, dur) => showToast(msg, "error", dur),
    info: (msg, dur) => showToast(msg, "info", dur),
  };
};
