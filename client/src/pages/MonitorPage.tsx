import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import VUMeter from "@/components/VUMeter";
import VerticalFader from "@/components/VerticalFader";
import ConnectionStatus from "@/components/ConnectionStatus";
import { useWebSocket } from "@/contexts/WebSocketContext";
import {
  ArrowLeft,
  RotateCcw,
  BookmarkPlus,
  Music,
  Guitar,
  Drum,
  Piano,
  Radio,
  Mic2,
  PlayCircle,
  Volume2,
  VolumeX,
} from "lucide-react";
import SaveMixModal from "@/components/SaveMixModal";
import { toast } from "sonner";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  piano: Piano,
  guitar: Guitar,
  drum: Drum,
  music: Music,
  "music-2": Radio,
  mic: Mic2,
  "play-circle": PlayCircle,
};

function ChannelIcon({ icon, className, style }: { icon: string; className?: string; style?: React.CSSProperties }) {
  const Icon = ICON_MAP[icon] ?? Music;
  return <Icon className={className} style={style} />;
}

// Debounce hook
function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number) {
  const timer = useRef<NodeJS.Timeout | null>(null);
  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );
}

interface ChannelStripProps {
  channelId: number;
  musicianId: number;
  name: string;
  icon: string;
  color: string;
  channelType: "IN" | "STIN";
  channelNumber: number;
  initialLevel: number;
  initialMuted: boolean;
  vuKey: string;
  vuData: Record<string, number>;
  onLevelChange: (channelId: number, level: number) => void;
  onMuteChange: (channelId: number, muted: boolean) => void;
}

function ChannelStrip({
  channelId,
  name,
  icon,
  color,
  channelType,
  channelNumber,
  initialLevel,
  initialMuted,
  vuKey,
  vuData,
  onLevelChange,
  onMuteChange,
}: ChannelStripProps) {
  const [level, setLevel] = useState(initialLevel);
  const [muted, setMuted] = useState(initialMuted);

  useEffect(() => {
    setLevel(initialLevel);
    setMuted(initialMuted);
  }, [initialLevel, initialMuted]);

  const vuLevel = vuData[vuKey] ?? -60;
  const effectiveVU = muted ? -60 : vuLevel;

  const handleFaderChange = useCallback(
    (val: number) => {
      setLevel(val);
      onLevelChange(channelId, val);
    },
    [channelId, onLevelChange]
  );

  const handleMute = useCallback(() => {
    const newMuted = !muted;
    setMuted(newMuted);
    onMuteChange(channelId, newMuted);
  }, [channelId, muted, onMuteChange]);

  return (
    <div
      className="flex flex-col items-center gap-2 p-2 rounded-lg"
      style={{
        background: "oklch(0.12 0.008 260)",
        border: `1px solid ${muted ? "oklch(0.62 0.22 25 / 0.4)" : "oklch(0.22 0.01 260)"}`,
        borderTopColor: muted ? "oklch(0.62 0.22 25)" : color,
        borderTopWidth: 2,
        minWidth: 64,
        opacity: muted ? 0.75 : 1,
        transition: "all 0.15s ease",
      }}
    >
      {/* Channel label */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="w-8 h-8 rounded flex items-center justify-center"
          style={{
            background: `${color}22`,
            border: `1px solid ${color}33`,
          }}
        >
          <ChannelIcon icon={icon} className="w-4 h-4" style={{ color: muted ? "oklch(0.40 0.01 260)" : color }} />
        </div>
        <span
          className="text-[9px] font-mono font-semibold text-center leading-tight"
          style={{
            color: muted ? "oklch(0.40 0.01 260)" : "oklch(0.70 0.01 260)",
            maxWidth: 56,
            wordBreak: "break-word",
          }}
        >
          {name}
        </span>
        <span className="console-section-label" style={{ fontSize: "0.55rem" }}>
          {channelType}{channelNumber}
        </span>
      </div>

      {/* VU Meter + Fader */}
      <div className="flex flex-row items-end gap-1.5">
        <VUMeter level={effectiveVU} height={100} segments={18} />
        <VerticalFader
          value={level}
          onChange={handleFaderChange}
          disabled={muted}
          height={100}
          color={color}
          showValue={true}
        />
      </div>

      {/* Mute Button */}
      <button
        onClick={handleMute}
        className="w-full py-1.5 rounded text-[10px] font-mono font-bold tracking-wider transition-all duration-100 active:scale-95"
        style={{
          background: muted ? "oklch(0.62 0.25 25)" : "oklch(0.18 0.01 260)",
          border: `1px solid ${muted ? "oklch(0.62 0.25 25)" : "oklch(0.28 0.01 260)"}`,
          color: muted ? "oklch(0.98 0.005 260)" : "oklch(0.55 0.01 260)",
          boxShadow: muted ? "0 0 8px oklch(0.62 0.25 25 / 0.5)" : "none",
        }}
      >
        {muted ? <VolumeX className="w-3 h-3 mx-auto" /> : <Volume2 className="w-3 h-3 mx-auto" />}
      </button>
    </div>
  );
}

export default function MonitorPage() {
  const params = useParams<{ id: string }>();
  const musicianId = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const { vuData } = useWebSocket();
  const utils = trpc.useUtils();

  // Verifica acesso
  useEffect(() => {
    const storedId = sessionStorage.getItem("musicianId");
    if (!storedId || parseInt(storedId) !== musicianId) {
      navigate("/");
    }
  }, [musicianId, navigate]);

  const { data: musician } = trpc.musicians.getById.useQuery({ id: musicianId });
  const { data: channels } = trpc.channels.list.useQuery();
  const { data: sends, isLoading: sendsLoading } = trpc.sends.getForMusician.useQuery({ musicianId });

  const setSend = trpc.sends.set.useMutation();
  const setMute = trpc.sends.setMute.useMutation();
  const resetMix = trpc.sends.resetMix.useMutation();

  const [showSaveMix, setShowSaveMix] = useState(false);

  // Mapa de sends por channelId
  const sendsMap = useMemo(() => {
    const map: Record<number, { level: number; isMuted: boolean }> = {};
    sends?.forEach((s) => {
      map[s.channelId] = { level: s.level, isMuted: s.isMuted };
    });
    return map;
  }, [sends]);

  // Debounced send
  const debouncedSetSend = useDebounce(
    (channelId: number, level: number) => {
      setSend.mutate({ musicianId, channelId, level });
    },
    100
  );

  const handleLevelChange = useCallback(
    (channelId: number, level: number) => {
      debouncedSetSend(channelId, level);
    },
    [debouncedSetSend]
  );

  const handleMuteChange = useCallback(
    (channelId: number, muted: boolean) => {
      setMute.mutate({ musicianId, channelId, isMuted: muted });
    },
    [musicianId, setMute]
  );

  const handleReset = () => {
    resetMix.mutate(
      { musicianId },
      {
        onSuccess: () => {
          utils.sends.getForMusician.invalidate({ musicianId });
          toast.success("Mix resetado para padrão");
        },
      }
    );
  };



  const activeChannels = channels?.filter((c) => c.isActive) ?? [];

  if (!musician) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: "oklch(0.09 0.005 260)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full animate-spin border-2 border-transparent" style={{ borderTopColor: "oklch(0.72 0.22 142)" }} />
          <span className="console-section-label">Carregando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "oklch(0.09 0.005 260)" }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-3 py-2.5 sticky top-0 z-10"
        style={{
          background: "oklch(0.11 0.007 260)",
          borderBottom: "1px solid oklch(0.20 0.01 260)",
          boxShadow: "0 2px 8px oklch(0.05 0.005 260 / 0.8)",
        }}
      >
        <button
          onClick={() => {
            sessionStorage.removeItem("musicianId");
            navigate("/");
          }}
          className="p-1.5 rounded transition-colors"
          style={{ color: "oklch(0.55 0.01 260)" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: `${musician.color}22`, border: `1px solid ${musician.color}44` }}
          >
            <div className="w-2 h-2 rounded-full" style={{ background: musician.color }} />
          </div>
          <div className="min-w-0">
            <h1
              className="text-sm font-bold truncate"
              style={{ color: "oklch(0.90 0.01 260)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {musician.name}
            </h1>
            <p className="console-section-label">BUS {musician.busOut} · MEU FONE</p>
          </div>
        </div>

        <ConnectionStatus />
      </header>

      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid oklch(0.18 0.01 260)" }}
      >
        <button
          onClick={handleReset}
          disabled={resetMix.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all active:scale-95"
          style={{
            background: "oklch(0.18 0.01 260)",
            border: "1px solid oklch(0.28 0.01 260)",
            color: "oklch(0.65 0.01 260)",
          }}
        >
          <RotateCcw className="w-3 h-3" />
          RESET
        </button>

        <button
          onClick={() => setShowSaveMix(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all active:scale-95"
          style={{
            background: "oklch(0.72 0.22 142 / 0.12)",
            border: "1px solid oklch(0.72 0.22 142 / 0.35)",
            color: "oklch(0.72 0.22 142)",
          }}
        >
          <BookmarkPlus className="w-3 h-3" />
          SALVAR MIX
        </button>

        <div className="flex-1" />

        {/* Level indicator */}
        <span className="console-section-label">
          {activeChannels.length} canais
        </span>
      </div>

      {/* Save Mix Modal */}
      {showSaveMix && (
        <SaveMixModal
          musicianId={musicianId}
          onClose={() => setShowSaveMix(false)}
          onLoaded={() => utils.sends.getForMusician.invalidate({ musicianId })}
        />
      )}

      {/* Channel Strips */}
      <main className="flex-1 overflow-x-auto overflow-y-hidden">
        {sendsLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 rounded-full animate-spin border-2 border-transparent" style={{ borderTopColor: "oklch(0.72 0.22 142)" }} />
          </div>
        ) : (
          <div className="flex flex-row gap-2 p-3 min-h-full" style={{ minWidth: "max-content" }}>
            {/* Decorative panel screws */}
            <div className="flex flex-col justify-between py-2 pr-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full"
                  style={{
                    background: "oklch(0.20 0.01 260)",
                    border: "1px solid oklch(0.28 0.01 260)",
                    boxShadow: "inset 0 1px 0 oklch(0.30 0.01 260)",
                  }}
                />
              ))}
            </div>

            {activeChannels.map((channel) => {
              const send = sendsMap[channel.id];
              const vuKey = `${channel.channelType}:${channel.channelNumber}`;
              return (
                <ChannelStrip
                  key={channel.id}
                  channelId={channel.id}
                  musicianId={musicianId}
                  name={channel.name}
                  icon={channel.icon}
                  color={channel.color}
                  channelType={channel.channelType as "IN" | "STIN"}
                  channelNumber={channel.channelNumber}
                  initialLevel={send?.level ?? 0.7}
                  initialMuted={send?.isMuted ?? false}
                  vuKey={vuKey}
                  vuData={vuData}
                  onLevelChange={handleLevelChange}
                  onMuteChange={handleMuteChange}
                />
              );
            })}

            {activeChannels.length === 0 && (
              <div className="flex items-center justify-center w-full h-48">
                <div className="text-center">
                  <Music className="w-10 h-10 mx-auto mb-2" style={{ color: "oklch(0.30 0.01 260)" }} />
                  <p className="text-sm font-mono" style={{ color: "oklch(0.40 0.01 260)" }}>
                    Nenhum canal configurado
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer info */}
      <footer
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderTop: "1px solid oklch(0.18 0.01 260)" }}
      >
        <span className="console-section-label">WALDMAN MATRIX 20/26</span>
        <span className="console-section-label">
          {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </footer>
    </div>
  );
}
