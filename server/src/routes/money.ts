import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db, toPayment, toRequest } from "../db";
import { HttpError, me, newId, parse, positiveSatang, today } from "../http";

/**
 * Payments are owned by the person who was owed (to_id): only they can record,
 * edit or delete them. Borrowers send requests (with an optional slip photo)
 * that the lender accepts or declines.
 */
export const money = Router();

const slipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1.5 * 1024 * 1024, files: 1 } });
const note = z.string().trim().max(80).default("");

async function assertHousemate(houseId: string, memberId: string) {
  const r = await db.execute({ sql: "SELECT 1 FROM members WHERE id = ? AND house_id = ?", args: [memberId, houseId] });
  if (!r.rows.length) throw new HttpError(400, "That person isn't in this house.");
}

async function myPayment(id: string, memberId: string) {
  const r = await db.execute({ sql: "SELECT * FROM payments WHERE id = ?", args: [id] });
  const p = r.rows[0] && toPayment(r.rows[0]);
  if (!p) throw new HttpError(404, "That payment no longer exists.");
  if (p.toId !== memberId) throw new HttpError(403, "Only the person who was paid can change this payment.");
  return p;
}

/* ---------- payments (lender only) ---------- */

money.post("/payments", async (req, res) => {
  const m = me(req);
  const b = parse(z.object({ fromId: z.string().min(1), amount: positiveSatang, note }), req.body);
  if (b.fromId === m.id) throw new HttpError(400, "You can't record a payment from yourself.");
  await assertHousemate(m.houseId, b.fromId);
  const now = Date.now(), id = newId();
  await db.execute({
    sql: "INSERT INTO payments (id, house_id, from_id, to_id, amount, note, status, request_id, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'accepted', NULL, ?, ?, ?)",
    args: [id, m.houseId, b.fromId, m.id, b.amount, b.note, today(), now, now],
  });
  res.status(201).json({ id });
});

money.patch("/payments/:id", async (req, res) => {
  const m = me(req);
  const p = await myPayment(req.params.id, m.id);
  if (p.status !== "accepted") throw new HttpError(400, "A declined slip can't be edited. Delete it to review the request again.");
  const b = parse(z.object({ amount: positiveSatang, note: note.optional() }), req.body);
  await db.execute({ sql: "UPDATE payments SET amount = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?", args: [b.amount, b.note ?? null, Date.now(), p.id] });
  res.status(204).end();
});

money.delete("/payments/:id", async (req, res) => {
  const m = me(req);
  const p = await myPayment(req.params.id, m.id);
  await db.execute({ sql: "DELETE FROM payments WHERE id = ?", args: [p.id] });
  res.status(204).end();
});

/* ---------- pay-back requests (borrower creates, lender decides) ---------- */

money.post("/requests", slipUpload.single("slip"), async (req, res) => {
  const m = me(req);
  const b = parse(
    z.object({ toId: z.string().min(1), amount: z.coerce.number().pipe(positiveSatang), note }),
    req.body,
  );
  if (b.toId === m.id) throw new HttpError(400, "You can't pay yourself back.");
  await assertHousemate(m.houseId, b.toId);
  const now = Date.now(), id = newId();
  const statements = [];
  let slipId: string | null = null;
  if (req.file) {
    if (!/^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) throw new HttpError(400, "The slip must be a JPG, PNG or WebP image.");
    slipId = newId();
    statements.push({ sql: "INSERT INTO slips (id, house_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)", args: [slipId, m.houseId, req.file.mimetype, req.file.buffer, now] });
  }
  statements.push({
    sql: "INSERT INTO requests (id, house_id, from_id, to_id, amount, note, slip_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [id, m.houseId, m.id, b.toId, b.amount, b.note, slipId, now],
  });
  await db.batch(statements, "write");
  res.status(201).json({ id });
});

async function loadRequest(id: string, houseId: string) {
  const r = await db.execute({ sql: "SELECT * FROM requests WHERE id = ? AND house_id = ?", args: [id, houseId] });
  if (!r.rows[0]) throw new HttpError(404, "That request no longer exists.");
  const request = toRequest(r.rows[0]);
  const d = await db.execute({ sql: "SELECT 1 FROM payments WHERE request_id = ?", args: [id] });
  return { request, decided: d.rows.length > 0 };
}

money.delete("/requests/:id", async (req, res) => {
  const m = me(req);
  const { request, decided } = await loadRequest(req.params.id, m.houseId);
  if (request.fromId !== m.id) throw new HttpError(403, "Only the sender can cancel this request.");
  if (decided) throw new HttpError(409, "This request was already answered.");
  await db.batch(
    [
      { sql: "DELETE FROM requests WHERE id = ?", args: [request.id] },
      { sql: "DELETE FROM slips WHERE id = ?", args: [request.slipId] },
    ],
    "write",
  );
  res.status(204).end();
});

async function decide(reqId: string, memberId: string, houseId: string, status: "accepted" | "declined", amount: number) {
  const { request, decided } = await loadRequest(reqId, houseId);
  if (request.toId !== memberId) throw new HttpError(403, "Only the person being paid can answer this request.");
  if (decided) throw new HttpError(409, "This request was already answered.");
  const now = Date.now();
  await db.execute({
    sql: "INSERT INTO payments (id, house_id, from_id, to_id, amount, note, status, request_id, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [newId(), houseId, request.fromId, request.toId, amount, request.note, status, request.id, today(), now, now],
  });
}

money.post("/requests/:id/accept", async (req, res) => {
  const m = me(req);
  const b = parse(z.object({ amount: positiveSatang }), req.body);
  await decide(req.params.id, m.id, m.houseId, "accepted", b.amount);
  res.status(204).end();
});

money.post("/requests/:id/decline", async (req, res) => {
  const m = me(req);
  await decide(req.params.id, m.id, m.houseId, "declined", 0);
  res.status(204).end();
});

money.get("/slips/:id", async (req, res) => {
  const m = me(req);
  const r = await db.execute({ sql: "SELECT mime, data FROM slips WHERE id = ? AND house_id = ?", args: [req.params.id, m.houseId] });
  const row = r.rows[0];
  if (!row) throw new HttpError(404, "Slip not found.");
  res.set("Content-Type", String(row.mime)).set("Cache-Control", "private, max-age=86400").send(Buffer.from(row.data as ArrayBuffer));
});
