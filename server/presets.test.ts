/**
 * Tests for the presets tRPC router (save, list, load, delete).
 * Uses in-memory mocks for the DB helpers so no real database is required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB helpers ──────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();

  const presets: Array<{
    id: number;
    musicianId: number;
    name: string;
    data: Record<string, unknown>;
    createdAt: Date;
  }> = [];
  let nextId = 1;

  const sends: Array<{ musicianId: number; channelId: number; level: number; isMuted: boolean; updatedAt: Date }> = [];

  return {
    ...actual,
    getPresetsForMusician: vi.fn(async (musicianId: number) =>
      presets.filter((p) => p.musicianId === musicianId)
    ),
    createPreset: vi.fn(async (data: { musicianId: number; name: string; data: Record<string, unknown> }) => {
      const id = nextId++;
      presets.push({ id, ...data, createdAt: new Date() });
      return id;
    }),
    deletePreset: vi.fn(async (id: number) => {
      const idx = presets.findIndex((p) => p.id === id);
      if (idx !== -1) presets.splice(idx, 1);
    }),
    getSendsForMusician: vi.fn(async (musicianId: number) =>
      sends.filter((s) => s.musicianId === musicianId)
    ),
    upsertSend: vi.fn(async (data: { musicianId: number; channelId: number; level: number; isMuted: boolean }) => {
      const idx = sends.findIndex(
        (s) => s.musicianId === data.musicianId && s.channelId === data.channelId
      );
      if (idx !== -1) {
        sends[idx] = { ...sends[idx], ...data, updatedAt: new Date() };
      } else {
        sends.push({ ...data, updatedAt: new Date() });
      }
    }),
    getMusicianById: vi.fn(async () => undefined),
    getChannelById: vi.fn(async () => undefined),
  };
});

// ── Mock matrix-client ───────────────────────────────────────────────────────
vi.mock("./matrix-client", () => ({
  getMatrixClient: vi.fn(() => ({
    isConnected: () => false,
    setSend: vi.fn(),
  })),
  resetMatrixClient: vi.fn(),
  MatrixClient: { levelToDb: (v: number) => v * 60 - 60 },
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getPresetsForMusician, createPreset, deletePreset, getSendsForMusician } from "./db";

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("presets router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    caller = appRouter.createCaller(makeCtx());
  });

  it("lista presets vazia para músico sem presets", async () => {
    vi.mocked(getPresetsForMusician).mockResolvedValueOnce([]);
    const result = await caller.presets.list({ musicianId: 1 });
    expect(result).toEqual([]);
    expect(getPresetsForMusician).toHaveBeenCalledWith(1);
  });

  it("salva preset com os sends atuais do músico", async () => {
    const mockSends = [
      { musicianId: 1, channelId: 10, level: 0.8, isMuted: false, updatedAt: new Date() },
      { musicianId: 1, channelId: 11, level: 0.5, isMuted: true, updatedAt: new Date() },
    ];
    vi.mocked(getSendsForMusician).mockResolvedValueOnce(mockSends);
    vi.mocked(createPreset).mockResolvedValueOnce(42);

    const result = await caller.presets.save({ musicianId: 1, name: "Ensaio quarta" });

    expect(result).toEqual({ id: 42 });
    expect(createPreset).toHaveBeenCalledWith({
      musicianId: 1,
      name: "Ensaio quarta",
      data: {
        10: { level: 0.8, isMuted: false },
        11: { level: 0.5, isMuted: true },
      },
    });
  });

  it("salva preset com nome de até 128 caracteres", async () => {
    const longName = "A".repeat(128);
    vi.mocked(getSendsForMusician).mockResolvedValueOnce([]);
    vi.mocked(createPreset).mockResolvedValueOnce(99);

    const result = await caller.presets.save({ musicianId: 2, name: longName });
    expect(result.id).toBe(99);
  });

  it("rejeita preset com nome vazio", async () => {
    await expect(caller.presets.save({ musicianId: 1, name: "" })).rejects.toThrow();
  });

  it("deleta preset por id", async () => {
    vi.mocked(deletePreset).mockResolvedValueOnce(undefined);
    const result = await caller.presets.delete({ id: 5 });
    expect(result).toEqual({ success: true });
    expect(deletePreset).toHaveBeenCalledWith(5);
  });

  it("carrega preset e aplica sends ao músico", async () => {
    const { upsertSend } = await import("./db");
    const mockPresets = [
      {
        id: 7,
        musicianId: 1,
        name: "Show domingo",
        data: {
          10: { level: 0.9, isMuted: false },
          11: { level: 0.3, isMuted: true },
        },
        createdAt: new Date(),
      },
    ];
    vi.mocked(getPresetsForMusician).mockResolvedValueOnce(mockPresets as ReturnType<typeof getPresetsForMusician> extends Promise<infer T> ? T : never);

    const result = await caller.presets.load({ presetId: 7, musicianId: 1 });
    expect(result).toEqual({ success: true });
    expect(upsertSend).toHaveBeenCalledTimes(2);
    expect(upsertSend).toHaveBeenCalledWith({ musicianId: 1, channelId: 10, level: 0.9, isMuted: false });
    expect(upsertSend).toHaveBeenCalledWith({ musicianId: 1, channelId: 11, level: 0.3, isMuted: true });
  });

  it("lança NOT_FOUND ao carregar preset inexistente", async () => {
    vi.mocked(getPresetsForMusician).mockResolvedValueOnce([]);
    await expect(caller.presets.load({ presetId: 999, musicianId: 1 })).rejects.toThrow("Preset não encontrado");
  });

  it("lista retorna presets do músico correto", async () => {
    const mockPresets = [
      { id: 1, musicianId: 3, name: "Preset A", data: {}, createdAt: new Date() },
      { id: 2, musicianId: 3, name: "Preset B", data: {}, createdAt: new Date() },
    ];
    vi.mocked(getPresetsForMusician).mockResolvedValueOnce(mockPresets as ReturnType<typeof getPresetsForMusician> extends Promise<infer T> ? T : never);

    const result = await caller.presets.list({ musicianId: 3 });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Preset A");
    expect(result[1].name).toBe("Preset B");
  });
});
