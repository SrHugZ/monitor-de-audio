import { useWebSocket } from "@/contexts/WebSocketContext";
import { Wifi, WifiOff } from "lucide-react";

export default function ConnectionStatus() {
  const { connectionStatus, wsConnected, latency } = useWebSocket();

  const isOnline = wsConnected && connectionStatus.connected;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md" style={{
      background: "oklch(0.12 0.008 260)",
      border: `1px solid ${isOnline ? "oklch(0.72 0.22 142 / 0.4)" : "oklch(0.62 0.22 25 / 0.4)"}`,
    }}>
      <div className={`led ${isOnline ? "led-green" : "led-red"} ${!isOnline ? "animate-pulse-led" : ""}`} />
      <div className="flex flex-col">
        <span className="text-[10px] font-mono font-semibold" style={{
          color: isOnline ? "oklch(0.72 0.25 142)" : "oklch(0.62 0.25 25)"
        }}>
          {isOnline
            ? connectionStatus.simulatorMode
              ? "SIMULADOR"
              : "ONLINE"
            : "OFFLINE"}
        </span>
        {isOnline && latency > 0 && (
          <span className="text-[9px] font-mono" style={{ color: "oklch(0.50 0.01 260)" }}>
            {latency}ms
          </span>
        )}
      </div>
      {isOnline ? (
        <Wifi className="w-3 h-3" style={{ color: "oklch(0.72 0.25 142)" }} />
      ) : (
        <WifiOff className="w-3 h-3" style={{ color: "oklch(0.62 0.25 25)" }} />
      )}
    </div>
  );
}
