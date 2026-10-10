import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { z } from "zod";
import { endSession, requireMember, SESSION_COOKIE, startSession } from "../auth";
import { db, toHouse, toMember } from "../db";
import { env } from "../env";
import { HttpError, me, newId, parse, personName, pin } from "../http";
import { MAX_MEMBERS, type InviteInfo, type MeResponse } from "../../../shared/types";

export const account = Router();

// PINs are short, so guesses are tightly limited per IP and member.
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${req.body?.memberId ?? ""}`,
  message: { error: "Too many wrong PINs. Wait 15 minutes and try again." },
});
const createLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many attempts. Try again later." } });

async function houseByCode(code: string) {
  const r = await db.execute({ sql: "SELECT * FROM houses WHERE invite_code = ?", args: [code] });
  if (!r.rows[0]) throw new HttpError(404, "This invite link doesn't work. Ask for a new one.");
  return toHouse(r.rows[0]);
}

async function addMember(houseId: string, name: string, pinCode: string) {
  const existing = await db.execute({ sql: "SELECT name, color FROM members WHERE house_id = ?", args: [houseId] });
  if (existing.rows.length >= MAX_MEMBERS) throw new HttpError(409, `A house can have up to ${MAX_MEMBERS} people.`);
  if (existing.rows.some((r) => String(r.name).toLowerCase() === name.toLowerCase())) throw new HttpError(409, `Someone called ${name} is already in this house. Log in instead, or pick another name.`);
  const used = new Set(existing.rows.map((r) => Number(r.color)));
  const color = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c)) ?? 0;
  const id = newId();
  await db.execute({
    sql: "INSERT INTO members (id, house_id, name, promptpay, pin_hash, color, created_at) VALUES (?, ?, ?, '', ?, ?, ?)",
    args: [id, houseId, name, await bcrypt.hash(pinCode, 10), color, Date.now()],
  });
  return id;
}

account.post("/houses", createLimit, async (req, res) => {
  const body = parse(z.object({ houseName: z.string().trim().min(1).max(40), name: personName, pin }), req.body);
  const houseId = newId();
  const code = randomBytes(6).toString("base64url");
  await db.execute({ sql: "INSERT INTO houses (id, name, invite_code, created_at) VALUES (?, ?, ?, ?)", args: [houseId, body.houseName, code, Date.now()] });
  const memberId = await addMember(houseId, body.name, body.pin);
  await startSession(res, memberId);
  res.status(201).json({ inviteCode: code });
});

account.get("/invite/:code", async (req, res) => {
  const house = await houseByCode(String(req.params.code));
  const r = await db.execute({ sql: "SELECT * FROM members WHERE house_id = ? ORDER BY created_at", args: [house.id] });
  const info: InviteInfo = {
    house: { name: house.name },
    members: r.rows.map(toMember).map(({ id, name, color }) => ({ id, name, color })),
    full: r.rows.length >= MAX_MEMBERS,
  };
  res.json(info);
});

account.post("/invite/:code/join", createLimit, async (req, res) => {
  const house = await houseByCode(String(req.params.code));
  const body = parse(z.object({ name: personName, pin }), req.body);
  const memberId = await addMember(house.id, body.name, body.pin);
  await startSession(res, memberId);
  res.status(201).json({ ok: true });
});

account.post("/invite/:code/login", loginLimit, async (req, res) => {
  const house = await houseByCode(String(req.params.code));
  const body = parse(z.object({ memberId: z.string().min(1), pin }), req.body);
  const r = await db.execute({ sql: "SELECT id, pin_hash FROM members WHERE id = ? AND house_id = ?", args: [body.memberId, house.id] });
  const row = r.rows[0];
  if (!row || !(await bcrypt.compare(body.pin, String(row.pin_hash)))) throw new HttpError(401, "Wrong PIN. Try again.");
  await startSession(res, String(row.id));
  res.json({ ok: true });
});

account.post("/logout", async (req, res) => {
  await endSession(req.cookies?.[SESSION_COOKIE], res);
  res.status(204).end();
});

account.get("/me", requireMember, async (req, res) => {
  const m = me(req);
  const [mr, hr] = await Promise.all([
    db.execute({ sql: "SELECT * FROM members WHERE id = ?", args: [m.id] }),
    db.execute({ sql: "SELECT * FROM houses WHERE id = ?", args: [m.houseId] }),
  ]);
  const out: MeResponse = { member: toMember(mr.rows[0]), house: toHouse(hr.rows[0]), scanEnabled: Boolean(env.geminiKey) };
  res.json(out);
});

account.patch("/me", requireMember, async (req, res) => {
  const m = me(req);
  const body = parse(
    z.object({ name: personName.optional(), promptpay: z.string().trim().max(20).regex(/^[\d\s-]*$/, "Use digits only").optional(), pin: pin.optional() }),
    req.body,
  );
  if (body.name) {
    const clash = await db.execute({ sql: "SELECT 1 FROM members WHERE house_id = ? AND lower(name) = lower(?) AND id != ?", args: [m.houseId, body.name, m.id] });
    if (clash.rows.length) throw new HttpError(409, `Someone else is already called ${body.name}.`);
    await db.execute({ sql: "UPDATE members SET name = ? WHERE id = ?", args: [body.name, m.id] });
  }
  if (body.promptpay !== undefined) await db.execute({ sql: "UPDATE members SET promptpay = ? WHERE id = ?", args: [body.promptpay, m.id] });
  if (body.pin) await db.execute({ sql: "UPDATE members SET pin_hash = ? WHERE id = ?", args: [await bcrypt.hash(body.pin, 10), m.id] });
  res.status(204).end();
});
