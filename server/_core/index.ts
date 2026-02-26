import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { initWebSocketServer, broadcast } from "../websocket-server";
import { getMatrixClient } from "../matrix-client";
import { getWatchdog } from "../reconnect-watchdog";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // WebSocket server para atualizações em tempo real
  initWebSocketServer(server);

  // Inicia MatrixClient em modo simulador por padrão
  const matrix = getMatrixClient();
  await matrix.connect().catch(() => {});

  // Configura o watchdog de reconexão automática
  const watchdog = getWatchdog();
  watchdog.configure({
    isConnected: () => matrix.isConnected(),
    reconnect: async () => {
      try {
        // Reutiliza a última configuração salva no MatrixClient
        await matrix.connect();
        return matrix.isConnected();
      } catch {
        return false;
      }
    },
  });

  // Quando a conexão cair (e não for simulador), ativa o watchdog
  matrix.on("disconnected", () => {
    if (!matrix.isSimulator()) {
      watchdog.onDisconnected("Evento disconnected do MatrixClient");
      broadcast({ type: "connection_status", payload: { connected: false, simulatorMode: false, watchdog: watchdog.getStatus() } });
    }
  });

  // Quando o watchdog reconectar, notifica todos os clientes
  watchdog.on("reconnected", (attempts: number) => {
    console.log(`[Server] Watchdog reconectou após ${attempts} tentativa(s)`);
    broadcast({ type: "connection_status", payload: { connected: true, simulatorMode: false, watchdog: watchdog.getStatus() } });
  });

  // Notifica clientes sobre tentativas do watchdog
  watchdog.on("attempt", (n: number) => {
    broadcast({ type: "connection_status", payload: { connected: false, simulatorMode: false, watchdog: watchdog.getStatus(), attempt: n } });
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
