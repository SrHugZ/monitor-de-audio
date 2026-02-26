import { describe, expect, it, beforeEach } from "vitest";
import { MatrixClient } from "./matrix-client";

describe("MatrixClient - Modo Simulador", () => {
  let client: MatrixClient;

  beforeEach(async () => {
    client = new MatrixClient({ simulatorMode: true });
    await client.connect();
  });

  it("deve conectar em modo simulador", () => {
    expect(client.isConnected()).toBe(true);
    expect(client.isSimulator()).toBe(true);
  });

  it("deve definir e ler ganho de entrada", async () => {
    await client.setGain("IN", 1, -10);
    const gain = await client.getGain("IN", 1);
    expect(gain).toBeCloseTo(-10, 0);
  });

  it("deve definir e ler ganho de saída", async () => {
    await client.setGain("OUT", 3, -20);
    const gain = await client.getGain("OUT", 3);
    expect(gain).toBeCloseTo(-20, 0);
  });

  it("deve definir e ler send de canal para BUS", async () => {
    await client.setSend("IN", 2, 5, -15);
    const level = await client.getSend("IN", 2, 5);
    expect(level).toBeCloseTo(-15, 0);
  });

  it("deve clampar ganho a -60dB mínimo", async () => {
    await client.setGain("IN", 1, -100);
    const gain = await client.getGain("IN", 1);
    expect(gain).toBeGreaterThanOrEqual(-60);
  });

  it("deve clampar ganho a +10dB máximo", async () => {
    await client.setGain("IN", 1, 100);
    const gain = await client.getGain("IN", 1);
    expect(gain).toBeLessThanOrEqual(10);
  });

  it("deve ler VU meter", async () => {
    const vu = await client.getVU("IN", 1);
    expect(vu).toBeGreaterThanOrEqual(-60);
    expect(vu).toBeLessThanOrEqual(0);
  });

  it("deve definir e ler preset", async () => {
    await client.setPreset(3);
    const preset = await client.getPreset();
    expect(preset).toBe(3);
  });

  it("deve desconectar corretamente", () => {
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });
});

describe("MatrixClient - Conversão dB/Level", () => {
  it("level 0 deve ser -60dB", () => {
    expect(MatrixClient.levelToDb(0)).toBe(-60);
  });

  it("level 1 deve ser 0dB", () => {
    expect(MatrixClient.levelToDb(1)).toBe(0);
  });

  it("level 0.5 deve ser aproximadamente -6dB", () => {
    const dB = MatrixClient.levelToDb(0.5);
    expect(dB).toBeCloseTo(-6.02, 1);
  });

  it("dB -60 deve ser level 0", () => {
    expect(MatrixClient.dbToLevel(-60)).toBe(0);
  });

  it("dB 0 deve ser level 1", () => {
    expect(MatrixClient.dbToLevel(0)).toBe(1);
  });

  it("conversão deve ser inversível", () => {
    const level = 0.7;
    const dB = MatrixClient.levelToDb(level);
    const backToLevel = MatrixClient.dbToLevel(dB);
    expect(backToLevel).toBeCloseTo(level, 5);
  });
});

describe("MatrixClient - Comandos Nctrl", () => {
  let client: MatrixClient;

  beforeEach(async () => {
    client = new MatrixClient({ simulatorMode: true });
    await client.connect();
  });

  it("deve processar comando SET MUTE IN ON", async () => {
    const resp = await client.setMute("IN", 1, true);
    expect(resp).toContain("OK");
    expect(resp).toContain("ON");
  });

  it("deve processar comando SET MUTE IN OFF", async () => {
    const resp = await client.setMute("IN", 1, false);
    expect(resp).toContain("OK");
    expect(resp).toContain("OFF");
  });

  it("deve processar comando SET GAIN STIN", async () => {
    const resp = await client.setGain("STIN", 1, -5);
    expect(resp).toContain("OK");
  });

  it("deve processar send para múltiplos BUS", async () => {
    await client.setSend("IN", 1, 1, -10);
    await client.setSend("IN", 1, 2, -15);
    await client.setSend("IN", 1, 3, -20);

    const level1 = await client.getSend("IN", 1, 1);
    const level2 = await client.getSend("IN", 1, 2);
    const level3 = await client.getSend("IN", 1, 3);

    expect(level1).toBeCloseTo(-10, 0);
    expect(level2).toBeCloseTo(-15, 0);
    expect(level3).toBeCloseTo(-20, 0);
  });
});
