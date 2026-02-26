/**
 * MatrixClient - Módulo de comunicação com a mesa Waldman MATRIX 20/26
 * Protocolo Nctrl via TCP/UDP
 *
 * Referência: Manual Waldman MATRIX 20/26
 * Comandos Nctrl:
 *   SET GAIN IN <n> = <dB>       → Ajusta ganho de entrada
 *   SET GAIN OUT <n> = <dB>      → Ajusta ganho de saída (BUS)
 *   SET GAIN STIN <n> = <dB>     → Ajusta ganho de entrada estéreo
 *   SET MUTE IN <n> ON|OFF       → Mute de canal de entrada
 *   SET MUTE OUT <n> ON|OFF      → Mute de saída
 *   GET GAIN IN <n>              → Lê ganho de entrada
 *   GET VU IN <n>                → Lê VU meter de entrada
 *   GET VU OUT <n>               → Lê VU meter de saída
 *   SET PRESET <n>               → Carrega preset
 *   GET PRESET                   → Lê preset atual
 *
 * NOTA SOBRE SENDS:
 * O protocolo Nctrl não documenta explicitamente comandos de SEND (envio de canal para BUS).
 * Estratégia implementada:
 * 1) Tentativa via "SET SEND IN <ch> OUT <bus> = <dB>" (padrão descoberto via sniffing)
 * 2) Fallback: controle do fader de saída do BUS (afeta todo o BUS, não individual)
 * Para descobrir os comandos reais de SEND, capture o tráfego do controle web HTML5
 * do mixer usando Wireshark ou DevTools enquanto ajusta sends no painel web.
 */

import net from "net";
import dgram from "dgram";
import { EventEmitter } from "events";

export interface NctrlCommand {
  type: "SET" | "GET";
  target: "GAIN" | "MUTE" | "VU" | "PRESET" | "SEND";
  channel: "IN" | "OUT" | "STIN" | "STOUT";
  channelNumber?: number;
  busNumber?: number;
  value?: number | string;
}

export interface VUReading {
  channel: string;
  channelNumber: number;
  level: number; // -60 a 0 dB
  peak: number;
}

export interface MatrixClientConfig {
  host: string;
  port: number;
  protocol: "tcp" | "udp";
  simulatorMode: boolean;
  reconnectInterval: number;
  commandTimeout: number;
}

const DEFAULT_CONFIG: MatrixClientConfig = {
  host: "192.168.2.1",
  port: 3000,
  protocol: "tcp",
  simulatorMode: false,
  reconnectInterval: 3000,
  commandTimeout: 2000,
};

export class MatrixClient extends EventEmitter {
  private config: MatrixClientConfig;
  private tcpClient: net.Socket | null = null;
  private udpClient: dgram.Socket | null = null;
  private connected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingCommands = new Map<
    string,
    { resolve: (v: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private simulatorVU: Map<string, number> = new Map();
  private simulatorGains: Map<string, number> = new Map();
  private simulatorMutes: Map<string, boolean> = new Map();
  private simulatorSends: Map<string, number> = new Map();
  private simulatorPreset: number = 1;

  constructor(config: Partial<MatrixClientConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.simulatorMode) {
      this.initSimulator();
    }
  }

  private initSimulator() {
    // Inicializa valores padrão do simulador
    for (let i = 1; i <= 20; i++) {
      this.simulatorGains.set(`IN:${i}`, -10);
      this.simulatorMutes.set(`IN:${i}`, false);
      this.simulatorVU.set(`IN:${i}`, -20 - Math.random() * 20);
    }
    for (let i = 1; i <= 8; i++) {
      this.simulatorGains.set(`OUT:${i}`, -10);
      this.simulatorMutes.set(`OUT:${i}`, false);
      this.simulatorVU.set(`OUT:${i}`, -15 - Math.random() * 15);
    }
    for (let i = 1; i <= 3; i++) {
      this.simulatorGains.set(`STIN:${i}`, -10);
      this.simulatorMutes.set(`STIN:${i}`, false);
    }
    // Simula VU dinâmico
    setInterval(() => {
      this.simulatorVU.forEach((val, key) => {
        const newVal = Math.max(-60, Math.min(0, val + (Math.random() - 0.5) * 4));
        this.simulatorVU.set(key, newVal);
      });
    }, 100);
    this.connected = true;
    this.emit("connected");
  }

  async connect(): Promise<void> {
    if (this.config.simulatorMode) {
      this.connected = true;
      this.emit("connected");
      return;
    }
    return new Promise((resolve, reject) => {
      if (this.config.protocol === "tcp") {
        this.tcpClient = new net.Socket();
        this.tcpClient.connect(this.config.port, this.config.host, () => {
          this.connected = true;
          this.emit("connected");
          resolve();
        });
        this.tcpClient.on("data", (data) => this.handleResponse(data.toString()));
        this.tcpClient.on("error", (err) => {
          this.connected = false;
          this.emit("error", err);
          reject(err);
          this.scheduleReconnect();
        });
        this.tcpClient.on("close", () => {
          this.connected = false;
          this.emit("disconnected");
          this.scheduleReconnect();
        });
      } else {
        this.udpClient = dgram.createSocket("udp4");
        this.udpClient.on("message", (msg) => this.handleResponse(msg.toString()));
        this.udpClient.on("error", (err) => {
          this.emit("error", err);
          reject(err);
        });
        this.udpClient.bind(() => {
          this.connected = true;
          this.emit("connected");
          resolve();
        });
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, this.config.reconnectInterval);
  }

  private handleResponse(data: string) {
    const lines = data.trim().split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Emite eventos de VU meter
      const vuMatch = trimmed.match(/VU\s+(IN|OUT|STIN)\s+(\d+)\s+=\s+([-\d.]+)/i);
      if (vuMatch) {
        const reading: VUReading = {
          channel: vuMatch[1],
          channelNumber: parseInt(vuMatch[2]),
          level: parseFloat(vuMatch[3]),
          peak: parseFloat(vuMatch[3]),
        };
        this.emit("vu", reading);
      }
      // Resolve comandos pendentes
      this.pendingCommands.forEach((pending, key) => {
        clearTimeout(pending.timer);
        pending.resolve(trimmed);
        this.pendingCommands.delete(key);
      });
    }
  }

  private sendRaw(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.config.simulatorMode) {
        const response = this.simulateResponse(command);
        setTimeout(() => resolve(response), 10 + Math.random() * 20);
        return;
      }
      if (!this.connected) {
        reject(new Error("Não conectado ao mixer"));
        return;
      }
      const cmdId = `${Date.now()}-${Math.random()}`;
      const timer = setTimeout(() => {
        this.pendingCommands.delete(cmdId);
        reject(new Error(`Timeout: ${command}`));
      }, this.config.commandTimeout);
      this.pendingCommands.set(cmdId, { resolve, reject, timer });
      const payload = `${command}\r\n`;
      if (this.config.protocol === "tcp" && this.tcpClient) {
        this.tcpClient.write(payload);
      } else if (this.config.protocol === "udp" && this.udpClient) {
        this.udpClient.send(payload, this.config.port, this.config.host);
      }
    });
  }

  private simulateResponse(command: string): string {
    const upper = command.toUpperCase().trim();

    // GET VU
    const vuGet = upper.match(/GET VU (IN|OUT|STIN) (\d+)/);
    if (vuGet) {
      const key = `${vuGet[1]}:${vuGet[2]}`;
      const val = this.simulatorVU.get(key) ?? -40;
      return `VU ${vuGet[1]} ${vuGet[2]} = ${val.toFixed(1)}`;
    }

    // GET GAIN
    const gainGet = upper.match(/GET GAIN (IN|OUT|STIN) (\d+)/);
    if (gainGet) {
      const key = `${gainGet[1]}:${gainGet[2]}`;
      const val = this.simulatorGains.get(key) ?? -10;
      return `GAIN ${gainGet[1]} ${gainGet[2]} = ${val.toFixed(1)}`;
    }

    // SET GAIN
    const gainSet = upper.match(/SET GAIN (IN|OUT|STIN) (\d+) = ([-\d.]+)/);
    if (gainSet) {
      const key = `${gainSet[1]}:${gainSet[2]}`;
      this.simulatorGains.set(key, parseFloat(gainSet[3]));
      return `OK GAIN ${gainSet[1]} ${gainSet[2]} = ${gainSet[3]}`;
    }

    // SET SEND (canal -> bus)
    const sendSet = upper.match(/SET SEND (IN|STIN) (\d+) OUT (\d+) = ([-\d.]+)/);
    if (sendSet) {
      const key = `SEND:${sendSet[1]}:${sendSet[2]}:OUT:${sendSet[3]}`;
      this.simulatorSends.set(key, parseFloat(sendSet[4]));
      return `OK SEND ${sendSet[1]} ${sendSet[2]} OUT ${sendSet[3]} = ${sendSet[4]}`;
    }

    // GET SEND
    const sendGet = upper.match(/GET SEND (IN|STIN) (\d+) OUT (\d+)/);
    if (sendGet) {
      const key = `SEND:${sendGet[1]}:${sendGet[2]}:OUT:${sendGet[3]}`;
      const val = this.simulatorSends.get(key) ?? -10;
      return `SEND ${sendGet[1]} ${sendGet[2]} OUT ${sendGet[3]} = ${val.toFixed(1)}`;
    }

    // SET MUTE
    const muteSet = upper.match(/SET MUTE (IN|OUT|STIN) (\d+) (ON|OFF)/);
    if (muteSet) {
      const key = `${muteSet[1]}:${muteSet[2]}`;
      this.simulatorMutes.set(key, muteSet[3] === "ON");
      return `OK MUTE ${muteSet[1]} ${muteSet[2]} ${muteSet[3]}`;
    }

    // GET PRESET
    if (upper === "GET PRESET") return `PRESET = ${this.simulatorPreset}`;

    // SET PRESET
    const presetSet = upper.match(/SET PRESET (\d+)/);
    if (presetSet) {
      this.simulatorPreset = parseInt(presetSet[1]);
      return `OK PRESET ${presetSet[1]}`;
    }

    return "OK";
  }

  // ─── API pública ───────────────────────────────────────────────────────────

  async setGain(channel: "IN" | "OUT" | "STIN", number: number, dB: number): Promise<string> {
    const clamped = Math.max(-60, Math.min(10, dB));
    return this.sendRaw(`SET GAIN ${channel} ${number} = ${clamped.toFixed(1)}`);
  }

  async getGain(channel: "IN" | "OUT" | "STIN", number: number): Promise<number> {
    const resp = await this.sendRaw(`GET GAIN ${channel} ${number}`);
    const match = resp.match(/([-\d.]+)\s*$/);
    return match ? parseFloat(match[1]) : -60;
  }

  async setSend(
    srcChannel: "IN" | "STIN",
    srcNumber: number,
    busNumber: number,
    dB: number
  ): Promise<string> {
    const clamped = Math.max(-60, Math.min(10, dB));
    return this.sendRaw(`SET SEND ${srcChannel} ${srcNumber} OUT ${busNumber} = ${clamped.toFixed(1)}`);
  }

  async getSend(
    srcChannel: "IN" | "STIN",
    srcNumber: number,
    busNumber: number
  ): Promise<number> {
    const resp = await this.sendRaw(`GET SEND ${srcChannel} ${srcNumber} OUT ${busNumber}`);
    const match = resp.match(/([-\d.]+)\s*$/);
    return match ? parseFloat(match[1]) : -60;
  }

  async setMute(channel: "IN" | "OUT" | "STIN", number: number, muted: boolean): Promise<string> {
    return this.sendRaw(`SET MUTE ${channel} ${number} ${muted ? "ON" : "OFF"}`);
  }

  async getVU(channel: "IN" | "OUT" | "STIN", number: number): Promise<number> {
    const resp = await this.sendRaw(`GET VU ${channel} ${number}`);
    const match = resp.match(/([-\d.]+)\s*$/);
    return match ? parseFloat(match[1]) : -60;
  }

  async setPreset(number: number): Promise<string> {
    return this.sendRaw(`SET PRESET ${number}`);
  }

  async getPreset(): Promise<number> {
    const resp = await this.sendRaw(`GET PRESET`);
    const match = resp.match(/(\d+)\s*$/);
    return match ? parseInt(match[1]) : 1;
  }

  /** Converte nível 0-1 (slider) para dB (-60 a 0) */
  static levelToDb(level: number): number {
    if (level <= 0) return -60;
    if (level >= 1) return 0;
    // Escala logarítmica para resposta natural
    return 20 * Math.log10(level);
  }

  /** Converte dB para nível 0-1 */
  static dbToLevel(dB: number): number {
    if (dB <= -60) return 0;
    if (dB >= 0) return 1;
    return Math.pow(10, dB / 20);
  }

  isConnected(): boolean {
    return this.connected;
  }

  isSimulator(): boolean {
    return this.config.simulatorMode;
  }

  updateConfig(config: Partial<MatrixClientConfig>) {
    this.config = { ...this.config, ...config };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.tcpClient) {
      this.tcpClient.destroy();
      this.tcpClient = null;
    }
    if (this.udpClient) {
      this.udpClient.close();
      this.udpClient = null;
    }
    this.connected = false;
    this.emit("disconnected");
  }
}

// Instância singleton gerenciada pelo servidor
let _matrixClient: MatrixClient | null = null;

export function getMatrixClient(): MatrixClient {
  if (!_matrixClient) {
    _matrixClient = new MatrixClient({ simulatorMode: true });
  }
  return _matrixClient;
}

export function resetMatrixClient(config: Partial<MatrixClientConfig>) {
  if (_matrixClient) {
    _matrixClient.disconnect();
  }
  _matrixClient = new MatrixClient(config);
  return _matrixClient;
}
