/**
 * Testes unitários para o ReconnectWatchdog.
 * Usa vi.useFakeTimers() para controlar o tempo sem esperar intervalos reais.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReconnectWatchdog, resetWatchdog } from "./reconnect-watchdog";

// Usa timers falsos para controlar setTimeout sem esperar tempo real
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Reseta o singleton entre testes
  resetWatchdog();
});

function makeWatchdog(opts?: {
  connected?: boolean;
  reconnectResult?: boolean | Error;
}) {
  const wd = new ReconnectWatchdog();
  let _connected = opts?.connected ?? false;

  const reconnectFn = vi.fn(async () => {
    if (opts?.reconnectResult instanceof Error) throw opts.reconnectResult;
    const result = opts?.reconnectResult ?? true;
    if (result) _connected = true;
    return result as boolean;
  });

  wd.configure({
    isConnected: () => _connected,
    reconnect: reconnectFn,
  });

  return { wd, reconnectFn, setConnected: (v: boolean) => { _connected = v; } };
}

// ── Estado inicial ────────────────────────────────────────────────────────────
describe("ReconnectWatchdog - estado inicial", () => {
  it("começa no estado 'idle'", () => {
    const { wd } = makeWatchdog();
    expect(wd.getStatus().state).toBe("idle");
  });

  it("getStatus retorna valores padrão", () => {
    const { wd } = makeWatchdog();
    const s = wd.getStatus();
    expect(s.attempts).toBe(0);
    expect(s.lastAttemptAt).toBeNull();
    expect(s.nextAttemptAt).toBeNull();
    expect(s.lastError).toBeNull();
    expect(s.intervalMs).toBe(30_000);
  });
});

// ── Start / Stop ──────────────────────────────────────────────────────────────
describe("ReconnectWatchdog - start/stop", () => {
  it("muda para 'watching' ao iniciar", () => {
    const { wd } = makeWatchdog();
    wd.start();
    expect(wd.getStatus().state).toBe("watching");
  });

  it("muda para 'stopped' ao parar", () => {
    const { wd } = makeWatchdog();
    wd.start();
    wd.stop();
    expect(wd.getStatus().state).toBe("stopped");
  });

  it("não inicia duas vezes (idempotente)", () => {
    const { wd } = makeWatchdog();
    wd.start();
    wd.start(); // segunda chamada deve ser ignorada
    expect(wd.getStatus().state).toBe("watching");
  });

  it("define nextAttemptAt ao iniciar", () => {
    const { wd } = makeWatchdog();
    wd.start();
    expect(wd.getStatus().nextAttemptAt).not.toBeNull();
  });

  it("limpa nextAttemptAt ao parar", () => {
    const { wd } = makeWatchdog();
    wd.start();
    wd.stop();
    expect(wd.getStatus().nextAttemptAt).toBeNull();
  });
});

// ── Tentativa de reconexão ────────────────────────────────────────────────────
describe("ReconnectWatchdog - tentativas", () => {
  it("chama reconnectFn após 30s", async () => {
    const { wd, reconnectFn } = makeWatchdog({ reconnectResult: true });
    wd.start();

    expect(reconnectFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reconnectFn).toHaveBeenCalledTimes(1);
  });

  it("incrementa contador de tentativas", async () => {
    const { wd, reconnectFn } = makeWatchdog({ reconnectResult: false });
    wd.start();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(wd.getStatus().attempts).toBe(1);
    expect(reconnectFn).toHaveBeenCalledTimes(1);
  });

  it("registra lastAttemptAt após tentativa", async () => {
    const { wd } = makeWatchdog({ reconnectResult: false });
    wd.start();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(wd.getStatus().lastAttemptAt).not.toBeNull();
  });

  it("emite evento 'attempt' ao tentar reconectar", async () => {
    const { wd } = makeWatchdog({ reconnectResult: false });
    const onAttempt = vi.fn();
    wd.on("attempt", onAttempt);
    wd.start();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(onAttempt).toHaveBeenCalledWith(1);
  });

  it("emite evento 'reconnected' ao conectar com sucesso", async () => {
    const { wd } = makeWatchdog({ reconnectResult: true });
    const onReconnected = vi.fn();
    wd.on("reconnected", onReconnected);
    wd.start();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(onReconnected).toHaveBeenCalledWith(1);
  });
});

// ── Backoff exponencial ───────────────────────────────────────────────────────
describe("ReconnectWatchdog - backoff exponencial", () => {
  it("dobra o intervalo após falha", async () => {
    const { wd } = makeWatchdog({ reconnectResult: false });
    wd.start();

    await vi.advanceTimersByTimeAsync(30_000); // 1ª tentativa falha
    expect(wd.getStatus().intervalMs).toBe(60_000);
  });

  it("dobra novamente após segunda falha", async () => {
    const { wd } = makeWatchdog({ reconnectResult: false });
    wd.start();

    await vi.advanceTimersByTimeAsync(30_000); // 1ª falha → 60s
    await vi.advanceTimersByTimeAsync(60_000); // 2ª falha → 120s
    expect(wd.getStatus().intervalMs).toBe(120_000);
  });

  it("limita o intervalo máximo em 300s", async () => {
    const { wd } = makeWatchdog({ reconnectResult: false });
    wd.start();

    // Avança por várias falhas: 30 → 60 → 120 → 240 → 300 (cap)
    let elapsed = 0;
    for (let i = 0; i < 6; i++) {
      const interval = wd.getStatus().intervalMs;
      await vi.advanceTimersByTimeAsync(interval);
      elapsed += interval;
    }

    expect(wd.getStatus().intervalMs).toBe(300_000);
  });

  it("reseta o intervalo para 30s após reconexão bem-sucedida", async () => {
    const { wd } = makeWatchdog({ reconnectResult: false });
    wd.start();

    await vi.advanceTimersByTimeAsync(30_000); // falha → 60s
    expect(wd.getStatus().intervalMs).toBe(60_000);

    // Simula reconexão manual bem-sucedida
    wd.onConnected();
    expect(wd.getStatus().intervalMs).toBe(30_000);
  });
});

// ── onConnected / onDisconnected ──────────────────────────────────────────────
describe("ReconnectWatchdog - eventos de conexão", () => {
  it("onConnected muda estado para 'connected'", () => {
    const { wd } = makeWatchdog();
    wd.start();
    wd.onConnected();
    expect(wd.getStatus().state).toBe("connected");
  });

  it("onConnected reseta tentativas e erros", () => {
    const { wd } = makeWatchdog({ reconnectResult: false });
    wd.start();
    wd.onConnected();
    const s = wd.getStatus();
    expect(s.attempts).toBe(0);
    expect(s.lastError).toBeNull();
    expect(s.nextAttemptAt).toBeNull();
  });

  it("onDisconnected inicia ciclo de reconexão", () => {
    const { wd } = makeWatchdog();
    wd.onConnected(); // estava conectado
    wd.onDisconnected("Cabo desconectado");
    expect(wd.getStatus().state).toBe("watching");
    expect(wd.getStatus().lastError).toBe("Cabo desconectado");
  });

  it("onDisconnected não faz nada se watchdog estiver parado", () => {
    const { wd } = makeWatchdog();
    wd.stop();
    wd.onDisconnected("teste");
    expect(wd.getStatus().state).toBe("stopped");
  });
});

// ── Emissão de eventos de estado ──────────────────────────────────────────────
describe("ReconnectWatchdog - eventos stateChange", () => {
  it("emite stateChange ao iniciar", () => {
    const { wd } = makeWatchdog();
    const onChange = vi.fn();
    wd.on("stateChange", onChange);
    wd.start();
    expect(onChange).toHaveBeenCalledWith("watching", "idle");
  });

  it("emite stateChange ao parar", () => {
    const { wd } = makeWatchdog();
    wd.start();
    const onChange = vi.fn();
    wd.on("stateChange", onChange);
    wd.stop();
    expect(onChange).toHaveBeenCalledWith("stopped", "watching");
  });

  it("não emite stateChange se estado não mudar", () => {
    const { wd } = makeWatchdog();
    const onChange = vi.fn();
    wd.on("stateChange", onChange);
    wd.stop(); // idle → stopped
    wd.stop(); // stopped → stopped (sem mudança)
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
