/**
 * WebSocket Server para comunicação em tempo real
 * Distribui atualizações de VU meters e estados de canais para todos os clientes
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { getMatrixClient } from "./matrix-client";

export interface WSMessage {
  type:
    | "vu_update"
    | "send_update"
    | "mute_update"
    | "connection_status"
    | "error"
    | "ping"
    | "pong";
  payload: unknown;
}

interface ConnectedClient {
  ws: WebSocket;
  musicianId?: number;
  lastPing: number;
}

let wss: WebSocketServer | null = null;
const clients = new Set<ConnectedClient>();
let vuPollingInterval: NodeJS.Timeout | null = null;

export function initWebSocketServer(httpServer: Server) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    const client: ConnectedClient = { ws, lastPing: Date.now() };
    clients.add(client);

    // Envia status de conexão imediato
    const matrix = getMatrixClient();
    sendToClient(ws, {
      type: "connection_status",
      payload: {
        connected: matrix.isConnected(),
        simulatorMode: matrix.isSimulator(),
      },
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSMessage;
        handleClientMessage(client, msg);
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      clients.delete(client);
    });

    ws.on("error", () => {
      clients.delete(client);
    });
  });

  // Inicia polling de VU meters
  startVUPolling();

  // Ping/pong para manter conexões vivas
  setInterval(() => {
    const now = Date.now();
    clients.forEach((client) => {
      if (now - client.lastPing > 30000) {
        client.ws.terminate();
        clients.delete(client);
        return;
      }
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    });
  }, 10000);

  // Escuta eventos do MatrixClient
  const matrix = getMatrixClient();
  matrix.on("vu", (reading) => {
    broadcast({ type: "vu_update", payload: reading });
  });
  matrix.on("connected", () => {
    broadcast({
      type: "connection_status",
      payload: { connected: true, simulatorMode: matrix.isSimulator() },
    });
  });
  matrix.on("disconnected", () => {
    broadcast({
      type: "connection_status",
      payload: { connected: false, simulatorMode: matrix.isSimulator() },
    });
  });

  return wss;
}

function handleClientMessage(client: ConnectedClient, msg: WSMessage) {
  if (msg.type === "ping") {
    client.lastPing = Date.now();
    sendToClient(client.ws, { type: "pong", payload: { ts: Date.now() } });
    return;
  }
}

function sendToClient(ws: WebSocket, msg: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function broadcast(msg: WSMessage) {
  clients.forEach((client) => {
    sendToClient(client.ws, msg);
  });
}

function startVUPolling() {
  if (vuPollingInterval) clearInterval(vuPollingInterval);

  // Poll VU meters a cada 100ms para todos os canais ativos
  vuPollingInterval = setInterval(async () => {
    const matrix = getMatrixClient();
    if (!matrix.isConnected()) return;

    const vuData: Record<string, number> = {};
    try {
      // Poll canais IN 1-8 e OUT 1-8 (ajustar conforme configuração real)
      const promises: Promise<void>[] = [];
      for (let i = 1; i <= 8; i++) {
        promises.push(
          matrix.getVU("IN", i).then((v) => {
            vuData[`IN:${i}`] = v;
          })
        );
        promises.push(
          matrix.getVU("OUT", i).then((v) => {
            vuData[`OUT:${i}`] = v;
          })
        );
      }
      await Promise.all(promises);
      if (Object.keys(vuData).length > 0) {
        broadcast({ type: "vu_update", payload: vuData });
      }
    } catch {
      // Ignora erros de polling
    }
  }, 100);
}

export function getConnectedClientsCount(): number {
  return clients.size;
}
