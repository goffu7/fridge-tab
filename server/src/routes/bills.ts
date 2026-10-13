import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { HttpError, me, newId, parse, satang } from "../http";

export const bills = Router();

const billInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-10"),
  store: z.string().trim().max(40).default(""),
  payerId: z.string().min(1),
  receiptTotal: satang.nullable().default(null),
  items: z
    .array(
      z.object({
        name: z.string().trim().max(80),
        en: z.string().trim().max(60).default(""),
        price: satang,
        eaters: z.array(z.string().min(1)).min(1, "Tick who ate every item").max(10),
      }),
    )
    .min(1, "Add at least one item")
    .max(150),
});

async function memberIds(houseId: string) {
  const r = await db.execute({ sql: "SELECT id FROM members WHERE house_id = ?", args: [houseId] });
  return new Set(r.rows.map((x) => String(x.id)));
}

/** Only the person who saved a bill can change or delete it. */
async function myBill(id: string, m: { id: string; houseId: string }) {
  const r = await db.execute({ sql: "SELECT created_by FROM bills WHERE id = ? AND house_id = ?", args: [id, m.houseId] });
  if (!r.rows.length) throw new HttpError(404, "That bill no longer exists.");
  if (String(r.rows[0].created_by) !== m.id) throw new HttpError(403, "Only the person who added this bill can change it.");
}

async function checkPeople(houseId: string, payerId: string, items: { eaters: string[] }[]) {
  const ids = await memberIds(houseId);
  if (!ids.has(payerId)) throw new HttpError(400, "The person who paid isn't in this house.");
  if (items.some((it) => it.eaters.some((e) => !ids.has(e)))) throw new HttpError(400, "An item is ticked for someone who isn't in this house.");
}

function itemStatements(billId: string, items: z.infer<typeof billInput>["items"]) {
  return items.map((it, i) => ({
    sql: "INSERT INTO bill_items (id, bill_id, position, name, en, price, eaters) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [newId(), billId, i, it.name || it.en || "Item", it.en, it.price, JSON.stringify([...new Set(it.eaters)])],
  }));
}

bills.post("/", async (req, res) => {
  const m = me(req);
  const b = parse(billInput, req.body);
  await checkPeople(m.houseId, b.payerId, b.items);
  const id = newId(), now = Date.now();
  await db.batch(
    [
      {
        sql: "INSERT INTO bills (id, house_id, date, store, payer_id, receipt_total, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [id, m.houseId, b.date, b.store || "Shop", b.payerId, b.receiptTotal, m.id, now, now],
      },
      ...itemStatements(id, b.items),
    ],
    "write",
  );
  res.status(201).json({ id });
});

bills.put("/:id", async (req, res) => {
  const m = me(req);
  const b = parse(billInput, req.body);
  await myBill(req.params.id, m);
  await checkPeople(m.houseId, b.payerId, b.items);
  await db.batch(
    [
      { sql: "UPDATE bills SET date = ?, store = ?, payer_id = ?, receipt_total = ?, updated_at = ? WHERE id = ?", args: [b.date, b.store || "Shop", b.payerId, b.receiptTotal, Date.now(), req.params.id] },
      { sql: "DELETE FROM bill_items WHERE bill_id = ?", args: [req.params.id] },
      ...itemStatements(req.params.id, b.items),
    ],
    "write",
  );
  res.status(204).end();
});

bills.delete("/:id", async (req, res) => {
  const m = me(req);
  await myBill(req.params.id, m);
  await db.batch(
    [
      { sql: "DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE id = ? AND house_id = ?)", args: [req.params.id, m.houseId] },
      { sql: "DELETE FROM bills WHERE id = ? AND house_id = ?", args: [req.params.id, m.houseId] },
    ],
    "write",
  );
  res.status(204).end();
});
