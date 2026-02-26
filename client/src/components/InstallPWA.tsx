import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallState = "idle" | "available" | "ios-tip" | "installed" | "dismissed";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function InstallPWA() {
  const [state, setState] = useState<InstallState>("idle");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Já instalado — não mostra nada
    if (isInStandaloneMode()) {
      setState("installed");
      return;
    }

    // Já dispensou antes nesta sessão
    if (sessionStorage.getItem("pwa-dismissed")) {
      setState("dismissed");
      return;
    }

    // iOS: não tem evento beforeinstallprompt, mostramos dica manual
    if (isIOS()) {
      const timer = setTimeout(() => setState("ios-tip"), 3000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: escuta o evento nativo
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setState("available");
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setState("installed");
    } else {
      handleDismiss();
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("pwa-dismissed", "1");
    setState("dismissed");
  };

  if (state !== "available" && state !== "ios-tip") return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up"
      style={{ maxWidth: 420, margin: "0 auto" }}
    >
      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{
          background: "oklch(0.14 0.008 260)",
          border: "1px solid oklch(0.72 0.22 142 / 0.35)",
          boxShadow: "0 8px 32px oklch(0.05 0.005 260 / 0.8), 0 0 0 1px oklch(0.72 0.22 142 / 0.1)",
        }}
      >
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: "oklch(0.72 0.22 142 / 0.15)",
            border: "1px solid oklch(0.72 0.22 142 / 0.3)",
          }}
        >
          <Smartphone className="w-5 h-5" style={{ color: "oklch(0.72 0.22 142)" }} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-bold mb-0.5"
            style={{ color: "oklch(0.90 0.01 260)", fontFamily: "'JetBrains Mono', monospace" }}
          >
            Instalar Monitor de Palco
          </p>

          {state === "available" ? (
            <>
              <p className="text-xs mb-3" style={{ color: "oklch(0.60 0.01 260)" }}>
                Adicione à tela inicial para acesso rápido durante o ensaio.
              </p>
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all active:scale-95"
                style={{
                  background: "oklch(0.72 0.22 142)",
                  color: "oklch(0.10 0.005 260)",
                }}
              >
                <Download className="w-3.5 h-3.5" />
                INSTALAR AGORA
              </button>
            </>
          ) : (
            <>
              <p className="text-xs" style={{ color: "oklch(0.60 0.01 260)" }}>
                No Safari, toque em{" "}
                <span
                  className="font-semibold px-1 py-0.5 rounded"
                  style={{ background: "oklch(0.20 0.01 260)", color: "oklch(0.80 0.01 260)" }}
                >
                  Compartilhar ↑
                </span>{" "}
                e depois{" "}
                <span
                  className="font-semibold px-1 py-0.5 rounded"
                  style={{ background: "oklch(0.20 0.01 260)", color: "oklch(0.80 0.01 260)" }}
                >
                  Adicionar à Tela de Início
                </span>
              </p>
            </>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ color: "oklch(0.45 0.01 260)" }}
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
