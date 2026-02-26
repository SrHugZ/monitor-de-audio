import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import ConnectionStatus from "@/components/ConnectionStatus";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  Save,
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  Music,
  Guitar,
  Drum,
  Piano,
  Radio,
  Mic2,
  PlayCircle,
  Loader2,
  Settings,
  Users,
  Sliders,
} from "lucide-react";
import NetworkScanner from "@/components/NetworkScanner";
import WatchdogStatusCard from "@/components/WatchdogStatus";
import { toast } from "sonner";

const ICONS = ["music", "piano", "guitar", "drum", "music-2", "mic", "play-circle"] as const;
type IconName = (typeof ICONS)[number];

const ICON_MAP: Record<IconName, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  piano: Piano,
  guitar: Guitar,
  drum: Drum,
  music: Music,
  "music-2": Radio,
  mic: Mic2,
  "play-circle": PlayCircle,
};

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {ICONS.map((icon) => {
        const Icon = ICON_MAP[icon];
        return (
          <button
            key={icon}
            onClick={() => onChange(icon)}
            className="w-8 h-8 rounded flex items-center justify-center transition-all"
            style={{
              background: value === icon ? "oklch(0.72 0.22 142 / 0.2)" : "oklch(0.16 0.01 260)",
              border: `1px solid ${value === icon ? "oklch(0.72 0.22 142)" : "oklch(0.25 0.01 260)"}`,
            }}
          >
            <Icon className="w-4 h-4" style={{ color: value === icon ? "oklch(0.72 0.22 142)" : "oklch(0.55 0.01 260)" }} />
          </button>
        );
      })}
    </div>
  );
}

const COLORS = [
  "#22c55e", "#8b5cf6", "#7c3aed", "#f59e0b", "#d97706",
  "#ef4444", "#06b6d4", "#10b981", "#3b82f6", "#ec4899",
  "#64748b", "#f97316",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {COLORS.map((color) => (
        <button
          key={color}
          onClick={() => onChange(color)}
          className="w-6 h-6 rounded-full transition-transform active:scale-90"
          style={{
            background: color,
            border: value === color ? "2px solid white" : "2px solid transparent",
            boxShadow: value === color ? `0 0 8px ${color}80` : "none",
          }}
        />
      ))}
    </div>
  );
}

type Tab = "connection" | "musicians" | "channels";

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("connection");
  const [adminPin, setAdminPin] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  // Connection state
  const [host, setHost] = useState("192.168.2.1");
  const [port, setPort] = useState("3000");
  const [protocol, setProtocol] = useState<"tcp" | "udp">("tcp");
  const [simulatorMode, setSimulatorMode] = useState(true);

  const { data: mixerStatus } = trpc.mixer.status.useQuery();
  const connectMixer = trpc.mixer.connect.useMutation();
  const disconnectMixer = trpc.mixer.disconnect.useMutation();
  const seedDefaults = trpc.admin.seedDefaults.useMutation();

  // Musicians
  const { data: musicians, isLoading: musiciansLoading } = trpc.musicians.list.useQuery();
  const createMusician = trpc.musicians.create.useMutation();
  const deleteMusician = trpc.musicians.delete.useMutation();
  const utils = trpc.useUtils();

  const [newMusician, setNewMusician] = useState({
    name: "",
    instrument: "",
    icon: "music" as IconName,
    color: "#22c55e",
    pin: "",
    busOut: 1,
    sortOrder: 0,
  });

  // Channels
  const { data: channels, isLoading: channelsLoading } = trpc.channels.list.useQuery();
  const createChannel = trpc.channels.create.useMutation();
  const deleteChannel = trpc.channels.delete.useMutation();

  const [newChannel, setNewChannel] = useState({
    name: "",
    channelType: "IN" as "IN" | "STIN",
    channelNumber: 1,
    icon: "music" as IconName,
    color: "#3b82f6",
    sortOrder: 0,
  });

  // Admin PIN check (simples, apenas para demo)
  const ADMIN_PIN = "0000";

  if (!adminUnlocked) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: "oklch(0.09 0.005 260)" }}>
        <div className="console-panel p-6 w-full max-w-xs">
          <div className="flex items-center gap-3 mb-6">
            <div className="led led-yellow" />
            <div>
              <p className="console-section-label">Acesso Restrito</p>
              <h2 className="text-base font-bold" style={{ color: "oklch(0.90 0.01 260)" }}>
                Painel Admin
              </h2>
            </div>
            <Settings className="w-5 h-5 ml-auto" style={{ color: "oklch(0.45 0.01 260)" }} />
          </div>

          <div className="flex justify-center gap-2 mb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="w-10 h-10 rounded flex items-center justify-center font-mono text-lg font-bold"
                style={{
                  background: "oklch(0.10 0.005 260)",
                  border: `1px solid ${i < adminPin.length ? "oklch(0.72 0.22 142)" : "oklch(0.25 0.01 260)"}`,
                  color: "oklch(0.72 0.22 142)",
                }}
              >
                {i < adminPin.length ? "●" : ""}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {["1","2","3","4","5","6","7","8","9"].map((d) => (
              <button
                key={d}
                onClick={() => {
                  if (adminPin.length < 4) {
                    const newPin = adminPin + d;
                    setAdminPin(newPin);
                    if (newPin.length === 4) {
                      if (newPin === ADMIN_PIN) {
                        setAdminUnlocked(true);
                      } else {
                        setTimeout(() => setAdminPin(""), 500);
                        toast.error("PIN incorreto");
                      }
                    }
                  }
                }}
                className="h-12 rounded font-mono text-lg font-semibold transition-all active:scale-95"
                style={{
                  background: "oklch(0.18 0.01 260)",
                  border: "1px solid oklch(0.28 0.01 260)",
                  color: "oklch(0.85 0.01 260)",
                }}
              >
                {d}
              </button>
            ))}
            <button onClick={() => setAdminPin(p => p.slice(0,-1))} className="h-12 rounded font-mono text-sm" style={{ background: "oklch(0.15 0.01 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.55 0.01 260)" }}>⌫</button>
            <button onClick={() => { const newPin = adminPin + "0"; setAdminPin(newPin.slice(0,4)); if(newPin.length===4){if(newPin===ADMIN_PIN){setAdminUnlocked(true);}else{setTimeout(()=>setAdminPin(""),500);toast.error("PIN incorreto");}} }} className="h-12 rounded font-mono text-lg font-semibold transition-all active:scale-95" style={{ background: "oklch(0.18 0.01 260)", border: "1px solid oklch(0.28 0.01 260)", color: "oklch(0.85 0.01 260)" }}>0</button>
            <button onClick={() => navigate("/")} className="h-12 rounded font-mono text-sm" style={{ background: "oklch(0.15 0.01 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.55 0.01 260)" }}>✕</button>
          </div>
          <p className="text-center text-xs font-mono" style={{ color: "oklch(0.40 0.01 260)" }}>
            PIN padrão: 0000
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: "oklch(0.09 0.005 260)" }}>
      {/* Header */}
      <header className="flex items-center gap-3 px-3 py-2.5 sticky top-0 z-10" style={{ background: "oklch(0.11 0.007 260)", borderBottom: "1px solid oklch(0.20 0.01 260)" }}>
        <button onClick={() => navigate("/")} className="p-1.5 rounded" style={{ color: "oklch(0.55 0.01 260)" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold tracking-wider" style={{ color: "oklch(0.72 0.22 142)", fontFamily: "'JetBrains Mono', monospace" }}>
            PAINEL ADMIN
          </h1>
          <p className="console-section-label">Waldman MATRIX 20/26</p>
        </div>
        <ConnectionStatus />
      </header>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "oklch(0.20 0.01 260)" }}>
        {([
          { id: "connection", label: "CONEXÃO", icon: Wifi },
          { id: "musicians", label: "MÚSICOS", icon: Users },
          { id: "channels", label: "CANAIS", icon: Sliders },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-mono font-semibold transition-colors"
            style={{
              background: tab === id ? "oklch(0.14 0.008 260)" : "transparent",
              color: tab === id ? "oklch(0.72 0.22 142)" : "oklch(0.50 0.01 260)",
              borderBottom: tab === id ? "2px solid oklch(0.72 0.22 142)" : "2px solid transparent",
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-auto p-4">
        {/* ── CONNECTION TAB ── */}
        {tab === "connection" && (
          <div className="space-y-4 max-w-md mx-auto">
            {/* Status */}
            <div className="console-panel p-4">
              <p className="console-section-label mb-3">Status da Conexão</p>
              <div className="flex items-center gap-3">
                <div className={`led ${mixerStatus?.connected ? "led-green" : "led-red"}`} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "oklch(0.85 0.01 260)" }}>
                    {mixerStatus?.connected ? "Conectado" : "Desconectado"}
                  </p>
                  <p className="text-xs font-mono" style={{ color: "oklch(0.50 0.01 260)" }}>
                    {mixerStatus?.simulatorMode ? "Modo Simulador" : `${mixerStatus?.host}:${mixerStatus?.port}`}
                  </p>
                </div>
              </div>
            </div>

            {/* Config */}
            <div className="console-panel p-4 space-y-3">
              <p className="console-section-label mb-2">Configuração</p>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>IP do Mixer</span>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.2.1"
                  className="px-3 py-2 rounded text-sm font-mono"
                  style={{ background: "oklch(0.10 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.85 0.01 260)", outline: "none" }}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Porta Nctrl</span>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="3000"
                  className="px-3 py-2 rounded text-sm font-mono"
                  style={{ background: "oklch(0.10 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.85 0.01 260)", outline: "none" }}
                />
              </label>

              <div className="flex gap-2">
                {(["tcp", "udp"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProtocol(p)}
                    className="flex-1 py-2 rounded text-xs font-mono font-semibold transition-all"
                    style={{
                      background: protocol === p ? "oklch(0.65 0.20 230 / 0.2)" : "oklch(0.16 0.01 260)",
                      border: `1px solid ${protocol === p ? "oklch(0.65 0.20 230)" : "oklch(0.25 0.01 260)"}`,
                      color: protocol === p ? "oklch(0.65 0.20 230)" : "oklch(0.55 0.01 260)",
                    }}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setSimulatorMode(!simulatorMode)}
                  className="relative w-10 h-5 rounded-full transition-colors"
                  style={{ background: simulatorMode ? "oklch(0.72 0.22 142)" : "oklch(0.22 0.01 260)" }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 rounded-full transition-transform"
                    style={{
                      background: "oklch(0.90 0.01 260)",
                      transform: simulatorMode ? "translateX(22px)" : "translateX(2px)",
                    }}
                  />
                </div>
                <span className="text-xs font-mono" style={{ color: "oklch(0.70 0.01 260)" }}>
                  Modo Simulador
                </span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    connectMixer.mutate(
                      { host, port: parseInt(port), protocol, simulatorMode },
                      {
                        onSuccess: () => toast.success("Conectado ao mixer!"),
                        onError: () => toast.error("Falha na conexão"),
                      }
                    );
                  }}
                  disabled={connectMixer.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded text-xs font-mono font-bold transition-all active:scale-95"
                  style={{
                    background: "oklch(0.72 0.22 142 / 0.2)",
                    border: "1px solid oklch(0.72 0.22 142 / 0.5)",
                    color: "oklch(0.72 0.22 142)",
                  }}
                >
                  {connectMixer.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
                  CONECTAR
                </button>
                <button
                  onClick={() => disconnectMixer.mutate(undefined, { onSuccess: () => toast.success("Desconectado") })}
                  className="flex items-center gap-2 px-3 py-2.5 rounded text-xs font-mono font-bold transition-all active:scale-95"
                  style={{
                    background: "oklch(0.62 0.22 25 / 0.2)",
                    border: "1px solid oklch(0.62 0.22 25 / 0.5)",
                    color: "oklch(0.62 0.22 25)",
                  }}
                >
                  <WifiOff className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Watchdog de Reconexão Automática */}
            <WatchdogStatusCard />

            {/* Network Scanner */}
            <NetworkScanner
              onSelect={(h, p) => {
                setHost(h);
                setPort(String(p));
                setSimulatorMode(false);
              }}
            />

            {/* Seed defaults */}
            <div className="console-panel p-4">
              <p className="console-section-label mb-3">Dados Padrão</p>
              <p className="text-xs mb-3" style={{ color: "oklch(0.55 0.01 260)" }}>
                Cria os músicos e canais padrão para uma banda de igreja (Teclado 1/2, Guitarra 1/2, Contrabaixo, Bateria, Sax, Playback).
              </p>
              <button
                onClick={() => seedDefaults.mutate(undefined, {
                  onSuccess: () => {
                    utils.musicians.list.invalidate();
                    utils.channels.list.invalidate();
                    toast.success("Dados padrão criados!");
                  }
                })}
                disabled={seedDefaults.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono font-semibold transition-all active:scale-95"
                style={{
                  background: "oklch(0.65 0.20 230 / 0.2)",
                  border: "1px solid oklch(0.65 0.20 230 / 0.5)",
                  color: "oklch(0.65 0.20 230)",
                }}
              >
                {seedDefaults.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                CRIAR PADRÕES
              </button>
            </div>
          </div>
        )}

        {/* ── MUSICIANS TAB ── */}
        {tab === "musicians" && (
          <div className="space-y-4 max-w-lg mx-auto">
            {/* Add musician form */}
            <div className="console-panel p-4 space-y-3">
              <p className="console-section-label mb-2">Novo Músico</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Nome</span>
                  <input type="text" value={newMusician.name} onChange={(e) => setNewMusician(p => ({ ...p, name: e.target.value }))} placeholder="Guitarra 1" className="px-2 py-1.5 rounded text-xs font-mono" style={{ background: "oklch(0.10 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.85 0.01 260)", outline: "none" }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Instrumento</span>
                  <input type="text" value={newMusician.instrument} onChange={(e) => setNewMusician(p => ({ ...p, instrument: e.target.value }))} placeholder="Guitarra" className="px-2 py-1.5 rounded text-xs font-mono" style={{ background: "oklch(0.10 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.85 0.01 260)", outline: "none" }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>PIN (4-6 dígitos)</span>
                  <input type="text" value={newMusician.pin} onChange={(e) => setNewMusician(p => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="1234" className="px-2 py-1.5 rounded text-xs font-mono" style={{ background: "oklch(0.10 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.85 0.01 260)", outline: "none" }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>BUS OUT (1-8)</span>
                  <input type="number" min={1} max={8} value={newMusician.busOut} onChange={(e) => setNewMusician(p => ({ ...p, busOut: parseInt(e.target.value) || 1 }))} className="px-2 py-1.5 rounded text-xs font-mono" style={{ background: "oklch(0.10 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.85 0.01 260)", outline: "none" }} />
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Ícone</span>
                <IconPicker value={newMusician.icon} onChange={(v) => setNewMusician(p => ({ ...p, icon: v as IconName }))} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Cor</span>
                <ColorPicker value={newMusician.color} onChange={(v) => setNewMusician(p => ({ ...p, color: v }))} />
              </div>
              <button
                onClick={() => {
                  if (!newMusician.name || !newMusician.pin || newMusician.pin.length < 4) {
                    toast.error("Preencha nome e PIN (mín. 4 dígitos)");
                    return;
                  }
                  createMusician.mutate(newMusician, {
                    onSuccess: () => {
                      utils.musicians.list.invalidate();
                      setNewMusician({ name: "", instrument: "", icon: "music", color: "#22c55e", pin: "", busOut: 1, sortOrder: 0 });
                      toast.success("Músico criado!");
                    },
                    onError: () => toast.error("Erro ao criar músico"),
                  });
                }}
                disabled={createMusician.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono font-bold transition-all active:scale-95"
                style={{ background: "oklch(0.72 0.22 142 / 0.2)", border: "1px solid oklch(0.72 0.22 142 / 0.5)", color: "oklch(0.72 0.22 142)" }}
              >
                {createMusician.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                ADICIONAR
              </button>
            </div>

            {/* Musicians list */}
            <div className="space-y-2">
              {musiciansLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "oklch(0.72 0.22 142)" }} /></div>
              ) : musicians?.map((m) => (
                <div key={m.id} className="console-panel p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${m.color}22`, border: `1px solid ${m.color}44` }}>
                    <div className="w-3 h-3 rounded-full" style={{ background: m.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "oklch(0.85 0.01 260)" }}>{m.name}</p>
                    <p className="text-xs font-mono" style={{ color: "oklch(0.50 0.01 260)" }}>
                      BUS {m.busOut} · PIN: {"●".repeat(m.pin.length)}
                    </p>
                  </div>
                  <div className={`led ${m.isActive ? "led-green" : "led-off"}`} />
                  <button
                    onClick={() => deleteMusician.mutate({ id: m.id }, { onSuccess: () => { utils.musicians.list.invalidate(); toast.success("Músico removido"); } })}
                    className="p-1.5 rounded transition-colors"
                    style={{ color: "oklch(0.45 0.01 260)" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CHANNELS TAB ── */}
        {tab === "channels" && (
          <div className="space-y-4 max-w-lg mx-auto">
            {/* Add channel form */}
            <div className="console-panel p-4 space-y-3">
              <p className="console-section-label mb-2">Novo Canal</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Nome</span>
                  <input type="text" value={newChannel.name} onChange={(e) => setNewChannel(p => ({ ...p, name: e.target.value }))} placeholder="Guitarra 1" className="px-2 py-1.5 rounded text-xs font-mono" style={{ background: "oklch(0.10 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.85 0.01 260)", outline: "none" }} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Número do Canal</span>
                  <input type="number" min={1} max={26} value={newChannel.channelNumber} onChange={(e) => setNewChannel(p => ({ ...p, channelNumber: parseInt(e.target.value) || 1 }))} className="px-2 py-1.5 rounded text-xs font-mono" style={{ background: "oklch(0.10 0.005 260)", border: "1px solid oklch(0.25 0.01 260)", color: "oklch(0.85 0.01 260)", outline: "none" }} />
                </label>
              </div>
              <div className="flex gap-2">
                {(["IN", "STIN"] as const).map((t) => (
                  <button key={t} onClick={() => setNewChannel(p => ({ ...p, channelType: t }))} className="flex-1 py-2 rounded text-xs font-mono font-semibold" style={{ background: newChannel.channelType === t ? "oklch(0.65 0.20 230 / 0.2)" : "oklch(0.16 0.01 260)", border: `1px solid ${newChannel.channelType === t ? "oklch(0.65 0.20 230)" : "oklch(0.25 0.01 260)"}`, color: newChannel.channelType === t ? "oklch(0.65 0.20 230)" : "oklch(0.55 0.01 260)" }}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Ícone</span>
                <IconPicker value={newChannel.icon} onChange={(v) => setNewChannel(p => ({ ...p, icon: v as IconName }))} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono" style={{ color: "oklch(0.60 0.01 260)" }}>Cor</span>
                <ColorPicker value={newChannel.color} onChange={(v) => setNewChannel(p => ({ ...p, color: v }))} />
              </div>
              <button
                onClick={() => {
                  if (!newChannel.name) { toast.error("Preencha o nome do canal"); return; }
                  createChannel.mutate(newChannel, {
                    onSuccess: () => {
                      utils.channels.list.invalidate();
                      setNewChannel({ name: "", channelType: "IN", channelNumber: 1, icon: "music", color: "#3b82f6", sortOrder: 0 });
                      toast.success("Canal criado!");
                    },
                    onError: () => toast.error("Erro ao criar canal"),
                  });
                }}
                disabled={createChannel.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded text-xs font-mono font-bold transition-all active:scale-95"
                style={{ background: "oklch(0.72 0.22 142 / 0.2)", border: "1px solid oklch(0.72 0.22 142 / 0.5)", color: "oklch(0.72 0.22 142)" }}
              >
                {createChannel.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                ADICIONAR
              </button>
            </div>

            {/* Channels list */}
            <div className="space-y-2">
              {channelsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "oklch(0.72 0.22 142)" }} /></div>
              ) : channels?.map((c) => (
                <div key={c.id} className="console-panel p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${c.color}22`, border: `1px solid ${c.color}44` }}>
                    <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "oklch(0.85 0.01 260)" }}>{c.name}</p>
                    <p className="text-xs font-mono" style={{ color: "oklch(0.50 0.01 260)" }}>
                      {c.channelType} {c.channelNumber}
                    </p>
                  </div>
                  <div className={`led ${c.isActive ? "led-green" : "led-off"}`} />
                  <button
                    onClick={() => deleteChannel.mutate({ id: c.id }, { onSuccess: () => { utils.channels.list.invalidate(); toast.success("Canal removido"); } })}
                    className="p-1.5 rounded"
                    style={{ color: "oklch(0.45 0.01 260)" }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
