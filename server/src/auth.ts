import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler, Response } from "express";
import { db } from "./db";
import { env } from "./env";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      member?: { id: string; houseId: string };
    }
  }
}

export const SESSION_COOKIE = "ft_session";
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function startSession(res: Response, memberId: string) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.execute({ sql: "INSERT INTO sessions (token_hash, member_id, created_at, last_seen) VALUES (?, ?, ?, ?)", args: [hashToken(token), memberId, now, now] });
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.isProd, maxAge: ONE_YEAR, path: "/" });
}

export async function endSession(token: string | undefined, res: Response) {
  if (token) await db.execute({ sql: "DELETE FROM sessions WHERE token_hash = ?", args: [hashToken(token)] });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Attaches req.member when the session cookie is valid. Never rejects. */
export const loadMember: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) {
    const r = await db.execute({
      sql: `SELECT s.token_hash, s.last_seen, m.id, m.house_id FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token_hash = ?`,
      args: [hashToken(token)],
    });
    const row = r.rows[0];
    if (row) {
      req.member = { id: String(row.id), houseId: String(row.house_id) };
      // Touch at most once an hour to avoid a write per request.
      if (Date.now() - Number(row.last_seen) > 3_600_000) {
        await db.execute({ sql: "UPDATE sessions SET last_seen = ? WHERE token_hash = ?", args: [Date.now(), row.token_hash] });
      }
    }
  }
  next();
};

export const requireMember: RequestHandler = (req, res, next) => {
  if (!req.member) return void res.status(401).json({ error: "Please log in." });
  next();
};
