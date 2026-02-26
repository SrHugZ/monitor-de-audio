import { useState } from "react";
import { trpc } from "@/lib/trpc";
import ConnectionStatus from "@/components/ConnectionStatus";
import { Loader2, Lock, Music, Guitar, Drum, Piano, Radio, Mic2, PlayCircle } from "lucide-react";
import { useLocation } from "wouter";
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

function InstrumentIcon({ icon, className, style }: { icon: string; className?: string; style?: React.CSSProperties }) {
  const Icon = ICON_MAP[icon] ?? Music;
  return <Icon className={className} style={style} />;
}

interface PinModalProps {
  musicianId: number;
  musicianName: string;
  onSuccess: (id: number) => void;
  onClose: () => void;
}

function PinModal({ musicianId: _musicianId, musicianName, onSuccess, onClose }: PinModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const verifyPin = trpc.musicians.verifyPin.useMutation();

  const handleDigit = (d: string) => {
    if (pin.length >= 6) return;
    const newPin = pin + d;
    setPin(newPin);
    setError("");
    if (newPin.length >= 4) {
      verifyPin.mutate(
        { pin: newPin },
        {
          onSuccess: (data) => {
            onSuccess(data.id);
          },
          onError: () => {
            if (newPin.length >= 4) {
              setError("PIN incorreto");
              setTimeout(() => {
                setPin("");
                setError("");
              }, 800);
            }
          },
        }
      );
    }
  };

  const handleBackspace = () => {
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0.05 0.005 260 / 0.9)" }}
      onClick={onClose}
    >
      <div
        className="console-panel p-6 w-full max-w-xs animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="led led-yellow" />
          <div>
            <p className="console-section-label">Acesso</p>
            <h3 className="text-base font-semibold text-foreground">{musicianName}</h3>
          </div>
          <Lock className="w-4 h-4 ml-auto" style={{ color: "oklch(0.55 0.01 260)" }} />
        </div>

        {/* PIN Display */}
        <div className="flex justify-center gap-2 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="w-10 h-10 rounded flex items-center justify-center font-mono text-lg font-bold"
              style={{
                background: "oklch(0.10 0.005 260)",
                border: `1px solid ${i < pin.length ? "oklch(0.72 0.22 142)" : "oklch(0.25 0.01 260)"}`,
                color: error ? "oklch(0.62 0.25 25)" : "oklch(0.72 0.22 142)",
                boxShadow: i < pin.length ? "0 0 8px oklch(0.72 0.22 142 / 0.3)" : "none",
              }}
            >
              {i < pin.length ? "●" : ""}
            </div>
          ))}
        </div>

        {error && (
          <p className="text-center text-xs font-mono mb-4" style={{ color: "oklch(0.62 0.25 25)" }}>
            {error}
          </p>
        )}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              className="h-12 rounded font-mono text-lg font-semibold transition-all duration-100 active:scale-95"
              style={{
                background: "oklch(0.18 0.01 260)",
                border: "1px solid oklch(0.28 0.01 260)",
                color: "oklch(0.85 0.01 260)",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.background = "oklch(0.25 0.01 260)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.background = "oklch(0.18 0.01 260)";
              }}
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleBackspace}
            className="h-12 rounded font-mono text-sm transition-all duration-100 active:scale-95"
            style={{
              background: "oklch(0.15 0.01 260)",
              border: "1px solid oklch(0.25 0.01 260)",
              color: "oklch(0.55 0.01 260)",
            }}
          >
            ⌫
          </button>
          <button
            onClick={() => handleDigit("0")}
            className="h-12 rounded font-mono text-lg font-semibold transition-all duration-100 active:scale-95"
            style={{
              background: "oklch(0.18 0.01 260)",
              border: "1px solid oklch(0.28 0.01 260)",
              color: "oklch(0.85 0.01 260)",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.background = "oklch(0.25 0.01 260)";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.background = "oklch(0.18 0.01 260)";
            }}
          >
            0
          </button>
          <button
            onClick={onClose}
            className="h-12 rounded font-mono text-sm transition-all duration-100 active:scale-95"
            style={{
              background: "oklch(0.15 0.01 260)",
              border: "1px solid oklch(0.25 0.01 260)",
              color: "oklch(0.55 0.01 260)",
            }}
          >
            ✕
          </button>
        </div>

        {verifyPin.isPending && (
          <div className="flex justify-center mt-4">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "oklch(0.72 0.22 142)" }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function InstrumentSelect() {
  const [, navigate] = useLocation();
  const { data: musicians, isLoading } = trpc.musicians.list.useQuery();
  const [selectedMusician, setSelectedMusician] = useState<{ id: number; name: string } | null>(null);

  const handleCardClick = (musician: { id: number; name: string }) => {
    setSelectedMusician(musician);
  };

  const handlePinSuccess = (musicianId: number) => {
    setSelectedMusician(null);
    // Salva sessão local
    sessionStorage.setItem("musicianId", String(musicianId));
    navigate(`/monitor/${musicianId}`);
    toast.success("Acesso liberado!");
  };

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: "oklch(0.09 0.005 260)" }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 sticky top-0 z-10"
        style={{
          background: "oklch(0.11 0.007 260)",
          borderBottom: "1px solid oklch(0.20 0.01 260)",
          boxShadow: "0 2px 8px oklch(0.05 0.005 260 / 0.8)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="led led-green" />
            <div className="led led-yellow" />
            <div className="led led-red" />
          </div>
          <div>
            <h1
              className="text-sm font-bold tracking-wider"
              style={{ color: "oklch(0.72 0.22 142)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              MONITOR DE PALCO
            </h1>
            <p className="console-section-label">Selecione seu instrumento</p>
          </div>
        </div>
        <ConnectionStatus />
      </header>

      {/* Content */}
      <main className="flex-1 p-4 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <Loader2
                className="w-8 h-8 animate-spin"
                style={{ color: "oklch(0.72 0.22 142)" }}
              />
              <span className="console-section-label">Carregando...</span>
            </div>
          </div>
        ) : !musicians || musicians.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="console-panel p-6 text-center max-w-sm">
              <Music className="w-12 h-12 mx-auto mb-3" style={{ color: "oklch(0.40 0.01 260)" }} />
              <p className="text-sm font-medium mb-1" style={{ color: "oklch(0.70 0.01 260)" }}>
                Nenhum músico configurado
              </p>
              <p className="text-xs" style={{ color: "oklch(0.45 0.01 260)" }}>
                Acesse o painel admin para configurar os perfis.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
            {musicians
              .filter((m) => m.isActive)
              .map((musician) => (
                <button
                  key={musician.id}
                  className="instrument-card p-4 text-left"
                  onClick={() => handleCardClick(musician)}
                  style={{ borderTopColor: musician.color, borderTopWidth: 3 }}
                >
                  {/* Glow accent */}
                  <div
                    className="absolute inset-0 rounded-xl opacity-5"
                    style={{ background: musician.color }}
                  />

                  {/* Icon */}
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-3 relative"
                    style={{
                      background: `${musician.color}22`,
                      border: `1px solid ${musician.color}44`,
                    }}
                  >
                    <InstrumentIcon
                      icon={musician.icon}
                      className="w-6 h-6"
                      style={{ color: musician.color }}
                    />
                  </div>

                  {/* Name */}
                  <div className="relative">
                    <p
                      className="font-semibold text-sm leading-tight"
                      style={{ color: "oklch(0.90 0.01 260)" }}
                    >
                      {musician.name}
                    </p>
                    <p
                      className="text-xs mt-0.5 font-mono"
                      style={{ color: "oklch(0.50 0.01 260)" }}
                    >
                      BUS {musician.busOut}
                    </p>
                  </div>

                  {/* Lock icon */}
                  <div className="absolute top-3 right-3">
                    <Lock className="w-3 h-3" style={{ color: "oklch(0.40 0.01 260)" }} />
                  </div>
                </button>
              ))}
          </div>
        )}

        {/* Admin link */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => navigate("/admin")}
            className="text-xs font-mono px-4 py-2 rounded transition-colors"
            style={{
              color: "oklch(0.45 0.01 260)",
              border: "1px solid oklch(0.22 0.01 260)",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.color = "oklch(0.65 0.01 260)";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.color = "oklch(0.45 0.01 260)";
            }}
          >
            ⚙ ADMIN
          </button>
        </div>
      </main>

      {/* PIN Modal */}
      {selectedMusician && (
        <PinModal
          musicianId={selectedMusician.id}
          musicianName={selectedMusician.name}
          onSuccess={handlePinSuccess}
          onClose={() => setSelectedMusician(null)}
        />
      )}
    </div>
  );
}
