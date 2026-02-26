/**
 * Reconnect Watchdog — monitora a conexão com a mesa Waldman e tenta
 * reconectar automaticamente quando a conexão é perdida.
 *
 * Comportamento:
 *  - Intervalo base: 30 segundos
 *  - Backoff exponencial: 30s → 60s → 120s → 240s → 300s (máx)
 *  - Reset do backoff ao conectar com sucesso
 *  - Para automaticamente em modo simulador ou após desconexão manual
 *  - Emite eventos para notificar o WebSocket server
 */

import { EventEmitter } from "events";

export type WatchdogState = "idle" | "watching" | "connecting" | "connected" | "stopped";

export interface WatchdogStatus {
  state: WatchdogState;
  attempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  lastError: string | null;
  intervalMs: number;
}

// Intervalo base em ms
const BASE_INTERVAL_MS = 30_000;
// Intervalo máximo (backoff cap) em ms
const MAX_INTERVAL_MS = 300_000; // 5 minutos
// Multiplicador de backoff
const BACKOFF_MULTIPLIER = 2;

export class ReconnectWatchdog extends EventEmitter {
  private state: WatchdogState = "idle";
  private attempts = 0;
  private lastAttemptAt: Date | null = null;
  private nextAttemptAt: Date | null = null;
  private lastError: string | null = null;
  private currentIntervalMs = BASE_INTERVAL_MS;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  // Função de reconexão injetada externamente
  private reconnectFn: (() => Promise<boolean>) | null = null;
  // Função de verificação de conexão injetada externamente
  private isConnectedFn: (() => boolean) | null = null;

  constructor() {
    super();
  }

  /**
   * Configura as funções de reconexão e verificação de estado.
   * Deve ser chamado antes de start().
   */
  configure(opts: {
    reconnect: () => Promise<boolean>;
    isConnected: () => boolean;
  }) {
    this.reconnectFn = opts.reconnect;
    this.isConnectedFn = opts.isConnected;
  }

  /**
   * Inicia o watchdog. Começa a monitorar a conexão.
   * Não faz nada se já estiver rodando ou em modo simulador.
   */
  start() {
    if (this.state === "watching" || this.state === "connecting") return;
    if (!this.reconnectFn || !this.isConnectedFn) {
      console.warn("[Watchdog] Não configurado — chame configure() antes de start()");
      return;
    }

    this.stopped = false;
    this.currentIntervalMs = BASE_INTERVAL_MS;
    this._setState("watching");
    this._scheduleNext();
    console.log(`[Watchdog] Iniciado — tentará reconectar a cada ${BASE_INTERVAL_MS / 1000}s`);
  }

  /**
   * Para o watchdog. Cancela qualquer tentativa pendente.
   */
  stop() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.nextAttemptAt = null;
    this._setState("stopped");
    console.log("[Watchdog] Parado");
  }

  /**
   * Notifica o watchdog que a conexão foi estabelecida com sucesso.
   * Reseta o backoff e para o ciclo de tentativas.
   */
  onConnected() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.attempts = 0;
    this.currentIntervalMs = BASE_INTERVAL_MS;
    this.nextAttemptAt = null;
    this.lastError = null;
    this._setState("connected");
    console.log("[Watchdog] Conexão estabelecida — backoff resetado");
  }

  /**
   * Notifica o watchdog que a conexão foi perdida.
   * Reinicia o ciclo de tentativas se não estiver parado.
   */
  onDisconnected(reason?: string) {
    if (this.stopped) return;
    if (this.state === "connected" || this.state === "idle") {
      this.lastError = reason ?? "Conexão perdida";
      this._setState("watching");
      this._scheduleNext();
      console.log(`[Watchdog] Conexão perdida (${reason ?? "desconhecido"}) — iniciando reconexão`);
    }
  }

  /** Retorna o estado atual do watchdog para exposição via tRPC */
  getStatus(): WatchdogStatus {
    return {
      state: this.state,
      attempts: this.attempts,
      lastAttemptAt: this.lastAttemptAt,
      nextAttemptAt: this.nextAttemptAt,
      lastError: this.lastError,
      intervalMs: this.currentIntervalMs,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private _setState(newState: WatchdogState) {
    const prev = this.state;
    this.state = newState;
    if (prev !== newState) {
      this.emit("stateChange", newState, prev);
    }
  }

  private _scheduleNext() {
    if (this.stopped) return;

    const delay = this.currentIntervalMs;
    const nextAt = new Date(Date.now() + delay);
    this.nextAttemptAt = nextAt;

    console.log(
      `[Watchdog] Próxima tentativa em ${delay / 1000}s (${nextAt.toLocaleTimeString("pt-BR")})`
    );

    this.timer = setTimeout(() => {
      this._attempt();
    }, delay);
  }

  private async _attempt() {
    if (this.stopped) return;
    if (!this.reconnectFn || !this.isConnectedFn) return;

    // Verifica se já está conectado (pode ter reconectado manualmente)
    if (this.isConnectedFn()) {
      this.onConnected();
      return;
    }

    this.attempts++;
    this.lastAttemptAt = new Date();
    this.nextAttemptAt = null;
    this._setState("connecting");

    console.log(`[Watchdog] Tentativa #${this.attempts} de reconexão...`);
    this.emit("attempt", this.attempts);

    try {
      const success = await this.reconnectFn();

      if (success) {
        console.log(`[Watchdog] Reconectado com sucesso na tentativa #${this.attempts}!`);
        this.emit("reconnected", this.attempts);
        this.onConnected();
        // Volta a monitorar (para detectar próxima desconexão)
        this._setState("watching");
      } else {
        this._onAttemptFailed("Falha na reconexão");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._onAttemptFailed(msg);
    }
  }

  private _onAttemptFailed(reason: string) {
    if (this.stopped) return;

    this.lastError = reason;
    console.warn(`[Watchdog] Tentativa #${this.attempts} falhou: ${reason}`);
    this.emit("failed", this.attempts, reason);

    // Aplica backoff exponencial
    this.currentIntervalMs = Math.min(
      this.currentIntervalMs * BACKOFF_MULTIPLIER,
      MAX_INTERVAL_MS
    );

    this._setState("watching");
    this._scheduleNext();
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
let _watchdog: ReconnectWatchdog | null = null;

export function getWatchdog(): ReconnectWatchdog {
  if (!_watchdog) {
    _watchdog = new ReconnectWatchdog();
  }
  return _watchdog;
}

/** Reseta o singleton (útil para testes) */
export function resetWatchdog(): ReconnectWatchdog {
  if (_watchdog) {
    _watchdog.stop();
    _watchdog.removeAllListeners();
  }
  _watchdog = new ReconnectWatchdog();
  return _watchdog;
}
