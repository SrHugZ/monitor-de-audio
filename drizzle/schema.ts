import {
  boolean,
  float,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Músicos/perfis de palco
export const musicians = mysqlTable("musicians", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  instrument: varchar("instrument", { length: 64 }).notNull(),
  icon: varchar("icon", { length: 64 }).default("music").notNull(),
  color: varchar("color", { length: 32 }).default("#22c55e").notNull(),
  pin: varchar("pin", { length: 8 }).notNull(), // PIN de acesso
  busOut: int("busOut").notNull(), // BUS/OUT da mesa (1-8)
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Musician = typeof musicians.$inferSelect;
export type InsertMusician = typeof musicians.$inferInsert;

// Canais de entrada mapeados para instrumentos
export const channels = mysqlTable("channels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(), // "Guitarra 1", "Teclado 2", etc
  channelType: mysqlEnum("channelType", ["IN", "STIN"]).default("IN").notNull(),
  channelNumber: int("channelNumber").notNull(), // número do canal na mesa
  icon: varchar("icon", { length: 64 }).default("music").notNull(),
  color: varchar("color", { length: 32 }).default("#3b82f6").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Channel = typeof channels.$inferSelect;
export type InsertChannel = typeof channels.$inferInsert;

// Níveis de send: canal -> bus de cada músico
export const channelSends = mysqlTable("channel_sends", {
  id: int("id").autoincrement().primaryKey(),
  musicianId: int("musicianId").notNull(),
  channelId: int("channelId").notNull(),
  level: float("level").default(0).notNull(), // 0.0 a 1.0 (mapeado para dB)
  isMuted: boolean("isMuted").default(false).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChannelSend = typeof channelSends.$inferSelect;
export type InsertChannelSend = typeof channelSends.$inferInsert;

// Presets de mix salvos
export const mixPresets = mysqlTable("mix_presets", {
  id: int("id").autoincrement().primaryKey(),
  musicianId: int("musicianId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  data: json("data").notNull(), // { channelId: level, ... }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MixPreset = typeof mixPresets.$inferSelect;
export type InsertMixPreset = typeof mixPresets.$inferInsert;

// Configuração global do mixer
export const mixerConfig = mysqlTable("mixer_config", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MixerConfig = typeof mixerConfig.$inferSelect;
