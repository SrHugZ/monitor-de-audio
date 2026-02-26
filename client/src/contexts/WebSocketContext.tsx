import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface VUData {
  [key: string]: number; // "IN:1" -> dB level
}

export interface WSConnectionStatus {
  connected: boolean;
  simulatorMode: boolean;
}

interface WebSocketContextValue {
  vuData: VUData;
  connectionStatus: WSConnectionStatus;
  wsConnected: boolean;
  latency: number;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  vuData: {},
  connectionStatus: { connected: false, simulatorMode: true },
  wsConnected: false,
  latency: 0,
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [vuData, setVuData] = useState<VUData>({});
  const [connectionStatus, setConnectionStatus] = useState<WSConnectionStatus>({
    connected: false,
    simulatorMode: true,
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pingStartRef = useRef<number>(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // Inicia ping periódico
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingStartRef.current = Date.now();
            ws.send(JSON.stringify({ type: "ping", payload: {} }));
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "vu_update":
              setVuData((prev) => ({ ...prev, ...msg.payload }));
              break;
            case "connection_status":
              setConnectionStatus(msg.payload);
              break;
            case "pong":
              setLatency(Date.now() - pingStartRef.current);
              break;
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        // Reconecta após 3 segundos
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimerRef.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider value={{ vuData, connectionStatus, wsConnected, latency }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
