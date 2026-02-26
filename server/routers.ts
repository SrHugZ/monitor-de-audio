import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createChannel,
  createMusician,
  createPreset,
  deleteChannel,
  deleteMusician,
  deletePreset,
  getAllChannels,
  getAllMixerConfig,
  getAllMusicians,
  getChannelById,
  getMusicianById,
  getMusicianByPin,
  getPresetsForMusician,
  getSend,
  getSendsForMusician,
  setMixerConfigValue,
  updateChannel,
  updateMusician,
  upsertSend,
} from "./db";
import { getMatrixClient, resetMatrixClient } from "./matrix-client";
import { scanNetwork, getLocalIp, getSubnet, NCTRL_PORTS } from "./network-scanner";
import { getWatchdog } from "./reconnect-watchdog";

// ─── Admin procedure ────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Acesso restrito a administradores" });
  }
  return next({ ctx });
});

// ─── Musicians Router ───────────────────────────────────────────────────────
const musiciansRouter = router({
  list: publicProcedure.query(async () => {
    return getAllMusicians();
  }),

  getById: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const musician = await getMusicianById(input.id);
    if (!musician) throw new TRPCError({ code: "NOT_FOUND", message: "Músico não encontrado" });
    return musician;
  }),

  verifyPin: publicProcedure
    .input(z.object({ pin: z.string().min(4).max(8) }))
    .mutation(async ({ input }) => {
      const musician = await getMusicianByPin(input.pin);
      if (!musician) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "PIN inválido" });
      }
      return { id: musician.id, name: musician.name, instrument: musician.instrument, busOut: musician.busOut };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        instrument: z.string().min(1).max(64),
        icon: z.string().default("music"),
        color: z.string().default("#22c55e"),
        pin: z.string().min(4).max(8),
        busOut: z.number().int().min(1).max(8),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ input }) => {
      const id = await createMusician({ ...input, isActive: true });
      return { id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(128).optional(),
        instrument: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        pin: z.string().min(4).max(8).optional(),
        busOut: z.number().int().min(1).max(8).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateMusician(id, data);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteMusician(input.id);
      return { success: true };
    }),
});

// ─── Channels Router ────────────────────────────────────────────────────────
const channelsRouter = router({
  list: publicProcedure.query(async () => {
    return getAllChannels();
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        channelType: z.enum(["IN", "STIN"]).default("IN"),
        channelNumber: z.number().int().min(1).max(26),
        icon: z.string().default("music"),
        color: z.string().default("#3b82f6"),
        sortOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ input }) => {
      const id = await createChannel({ ...input, isActive: true });
      return { id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        channelType: z.enum(["IN", "STIN"]).optional(),
        channelNumber: z.number().int().min(1).max(26).optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateChannel(id, data);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteChannel(input.id);
      return { success: true };
    }),
});

// ─── Sends Router ───────────────────────────────────────────────────────────
const sendsRouter = router({
  getForMusician: publicProcedure
    .input(z.object({ musicianId: z.number() }))
    .query(async ({ input }) => {
      return getSendsForMusician(input.musicianId);
    }),

  set: publicProcedure
    .input(
      z.object({
        musicianId: z.number(),
        channelId: z.number(),
        level: z.number().min(0).max(1),
        isMuted: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Salva no banco
      const existing = await getSend(input.musicianId, input.channelId);
      await upsertSend({
        musicianId: input.musicianId,
        channelId: input.channelId,
        level: input.level,
        isMuted: input.isMuted ?? existing?.isMuted ?? false,
      });

      // Envia para o mixer
      const musician = await getMusicianById(input.musicianId);
      const channel = await getChannelById(input.channelId);
      if (musician && channel) {
        const matrix = getMatrixClient();
        if (matrix.isConnected()) {
          const dB = input.isMuted ? -60 : (await import("./matrix-client")).MatrixClient.levelToDb(input.level);
          await matrix
            .setSend(channel.channelType as "IN" | "STIN", channel.channelNumber, musician.busOut, dB)
            .catch(() => {});
        }
      }
      return { success: true };
    }),

  setMute: publicProcedure
    .input(
      z.object({
        musicianId: z.number(),
        channelId: z.number(),
        isMuted: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await getSend(input.musicianId, input.channelId);
      await upsertSend({
        musicianId: input.musicianId,
        channelId: input.channelId,
        level: existing?.level ?? 0.7,
        isMuted: input.isMuted,
      });

      const musician = await getMusicianById(input.musicianId);
      const channel = await getChannelById(input.channelId);
      if (musician && channel) {
        const matrix = getMatrixClient();
        if (matrix.isConnected()) {
          const level = existing?.level ?? 0.7;
          const dB = input.isMuted ? -60 : (await import("./matrix-client")).MatrixClient.levelToDb(level);
          await matrix
            .setSend(channel.channelType as "IN" | "STIN", channel.channelNumber, musician.busOut, dB)
            .catch(() => {});
        }
      }
      return { success: true };
    }),

  resetMix: publicProcedure
    .input(z.object({ musicianId: z.number() }))
    .mutation(async ({ input }) => {
      const allChannels = await getAllChannels();
      const matrix = getMatrixClient();
      const musician = await getMusicianById(input.musicianId);
      for (const ch of allChannels) {
        await upsertSend({
          musicianId: input.musicianId,
          channelId: ch.id,
          level: 0.7,
          isMuted: false,
        });
        if (musician && matrix.isConnected()) {
          const dB = (await import("./matrix-client")).MatrixClient.levelToDb(0.7);
          await matrix
            .setSend(ch.channelType as "IN" | "STIN", ch.channelNumber, musician.busOut, dB)
            .catch(() => {});
        }
      }
      return { success: true };
    }),
});

// ─── Presets Router ─────────────────────────────────────────────────────────
const presetsRouter = router({
  list: publicProcedure
    .input(z.object({ musicianId: z.number() }))
    .query(async ({ input }) => {
      return getPresetsForMusician(input.musicianId);
    }),

  save: publicProcedure
    .input(
      z.object({
        musicianId: z.number(),
        name: z.string().min(1).max(128),
      })
    )
    .mutation(async ({ input }) => {
      const sends = await getSendsForMusician(input.musicianId);
      const data: Record<number, { level: number; isMuted: boolean }> = {};
      sends.forEach((s) => {
        data[s.channelId] = { level: s.level, isMuted: s.isMuted };
      });
      const id = await createPreset({
        musicianId: input.musicianId,
        name: input.name,
        data,
      });
      return { id };
    }),

  load: publicProcedure
    .input(z.object({ presetId: z.number(), musicianId: z.number() }))
    .mutation(async ({ input }) => {
      const presets = await getPresetsForMusician(input.musicianId);
      const preset = presets.find((p) => p.id === input.presetId);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "Preset não encontrado" });
      const data = preset.data as Record<number, { level: number; isMuted: boolean }>;
      const matrix = getMatrixClient();
      const musician = await getMusicianById(input.musicianId);
      for (const [channelIdStr, values] of Object.entries(data)) {
        const channelId = parseInt(channelIdStr);
        await upsertSend({ musicianId: input.musicianId, channelId, ...values });
        if (musician && matrix.isConnected()) {
          const channel = await getChannelById(channelId);
          if (channel) {
            const dB = values.isMuted ? -60 : (await import("./matrix-client")).MatrixClient.levelToDb(values.level);
            await matrix
              .setSend(channel.channelType as "IN" | "STIN", channel.channelNumber, musician.busOut, dB)
              .catch(() => {});
          }
        }
      }
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deletePreset(input.id);
      return { success: true };
    }),
});

// ─── Mixer Router ───────────────────────────────────────────────────────────
const mixerRouter = router({
  status: publicProcedure.query(async () => {
    const matrix = getMatrixClient();
    const config = await getAllMixerConfig();
    return {
      connected: matrix.isConnected(),
      simulatorMode: matrix.isSimulator(),
      host: config["host"] ?? "192.168.2.1",
      port: parseInt(config["port"] ?? "3000"),
      protocol: config["protocol"] ?? "tcp",
    };
  }),

  connect: adminProcedure
    .input(
      z.object({
        host: z.string(),
        port: z.number().int().min(1).max(65535),
        protocol: z.enum(["tcp", "udp"]).default("tcp"),
        simulatorMode: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      await setMixerConfigValue("host", input.host);
      await setMixerConfigValue("port", String(input.port));
      await setMixerConfigValue("protocol", input.protocol);
      await setMixerConfigValue("simulatorMode", String(input.simulatorMode));

      // Para o watchdog antes de reconectar manualmente
      const watchdog = getWatchdog();
      watchdog.stop();

      const client = resetMatrixClient({
        host: input.host,
        port: input.port,
        protocol: input.protocol,
        simulatorMode: input.simulatorMode,
      });

      // Reconfigura o watchdog com o novo client
      watchdog.configure({
        isConnected: () => client.isConnected(),
        reconnect: async () => {
          try {
            await client.connect();
            return client.isConnected();
          } catch {
            return false;
          }
        },
      });

      await client.connect();

      // Inicia watchdog apenas para conexões reais (não simulador)
      if (!input.simulatorMode && client.isConnected()) {
        watchdog.onConnected();
        // O watchdog será ativado pelo evento 'disconnected' do MatrixClient
      }

      return { success: true, connected: client.isConnected() };
    }),

  disconnect: adminProcedure.mutation(async () => {
    const matrix = getMatrixClient();
    // Para o watchdog antes de desconectar manualmente
    getWatchdog().stop();
    matrix.disconnect();
    return { success: true };
  }),

  watchdogStatus: publicProcedure.query(() => {
    return getWatchdog().getStatus();
  }),

  watchdogStart: adminProcedure.mutation(() => {
    const watchdog = getWatchdog();
    const matrix = getMatrixClient();
    if (!matrix.isSimulator()) {
      watchdog.start();
    }
    return watchdog.getStatus();
  }),

  watchdogStop: adminProcedure.mutation(() => {
    getWatchdog().stop();
    return { success: true };
  }),

  getVU: publicProcedure
    .input(
      z.object({
        channel: z.enum(["IN", "OUT", "STIN"]),
        number: z.number().int().min(1).max(26),
      })
    )
    .query(async ({ input }) => {
      const matrix = getMatrixClient();
      if (!matrix.isConnected()) return { level: -60 };
      const level = await matrix.getVU(input.channel, input.number);
      return { level };
    }),

  // ── Descoberta de rede ────────────────────────────────────────────────────
  localInfo: adminProcedure.query(() => {
    const ip = getLocalIp();
    return {
      serverIp: ip,
      subnet: getSubnet(ip),
      nctrlPorts: NCTRL_PORTS,
    };
  }),

  scan: adminProcedure
    .input(
      z.object({
        subnet: z.string().optional(),
        ports: z.array(z.number().int().min(1).max(65535)).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const results = await scanNetwork({
        subnet: input.subnet,
        ports: input.ports,
      });
      return { results };
    }),
});

// ─── Admin Router ───────────────────────────────────────────────────────────
const adminRouter = router({
  getConfig: adminProcedure.query(async () => {
    return getAllMixerConfig();
  }),

  setConfig: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input }) => {
      await setMixerConfigValue(input.key, input.value);
      return { success: true };
    }),

  seedDefaults: adminProcedure.mutation(async () => {
    // Cria músicos e canais padrão para a igreja
    const defaultMusicians = [
      { name: "Teclado 1", instrument: "Teclado", icon: "piano", color: "#8b5cf6", pin: "1111", busOut: 1, sortOrder: 0 },
      { name: "Teclado 2", instrument: "Teclado", icon: "piano", color: "#7c3aed", pin: "2222", busOut: 2, sortOrder: 1 },
      { name: "Guitarra 1", instrument: "Guitarra", icon: "guitar", color: "#f59e0b", pin: "3333", busOut: 3, sortOrder: 2 },
      { name: "Guitarra 2", instrument: "Guitarra", icon: "guitar", color: "#d97706", pin: "4444", busOut: 4, sortOrder: 3 },
      { name: "Contrabaixo", instrument: "Baixo", icon: "music", color: "#ef4444", pin: "5555", busOut: 5, sortOrder: 4 },
      { name: "Bateria", instrument: "Bateria", icon: "drum", color: "#06b6d4", pin: "6666", busOut: 6, sortOrder: 5 },
      { name: "Sax", instrument: "Sax", icon: "music-2", color: "#10b981", pin: "7777", busOut: 7, sortOrder: 6 },
    ];
    const defaultChannels = [
      { name: "Teclado 1", channelType: "IN" as const, channelNumber: 1, icon: "piano", color: "#8b5cf6", sortOrder: 0 },
      { name: "Teclado 2", channelType: "IN" as const, channelNumber: 2, icon: "piano", color: "#7c3aed", sortOrder: 1 },
      { name: "Guitarra 1", channelType: "IN" as const, channelNumber: 3, icon: "guitar", color: "#f59e0b", sortOrder: 2 },
      { name: "Guitarra 2", channelType: "IN" as const, channelNumber: 4, icon: "guitar", color: "#d97706", sortOrder: 3 },
      { name: "Contrabaixo", channelType: "IN" as const, channelNumber: 5, icon: "music", color: "#ef4444", sortOrder: 4 },
      { name: "Bateria", channelType: "IN" as const, channelNumber: 6, icon: "drum", color: "#06b6d4", sortOrder: 5 },
      { name: "Sax", channelType: "IN" as const, channelNumber: 7, icon: "music-2", color: "#10b981", sortOrder: 6 },
      { name: "Playback", channelType: "STIN" as const, channelNumber: 1, icon: "play-circle", color: "#64748b", sortOrder: 7 },
    ];
    for (const m of defaultMusicians) {
      await createMusician({ ...m, isActive: true }).catch(() => {});
    }
    for (const c of defaultChannels) {
      await createChannel({ ...c, isActive: true }).catch(() => {});
    }
    return { success: true };
  }),
});

// ─── App Router ─────────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  musicians: musiciansRouter,
  channels: channelsRouter,
  sends: sendsRouter,
  presets: presetsRouter,
  mixer: mixerRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
