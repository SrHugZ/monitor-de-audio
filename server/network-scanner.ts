/**
 * Network Scanner — descobre dispositivos Waldman MATRIX na rede local
 * via TCP connect scan paralelo na sub-rede /24 do servidor.
 *
 * Estratégia:
 *  1. Detecta o IP local do servidor (interface não-loopback)
 *  2. Deriva a sub-rede /24 (ex: 192.168.2.x)
 *  3. Tenta conexão TCP em paralelo para cada host × porta Nctrl conhecida
 *  4. Hosts que aceitam conexão são retornados como candidatos
 *  5. Tenta enviar um probe Nctrl "GET PRESET\r\n" para confirmar se é Waldman
 */

import * as net from "net";
import * as os from "os";

// Portas onde o protocolo Nctrl da Waldman costuma estar disponível
export const NCTRL_PORTS = [3000, 8080, 8888, 9000, 10000, 3001, 7000];

// Timeout por tentativa de conexão TCP (ms)
const CONNECT_TIMEOUT_MS = 600;

// Timeout para probe Nctrl (ms)
const PROBE_TIMEOUT_MS = 800;

// Máximo de conexões paralelas simultâneas
const CONCURRENCY = 40;

export interface ScanResult {
  host: string;
  port: number;
  isWaldman: boolean;
  responseSnippet?: string;
  latencyMs: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Retorna o primeiro IP não-loopback do servidor */
export function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return "127.0.0.1";
}

/** Deriva a sub-rede /24 a partir de um IP (ex: 192.168.2.5 → 192.168.2) */
export function getSubnet(ip: string): string {
  return ip.split(".").slice(0, 3).join(".");
}

/** Gera todos os hosts de uma sub-rede /24 (1-254) */
export function getSubnetHosts(subnet: string): string[] {
  return Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
}

/** Tenta abrir uma conexão TCP. Resolve true se conectou, false se timeout/erro. */
function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (result: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * Tenta enviar um probe Nctrl e lê a resposta.
 * Se a resposta contiver padrões típicos do Waldman, marca isWaldman = true.
 */
function nctrlProbe(host: string, port: number): Promise<{ isWaldman: boolean; snippet: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let data = "";
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      socket.destroy();
      // Heurísticas: respostas Nctrl costumam conter "OK", "MATRIX", "PRESET", "GAIN"
      const upper = data.toUpperCase();
      const isWaldman =
        upper.includes("OK") ||
        upper.includes("MATRIX") ||
        upper.includes("PRESET") ||
        upper.includes("GAIN") ||
        upper.includes("SEND") ||
        upper.includes("MUTE") ||
        upper.includes("NCTRL") ||
        upper.includes("WALDMAN");
      resolve({ isWaldman, snippet: data.slice(0, 80).replace(/[\r\n]/g, " ").trim() });
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.on("connect", () => {
      // Envia probe Nctrl — comando de leitura de preset (não altera nada)
      socket.write("GET PRESET\r\n");
    });
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8");
      // Recebeu algo — suficiente para classificar
      finish();
    });
    socket.on("timeout", finish);
    socket.on("error", finish);
    socket.on("close", finish);
    socket.connect(port, host);
  });
}

/** Executa uma função em lotes de `concurrency` itens por vez */
async function runConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ── Main scan ─────────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** Sub-rede a escanear. Se omitida, usa a sub-rede do IP local do servidor. */
  subnet?: string;
  /** Portas a testar. Padrão: NCTRL_PORTS */
  ports?: number[];
  /** Callback de progresso: (scanned, total) */
  onProgress?: (scanned: number, total: number) => void;
}

export async function scanNetwork(options: ScanOptions = {}): Promise<ScanResult[]> {
  const localIp = getLocalIp();
  const subnet = options.subnet ?? getSubnet(localIp);
  const ports = options.ports ?? NCTRL_PORTS;
  const hosts = getSubnetHosts(subnet);

  // Gera todas as combinações host × porta
  const targets: Array<{ host: string; port: number }> = [];
  for (const host of hosts) {
    for (const port of ports) {
      targets.push({ host, port });
    }
  }

  const total = targets.length;
  let scanned = 0;
  const found: ScanResult[] = [];

  await runConcurrent(targets, CONCURRENCY, async ({ host, port }) => {
    const t0 = Date.now();
    const open = await tcpConnect(host, port, CONNECT_TIMEOUT_MS);
    scanned++;
    options.onProgress?.(scanned, total);

    if (!open) return;

    const latencyMs = Date.now() - t0;
    const { isWaldman, snippet } = await nctrlProbe(host, port);

    found.push({
      host,
      port,
      isWaldman,
      responseSnippet: snippet || undefined,
      latencyMs,
    });
  });

  // Ordena: Waldman primeiro, depois por latência
  found.sort((a, b) => {
    if (a.isWaldman !== b.isWaldman) return a.isWaldman ? -1 : 1;
    return a.latencyMs - b.latencyMs;
  });

  return found;
}
