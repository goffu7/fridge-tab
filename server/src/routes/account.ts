import { Router } from "express";
import { z } from "zod";
import { endSession, requireMember, SESSION_COOKIE, startSession } from "../auth";
import { db, toHouse, toMember } from "../db";
import { env } from "../env";
import { HttpError, me, parse, personName } from "../http";
import { FRIENDS, type LoginInfo, type MeResponse } from "../../../shared/types";

export const account = Router();

const friendIds = FRIENDS.map((f) => f.toLowerCase());

account.get("/friends", async (_req, res) => {
  const r = await db.execute({
    sql: `SELECT m.*, h.name AS house_name FROM members m JOIN houses h ON h.id = m.house_id WHERE m.id IN (${friendIds.map(() => "?").join(",")}) ORDER BY m.created_at`,
    args: friendIds,
  });
  const info: LoginInfo = {
    house: { name: String(r.rows[0]?.house_name ?? "") },
    members: r.rows.map(toMember).map(({ id, name, color }) => ({ id, name, color })),
  };
  res.json(info);
});

account.post("/friends/login", async (req, res) => {
  const body = parse(z.object({ memberId: z.enum(friendIds as [string, ...string[]]) }), req.body);
  const r = await db.execute({ sql: "SELECT id FROM members WHERE id = ?", args: [body.memberId] });
  if (!r.rows[0]) throw new HttpError(404, "That person isn't set up yet.");
  await startSession(res, body.memberId);
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
    z.object({ name: personName.optional(), promptpay: z.string().trim().max(20).regex(/^[\d\s-]*$/, "Use digits only").optional() }),
    req.body,
  );
  if (body.name) {
    const clash = await db.execute({ sql: "SELECT 1 FROM members WHERE house_id = ? AND lower(name) = lower(?) AND id != ?", args: [m.houseId, body.name, m.id] });
    if (clash.rows.length) throw new HttpError(409, `Someone else is already called ${body.name}.`);
    await db.execute({ sql: "UPDATE members SET name = ? WHERE id = ?", args: [body.name, m.id] });
  }
  if (body.promptpay !== undefined) await db.execute({ sql: "UPDATE members SET promptpay = ? WHERE id = ?", args: [body.promptpay, m.id] });
  res.status(204).end();
});
