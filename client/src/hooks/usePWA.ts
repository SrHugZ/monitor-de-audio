import { useEffect, useState } from "react";

export type SWStatus = "idle" | "registering" | "active" | "updating" | "error" | "unsupported";

export function usePWA() {
  const [swStatus, setSwStatus] = useState<SWStatus>("idle");
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setSwStatus("unsupported");
      return;
    }

    setSwStatus("registering");

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        setSwStatus("active");

        // Detecta atualização disponível
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateAvailable(true);
              setSwStatus("updating");
            }
          });
        });

        // Verifica se já há uma atualização pendente
        if (registration.waiting) {
          setUpdateAvailable(true);
          setSwStatus("updating");
        }
      })
      .catch((err) => {
        console.warn("[PWA] Service worker registration failed:", err);
        setSwStatus("error");
      });

    // Escuta quando o SW assume o controle (após update)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Recarrega a página para aplicar o novo SW
      window.location.reload();
    });
  }, []);

  const applyUpdate = () => {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    });
  };

  return { swStatus, updateAvailable, applyUpdate };
}
