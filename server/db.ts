import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  Channel,
  ChannelSend,
  InsertChannel,
  InsertChannelSend,
  InsertMixPreset,
  InsertMusician,
  InsertUser,
  Musician,
  channels,
  channelSends,
  mixPresets,
  mixerConfig,
  musicians,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ─────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Musicians ─────────────────────────────────────────────────────────────

export async function getAllMusicians(): Promise<Musician[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(musicians).orderBy(musicians.sortOrder);
}

export async function getMusicianById(id: number): Promise<Musician | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(musicians).where(eq(musicians.id, id)).limit(1);
  return result[0];
}

export async function getMusicianByPin(pin: string): Promise<Musician | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(musicians)
    .where(and(eq(musicians.pin, pin), eq(musicians.isActive, true)))
    .limit(1);
  return result[0];
}

export async function createMusician(data: InsertMusician): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(musicians).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateMusician(id: number, data: Partial<InsertMusician>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(musicians).set(data).where(eq(musicians.id, id));
}

export async function deleteMusician(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(musicians).where(eq(musicians.id, id));
}

// ─── Channels ──────────────────────────────────────────────────────────────

export async function getAllChannels(): Promise<Channel[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(channels).orderBy(channels.sortOrder);
}

export async function getChannelById(id: number): Promise<Channel | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  return result[0];
}

export async function createChannel(data: InsertChannel): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(channels).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function updateChannel(id: number, data: Partial<InsertChannel>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(channels).set(data).where(eq(channels.id, id));
}

export async function deleteChannel(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(channels).where(eq(channels.id, id));
}

// ─── Channel Sends ─────────────────────────────────────────────────────────

export async function getSendsForMusician(musicianId: number): Promise<ChannelSend[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(channelSends).where(eq(channelSends.musicianId, musicianId));
}

export async function upsertSend(data: InsertChannelSend): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(channelSends)
    .values(data)
    .onDuplicateKeyUpdate({ set: { level: data.level, isMuted: data.isMuted } });
}

export async function getSend(musicianId: number, channelId: number): Promise<ChannelSend | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(channelSends)
    .where(and(eq(channelSends.musicianId, musicianId), eq(channelSends.channelId, channelId)))
    .limit(1);
  return result[0];
}

// ─── Mix Presets ───────────────────────────────────────────────────────────

export async function getPresetsForMusician(musicianId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mixPresets).where(eq(mixPresets.musicianId, musicianId));
}

export async function createPreset(data: InsertMixPreset): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(mixPresets).values(data);
  return (result[0] as { insertId: number }).insertId;
}

export async function deletePreset(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mixPresets).where(eq(mixPresets.id, id));
}

// ─── Mixer Config ──────────────────────────────────────────────────────────

export async function getMixerConfigValue(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(mixerConfig).where(eq(mixerConfig.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function setMixerConfigValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(mixerConfig)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function getAllMixerConfig(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(mixerConfig);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
