/**
 * Testes unitários para o módulo network-scanner.
 * As funções de conexão TCP são mockadas para evitar tráfego de rede real.
 * Usa timeout estendido pois o scan varre 254 hosts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLocalIp, getSubnet, getSubnetHosts, NCTRL_PORTS } from "./network-scanner";

// ── Mock do módulo 'os' ───────────────────────────────────────────────────────
vi.mock("os", () => ({
  networkInterfaces: () => ({
    eth0: [
      { family: "IPv4", address: "192.168.1.50", internal: false },
    ],
    lo: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
  }),
}));

// ── Tests de utilitários (sem rede) ──────────────────────────────────────────
describe("network-scanner - utilitários", () => {
  it("getLocalIp retorna o primeiro IP não-loopback", () => {
    const ip = getLocalIp();
    expect(ip).toBe("192.168.1.50");
  });

  it("getSubnet extrai os 3 primeiros octetos", () => {
    expect(getSubnet("192.168.1.50")).toBe("192.168.1");
    expect(getSubnet("10.0.0.1")).toBe("10.0.0");
    expect(getSubnet("172.16.254.100")).toBe("172.16.254");
  });

  it("getSubnetHosts gera 254 hosts para uma sub-rede /24", () => {
    const hosts = getSubnetHosts("192.168.1");
    expect(hosts).toHaveLength(254);
    expect(hosts[0]).toBe("192.168.1.1");
    expect(hosts[253]).toBe("192.168.1.254");
  });

  it("getSubnetHosts não inclui .0 nem .255", () => {
    const hosts = getSubnetHosts("10.0.0");
    expect(hosts).not.toContain("10.0.0.0");
    expect(hosts).not.toContain("10.0.0.255");
  });

  it("NCTRL_PORTS contém as portas padrão da Waldman", () => {
    expect(NCTRL_PORTS).toContain(3000);
    expect(NCTRL_PORTS).toContain(8080);
    expect(NCTRL_PORTS).toContain(9000);
    expect(NCTRL_PORTS.length).toBeGreaterThanOrEqual(4);
  });
});

// ── Tests do scanNetwork com mock de net ─────────────────────────────────────
// Importamos scanNetwork depois de configurar o mock via vi.doMock para
// controlar o comportamento por teste sem hoisting.
describe("network-scanner - scanNetwork", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("retorna lista vazia quando nenhum host responde", async () => {
    // Mock: todos os sockets emitem erro imediatamente
    vi.doMock("net", () => {
      const { EventEmitter } = require("events");
      class MockSocket extends EventEmitter {
        setTimeout() {}
        connect() {
          setImmediate(() => this.emit("error", new Error("ECONNREFUSED")));
          return this;
        }
        write() {}
        destroy() {}
      }
      return { Socket: MockSocket };
    });

    const { scanNetwork } = await import("./network-scanner");
    const results = await scanNetwork({ subnet: "192.168.99", ports: [3000] });
    expect(results).toEqual([]);
  }, 60_000);

  it("detecta host com porta aberta e sem resposta Waldman", async () => {
    // Mock: apenas 192.168.2.50:3000 aceita conexão, sem dados
    vi.doMock("net", () => {
      const { EventEmitter } = require("events");
      class MockSocket extends EventEmitter {
        _host = "";
        _port = 0;
        setTimeout() {}
        connect(port: number, host: string) {
          this._host = host;
          this._port = port;
          setImmediate(() => {
            if (host === "192.168.2.50" && port === 3000) {
              this.emit("connect");
              // Sem dados — probe timeout
              setTimeout(() => this.emit("timeout"), 50);
            } else {
              this.emit("error", new Error("ECONNREFUSED"));
            }
          });
          return this;
        }
        write() {}
        destroy() {}
      }
      return { Socket: MockSocket };
    });

    const { scanNetwork } = await import("./network-scanner");
    const results = await scanNetwork({ subnet: "192.168.2", ports: [3000] });

    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find((r) => r.host === "192.168.2.50" && r.port === 3000);
    expect(found).toBeDefined();
    expect(found?.isWaldman).toBe(false);
    expect(found?.latencyMs).toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("marca dispositivo como Waldman quando responde com 'OK PRESET'", async () => {
    vi.doMock("net", () => {
      const { EventEmitter } = require("events");
      class MockSocket extends EventEmitter {
        setTimeout() {}
        connect(port: number, host: string) {
          setImmediate(() => {
            if (host === "192.168.3.100" && port === 3000) {
              this.emit("connect");
              setImmediate(() => this.emit("data", Buffer.from("OK PRESET 1\r\n")));
            } else {
              this.emit("error", new Error("ECONNREFUSED"));
            }
          });
          return this;
        }
        write() {}
        destroy() {}
      }
      return { Socket: MockSocket };
    });

    const { scanNetwork } = await import("./network-scanner");
    const results = await scanNetwork({ subnet: "192.168.3", ports: [3000] });

    const waldman = results.find((r) => r.host === "192.168.3.100");
    expect(waldman).toBeDefined();
    expect(waldman?.isWaldman).toBe(true);
    expect(waldman?.responseSnippet).toContain("OK");
  }, 60_000);

  it("ordena Waldman antes de dispositivos genéricos", async () => {
    vi.doMock("net", () => {
      const { EventEmitter } = require("events");
      class MockSocket extends EventEmitter {
        setTimeout() {}
        connect(port: number, host: string) {
          setImmediate(() => {
            if (host === "192.168.4.100" && port === 3000) {
              // Waldman
              this.emit("connect");
              setImmediate(() => this.emit("data", Buffer.from("OK PRESET 2\r\n")));
            } else if (host === "192.168.4.10" && port === 3000) {
              // Genérico — porta aberta, sem resposta
              this.emit("connect");
              setTimeout(() => this.emit("timeout"), 50);
            } else {
              this.emit("error", new Error("ECONNREFUSED"));
            }
          });
          return this;
        }
        write() {}
        destroy() {}
      }
      return { Socket: MockSocket };
    });

    const { scanNetwork } = await import("./network-scanner");
    const results = await scanNetwork({ subnet: "192.168.4", ports: [3000] });

    expect(results.length).toBeGreaterThanOrEqual(2);
    const waldmanIdx = results.findIndex((r) => r.isWaldman);
    const genericIdx = results.findIndex((r) => !r.isWaldman);
    expect(waldmanIdx).toBeGreaterThanOrEqual(0);
    expect(genericIdx).toBeGreaterThanOrEqual(0);
    expect(waldmanIdx).toBeLessThan(genericIdx);
  }, 60_000);

  it("aceita subnet e ports customizados", async () => {
    vi.doMock("net", () => {
      const { EventEmitter } = require("events");
      class MockSocket extends EventEmitter {
        setTimeout() {}
        connect(port: number, host: string) {
          setImmediate(() => {
            if (host === "10.0.1.5" && port === 9000) {
              this.emit("connect");
              setTimeout(() => this.emit("timeout"), 50);
            } else {
              this.emit("error", new Error("ECONNREFUSED"));
            }
          });
          return this;
        }
        write() {}
        destroy() {}
      }
      return { Socket: MockSocket };
    });

    const { scanNetwork } = await import("./network-scanner");
    const results = await scanNetwork({ subnet: "10.0.1", ports: [9000] });

    const found = results.find((r) => r.host === "10.0.1.5" && r.port === 9000);
    expect(found).toBeDefined();
  }, 60_000);
});
