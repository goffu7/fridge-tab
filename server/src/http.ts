import { randomBytes } from "node:crypto";
import type { ErrorRequestHandler, Request } from "express";
import { z } from "zod";

/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const newId = () => randomBytes(9).toString("base64url");
export const today = () => new Date().toISOString().slice(0, 10);

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input");
  }
  return r.data;
}

/** The signed-in member. Only call after requireMember. */
export function me(req: Request) {
  if (!req.member) throw new HttpError(401, "Please log in.");
  return req.member;
}

export const personName = z.string().trim().min(1, "Enter a name").max(24);
export const satang = z.number().int().min(-10_000_000).max(10_000_000);
export const positiveSatang = z.number().int().min(1, "Amount must be above ฿0").max(10_000_000);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  if (err?.code === "LIMIT_FILE_SIZE") return void res.status(413).json({ error: "That image is too large." });
  if (err?.type === "entity.too.large") return void res.status(413).json({ error: "That request is too large." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server. Try again." });
};
