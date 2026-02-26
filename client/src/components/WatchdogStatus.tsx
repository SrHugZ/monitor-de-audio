/**
 * WatchdogStatus — card de status do watchdog de reconexão automática.
 * Exibe estado atual, contador de tentativas, countdown para próxima tentativa
 * e controles manuais de iniciar/parar.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Clock,
  AlertTriangle,
  Loader2,
  Play,
  Square,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type WatchdogState = "idle" | "watching" | "connecting" | "connected" | "stopped";

interface WatchdogStatusData {
  state: WatchdogState;
  attempts: number;
  lastAttemptAt: Date | string | null;
  nextAttemptAt: Date | string | null;
  lastError: string | null;
  intervalMs: number;
}

function formatCountdown(nextAttemptAt: Date | string | null): string {
  if (!nextAttemptAt) return "--";
  const next = new Date(nextAttemptAt).getTime();
  const diff = Math.max(0, Math.floor((next - Date.now()) / 1000));
  if (diff <= 0) return "agora...";
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatRelative(dt: Date | string | null): string {
  if (!dt) return "--";
  const d = new Date(dt);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 5) return "agora mesmo";
  if (diff < 60) return `há ${diff}s`;
  const m = Math.floor(diff / 60);
  return `há ${m}min`;
}

const STATE_CONFIG: Record<
  WatchdogState,
  { label: string; color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; }
> = {
  idle: {
    label: "Inativo",
    color: "oklch(0.50 0.01 260)",
    bg: "oklch(0.14 0.008 260)",
    border: "oklch(0.22 0.01 260)",
    icon: ShieldOff,
  },
  watching: {
    label: "Monitorando",
    color: "oklch(0.75 0.18 55)",
    bg: "oklch(0.75 0.18 55 / 0.08)",
    border: "oklch(0.75 0.18 55 / 0.30)",
    icon: RefreshCw,
  },
  connecting: {
    label: "Reconectando...",
    color: "oklch(0.65 0.20 230)",
    bg: "oklch(0.65 0.20 230 / 0.08)",
    border: "oklch(0.65 0.20 230 / 0.30)",
    icon: Loader2,
  },
  connected: {
    label: "Conectado",
    color: "oklch(0.72 0.22 142)",
    bg: "oklch(0.72 0.22 142 / 0.08)",
    border: "oklch(0.72 0.22 142 / 0.30)",
    icon: ShieldCheck,
  },
  stopped: {
    label: "Parado",
    color: "oklch(0.62 0.22 25)",
    bg: "oklch(0.62 0.22 25 / 0.08)",
    border: "oklch(0.62 0.22 25 / 0.30)",
    icon: Square,
  },
};

export default function WatchdogStatusCard() {
  const [countdown, setCountdown] = useState("--");

  const { data: status, refetch } = trpc.mixer.watchdogStatus.useQuery(undefined, {
    refetchInterval: 3000,
  });

  const startWatchdog = trpc.mixer.watchdogStart.useMutation({
    onSuccess: () => {
      toast.success("Watchdog iniciado");
      refetch();
    },
    onError: () => toast.error("Falha ao iniciar watchdog"),
  });

  const stopWatchdog = trpc.mixer.watchdogStop.useMutation({
    onSuccess: () => {
      toast.info("Watchdog parado");
      refetch();
    },
  });

  // Countdown timer — atualiza a cada segundo
  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(status?.nextAttemptAt ?? null));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status?.nextAttemptAt]);

  if (!status) return null;

  const cfg = STATE_CONFIG[status.state] ?? STATE_CONFIG.idle;
  const StateIcon = cfg.icon;
  const isActive = status.state === "watching" || status.state === "connecting";
  const isStopped = status.state === "idle" || status.state === "stopped";
  const intervalSec = Math.round(status.intervalMs / 1000);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${cfg.color}1a`, border: `1px solid ${cfg.color}40` }}
        >
          <StateIcon
            className={`w-3.5 h-3.5 ${status.state === "connecting" ? "animate-spin" : ""}`}
            style={{ color: cfg.color } as React.CSSProperties}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono font-bold" style={{ color: cfg.color }}>
            WATCHDOG DE RECONEXÃO
          </p>
          <p className="text-[10px] font-mono" style={{ color: "oklch(0.45 0.01 260)" }}>
            {cfg.label}
            {isActive && ` · intervalo: ${intervalSec}s`}
          </p>
        </div>

        {/* Controles */}
        <div className="flex gap-1.5">
          {isStopped && (
            <button
              onClick={() => startWatchdog.mutate()}
              disabled={startWatchdog.isPending}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold transition-all active:scale-95"
              style={{
                background: "oklch(0.72 0.22 142 / 0.12)",
                border: "1px solid oklch(0.72 0.22 142 / 0.35)",
                color: "oklch(0.72 0.22 142)",
              }}
            >
              <Play className="w-2.5 h-2.5" />
              INICIAR
            </button>
          )}
          {isActive && (
            <button
              onClick={() => stopWatchdog.mutate()}
              disabled={stopWatchdog.isPending}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold transition-all active:scale-95"
              style={{
                background: "oklch(0.62 0.22 25 / 0.12)",
                border: "1px solid oklch(0.62 0.22 25 / 0.35)",
                color: "oklch(0.62 0.22 25)",
              }}
            >
              <Square className="w-2.5 h-2.5" />
              PARAR
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {(isActive || status.attempts > 0) && (
        <div
          className="grid grid-cols-3 gap-px"
          style={{ borderTop: `1px solid ${cfg.border}`, background: "oklch(0.10 0.006 260 / 0.5)" }}
        >
          {/* Tentativas */}
          <div className="flex flex-col items-center py-2.5 px-2" style={{ background: cfg.bg }}>
            <div className="flex items-center gap-1 mb-0.5">
              <AlertTriangle className="w-2.5 h-2.5" style={{ color: "oklch(0.75 0.18 55)" }} />
              <span className="text-[9px] font-mono" style={{ color: "oklch(0.45 0.01 260)" }}>
                TENTATIVAS
              </span>
            </div>
            <span className="text-base font-mono font-bold" style={{ color: "oklch(0.85 0.01 260)" }}>
              {status.attempts}
            </span>
          </div>

          {/* Próxima tentativa */}
          <div className="flex flex-col items-center py-2.5 px-2" style={{ background: cfg.bg }}>
            <div className="flex items-center gap-1 mb-0.5">
              <Clock className="w-2.5 h-2.5" style={{ color: "oklch(0.65 0.20 230)" }} />
              <span className="text-[9px] font-mono" style={{ color: "oklch(0.45 0.01 260)" }}>
                PRÓXIMA
              </span>
            </div>
            <span
              className="text-sm font-mono font-bold"
              style={{ color: status.state === "watching" ? "oklch(0.65 0.20 230)" : "oklch(0.40 0.01 260)" }}
            >
              {status.state === "watching" ? countdown : "--"}
            </span>
          </div>

          {/* Última tentativa */}
          <div className="flex flex-col items-center py-2.5 px-2" style={{ background: cfg.bg }}>
            <div className="flex items-center gap-1 mb-0.5">
              <Zap className="w-2.5 h-2.5" style={{ color: "oklch(0.50 0.01 260)" }} />
              <span className="text-[9px] font-mono" style={{ color: "oklch(0.45 0.01 260)" }}>
                ÚLTIMA
              </span>
            </div>
            <span className="text-[10px] font-mono" style={{ color: "oklch(0.55 0.01 260)" }}>
              {formatRelative(status.lastAttemptAt)}
            </span>
          </div>
        </div>
      )}

      {/* Erro */}
      {status.lastError && status.state !== "connected" && (
        <div
          className="flex items-start gap-2 px-3 py-2"
          style={{ borderTop: `1px solid ${cfg.border}`, background: "oklch(0.62 0.22 25 / 0.05)" }}
        >
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: "oklch(0.62 0.22 25)" }} />
          <p className="text-[10px] font-mono leading-relaxed" style={{ color: "oklch(0.55 0.01 260)" }}>
            {status.lastError}
          </p>
        </div>
      )}

      {/* Info de backoff */}
      {isActive && status.intervalMs > 30_000 && (
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{ borderTop: `1px solid ${cfg.border}` }}
        >
          <RefreshCw className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "oklch(0.45 0.01 260)" }} />
          <p className="text-[9px] font-mono" style={{ color: "oklch(0.40 0.01 260)" }}>
            Backoff exponencial ativo — intervalo aumentado para {intervalSec}s após falhas consecutivas
          </p>
        </div>
      )}
    </div>
  );
}
