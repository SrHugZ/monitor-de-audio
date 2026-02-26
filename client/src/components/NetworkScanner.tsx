/**
 * NetworkScanner — componente de descoberta automática de dispositivos Waldman
 * na rede local. Exibe progresso de scan, lista de resultados e permite
 * selecionar um dispositivo para preencher automaticamente IP/porta.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Radar,
  Wifi,
  WifiOff,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Info,
  Zap,
  ServerCrash,
} from "lucide-react";
import { toast } from "sonner";

interface NetworkScannerProps {
  /** Chamado quando o usuário seleciona um dispositivo */
  onSelect: (host: string, port: number) => void;
}

interface ScanResult {
  host: string;
  port: number;
  isWaldman: boolean;
  responseSnippet?: string;
  latencyMs: number;
}

export default function NetworkScanner({ onSelect }: NetworkScannerProps) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [scanDone, setScanDone] = useState(false);

  const { data: localInfo } = trpc.mixer.localInfo.useQuery();
  const scanMutation = trpc.mixer.scan.useMutation();

  const handleScan = async () => {
    setScanning(true);
    setScanDone(false);
    setResults([]);
    setSelectedIdx(null);

    try {
      const res = await scanMutation.mutateAsync({
        subnet: localInfo?.subnet,
        ports: localInfo?.nctrlPorts,
      });
      setResults(res.results);
      setScanDone(true);

      if (res.results.length === 0) {
        toast.info("Nenhum dispositivo encontrado na rede");
      } else {
        const waldman = res.results.filter((r) => r.isWaldman);
        if (waldman.length > 0) {
          toast.success(`${waldman.length} dispositivo Waldman encontrado!`);
        } else {
          toast.info(`${res.results.length} dispositivo(s) com porta aberta encontrado(s)`);
        }
      }
    } catch {
      toast.error("Erro ao escanear a rede");
    } finally {
      setScanning(false);
    }
  };

  const handleSelect = (idx: number) => {
    const r = results[idx];
    setSelectedIdx(idx);
    onSelect(r.host, r.port);
    toast.success(`Selecionado: ${r.host}:${r.port}`);
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid oklch(0.22 0.01 260)",
        background: "oklch(0.10 0.006 260)",
      }}
    >
      {/* Header — clicável para expandir/recolher */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
        style={{
          background: open ? "oklch(0.13 0.008 260)" : "transparent",
        }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: "oklch(0.65 0.20 230 / 0.12)",
            border: "1px solid oklch(0.65 0.20 230 / 0.25)",
          }}
        >
          <Radar className="w-3.5 h-3.5" style={{ color: "oklch(0.65 0.20 230)" }} />
        </div>
        <div className="flex-1 text-left">
          <p
            className="text-xs font-mono font-bold"
            style={{ color: "oklch(0.65 0.20 230)" }}
          >
            DESCOBERTA AUTOMÁTICA
          </p>
          <p className="text-[10px] font-mono" style={{ color: "oklch(0.45 0.01 260)" }}>
            {localInfo
              ? `Sub-rede: ${localInfo.subnet}.0/24`
              : "Detectando rede local..."}
          </p>
        </div>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "oklch(0.45 0.01 260)" }} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "oklch(0.45 0.01 260)" }} />
        )}
      </button>

      {/* Body */}
      {open && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid oklch(0.18 0.01 260)" }}>
          {/* Info box */}
          <div
            className="flex gap-2 p-3 rounded-lg mt-3"
            style={{
              background: "oklch(0.65 0.20 230 / 0.06)",
              border: "1px solid oklch(0.65 0.20 230 / 0.18)",
            }}
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "oklch(0.65 0.20 230)" }} />
            <p className="text-[10px] font-mono leading-relaxed" style={{ color: "oklch(0.60 0.01 260)" }}>
              Escaneia a sub-rede <span style={{ color: "oklch(0.75 0.01 260)" }}>{localInfo?.subnet ?? "..."}.0/24</span> nas
              portas Nctrl conhecidas da Waldman:{" "}
              <span style={{ color: "oklch(0.75 0.01 260)" }}>
                {localInfo?.nctrlPorts?.join(", ") ?? "3000, 8080, 8888, 9000, 10000"}
              </span>.
              O scan leva entre 10–30 segundos dependendo do tamanho da rede.
            </p>
          </div>

          {/* Scan button */}
          <button
            onClick={handleScan}
            disabled={scanning}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-mono font-bold transition-all active:scale-[0.98] disabled:opacity-60"
            style={{
              background: scanning
                ? "oklch(0.65 0.20 230 / 0.15)"
                : "oklch(0.65 0.20 230 / 0.18)",
              border: "1px solid oklch(0.65 0.20 230 / 0.40)",
              color: "oklch(0.65 0.20 230)",
            }}
          >
            {scanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ESCANEANDO REDE...
              </>
            ) : (
              <>
                <Radar className="w-3.5 h-3.5" />
                {scanDone ? "ESCANEAR NOVAMENTE" : "BUSCAR MESA NA REDE"}
              </>
            )}
          </button>

          {/* Scanning progress animation */}
          {scanning && (
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ background: "oklch(0.18 0.01 260)" }}
            >
              <div
                className="h-full rounded-full animate-pulse"
                style={{
                  background: "oklch(0.65 0.20 230)",
                  width: "60%",
                  animation: "scan-progress 2s ease-in-out infinite",
                }}
              />
            </div>
          )}

          {/* Results */}
          {scanDone && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono" style={{ color: "oklch(0.45 0.01 260)" }}>
                {results.length === 0
                  ? "Nenhum dispositivo encontrado"
                  : `${results.length} dispositivo${results.length !== 1 ? "s" : ""} encontrado${results.length !== 1 ? "s" : ""}`}
              </p>

              {results.length === 0 && (
                <div
                  className="flex flex-col items-center gap-2 py-4 rounded-xl"
                  style={{
                    background: "oklch(0.09 0.005 260)",
                    border: "1px solid oklch(0.18 0.01 260)",
                  }}
                >
                  <ServerCrash className="w-6 h-6" style={{ color: "oklch(0.35 0.01 260)" }} />
                  <p className="text-xs font-mono text-center" style={{ color: "oklch(0.45 0.01 260)" }}>
                    Verifique se a mesa está ligada
                    <br />e conectada à mesma rede Wi-Fi
                  </p>
                </div>
              )}

              {results.map((r, idx) => (
                <div
                  key={`${r.host}:${r.port}`}
                  className="flex items-center gap-3 p-3 rounded-xl transition-all"
                  style={{
                    background:
                      selectedIdx === idx
                        ? "oklch(0.72 0.22 142 / 0.08)"
                        : "oklch(0.09 0.005 260)",
                    border: `1px solid ${
                      selectedIdx === idx
                        ? "oklch(0.72 0.22 142 / 0.40)"
                        : r.isWaldman
                        ? "oklch(0.65 0.20 230 / 0.30)"
                        : "oklch(0.20 0.01 260)"
                    }`,
                  }}
                >
                  {/* Status icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      background: r.isWaldman
                        ? "oklch(0.65 0.20 230 / 0.12)"
                        : "oklch(0.15 0.01 260)",
                      border: `1px solid ${r.isWaldman ? "oklch(0.65 0.20 230 / 0.30)" : "oklch(0.22 0.01 260)"}`,
                    }}
                  >
                    {r.isWaldman ? (
                      <Wifi className="w-3.5 h-3.5" style={{ color: "oklch(0.65 0.20 230)" }} />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5" style={{ color: "oklch(0.45 0.01 260)" }} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className="text-sm font-mono font-bold"
                        style={{ color: "oklch(0.85 0.01 260)" }}
                      >
                        {r.host}:{r.port}
                      </p>
                      {r.isWaldman && (
                        <span
                          className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: "oklch(0.65 0.20 230 / 0.15)",
                            color: "oklch(0.65 0.20 230)",
                            border: "1px solid oklch(0.65 0.20 230 / 0.30)",
                          }}
                        >
                          WALDMAN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Zap className="w-2.5 h-2.5" style={{ color: "oklch(0.40 0.01 260)" }} />
                      <span className="text-[10px] font-mono" style={{ color: "oklch(0.40 0.01 260)" }}>
                        {r.latencyMs}ms
                      </span>
                      {r.responseSnippet && (
                        <span
                          className="text-[9px] font-mono truncate max-w-[120px]"
                          style={{ color: "oklch(0.38 0.01 260)" }}
                        >
                          · {r.responseSnippet}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Select button */}
                  <button
                    onClick={() => handleSelect(idx)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all active:scale-95 flex-shrink-0"
                    style={
                      selectedIdx === idx
                        ? {
                            background: "oklch(0.72 0.22 142 / 0.15)",
                            border: "1px solid oklch(0.72 0.22 142 / 0.40)",
                            color: "oklch(0.72 0.22 142)",
                          }
                        : {
                            background: "oklch(0.16 0.01 260)",
                            border: "1px solid oklch(0.28 0.01 260)",
                            color: "oklch(0.60 0.01 260)",
                          }
                    }
                  >
                    {selectedIdx === idx ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <Circle className="w-3 h-3" />
                    )}
                    {selectedIdx === idx ? "SELECIONADO" : "USAR"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
