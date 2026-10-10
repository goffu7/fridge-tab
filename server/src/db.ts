import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Row } from "@libsql/client";
import { env } from "./env";
import type { Bill, BillItem, House, Member, Payment, PayRequest } from "../../shared/types";

if (env.databaseUrl.startsWith("file:")) mkdirSync(dirname(env.databaseUrl.slice(5)), { recursive: true });

export const db = createClient({ url: env.databaseUrl, authToken: env.databaseAuthToken });

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS houses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  promptpay TEXT NOT NULL DEFAULT '',
  pin_hash TEXT NOT NULL,
  color INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (house_id, name)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  store TEXT NOT NULL,
  payer_id TEXT NOT NULL REFERENCES members(id),
  receipt_total INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bills_house ON bills(house_id);
CREATE TABLE IF NOT EXISTS bill_items (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  en TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL,
  eaters TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bill_items_bill ON bill_items(bill_id);
CREATE TABLE IF NOT EXISTS slips (
  id TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL REFERENCES members(id),
  to_id TEXT NOT NULL REFERENCES members(id),
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  slip_id TEXT REFERENCES slips(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_house ON requests(house_id);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  house_id TEXT NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  from_id TEXT NOT NULL REFERENCES members(id),
  to_id TEXT NOT NULL REFERENCES members(id),
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('accepted', 'declined')),
  request_id TEXT UNIQUE,
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS payments_house ON payments(house_id);
`;

export async function migrate() {
  await db.executeMultiple(SCHEMA);
}

/* Row -> API object mappers */
const s = (v: unknown) => String(v ?? "");
const n = (v: unknown) => Number(v ?? 0);

export const toHouse = (r: Row): House => ({ id: s(r.id), name: s(r.name), inviteCode: s(r.invite_code) });
export const toMember = (r: Row): Member => ({ id: s(r.id), name: s(r.name), promptpay: s(r.promptpay), color: n(r.color) });
export const toItem = (r: Row): BillItem => ({ id: s(r.id), name: s(r.name), en: s(r.en), price: n(r.price), eaters: JSON.parse(s(r.eaters) || "[]") });
export const toBill = (r: Row, items: BillItem[]): Bill => ({
  id: s(r.id), date: s(r.date), store: s(r.store), payerId: s(r.payer_id),
  receiptTotal: r.receipt_total == null ? null : n(r.receipt_total),
  items, createdBy: s(r.created_by), createdAt: n(r.created_at), updatedAt: n(r.updated_at),
});
export const toPayment = (r: Row): Payment => ({
  id: s(r.id), fromId: s(r.from_id), toId: s(r.to_id), amount: n(r.amount), note: s(r.note),
  status: s(r.status) as Payment["status"], requestId: r.request_id == null ? null : s(r.request_id),
  date: s(r.date), createdAt: n(r.created_at), updatedAt: n(r.updated_at),
});
export const toRequest = (r: Row): PayRequest => ({
  id: s(r.id), fromId: s(r.from_id), toId: s(r.to_id), amount: n(r.amount), note: s(r.note),
  slipId: r.slip_id == null ? null : s(r.slip_id), createdAt: n(r.created_at),
});
