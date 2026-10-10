import { Router } from "express";
import { db, toBill, toHouse, toItem, toMember, toPayment, toRequest } from "../db";
import { me } from "../http";
import type { BillItem, HouseState } from "../../../shared/types";

export const state = Router();

/** Everything the app shows, in one request. Small enough for a house of a few people. */
state.get("/", async (req, res) => {
  const m = me(req);
  const [house, members, bills, items, payments, requests] = await Promise.all([
    db.execute({ sql: "SELECT * FROM houses WHERE id = ?", args: [m.houseId] }),
    db.execute({ sql: "SELECT * FROM members WHERE house_id = ? ORDER BY created_at", args: [m.houseId] }),
    db.execute({ sql: "SELECT * FROM bills WHERE house_id = ? ORDER BY date DESC, created_at DESC", args: [m.houseId] }),
    db.execute({ sql: "SELECT i.* FROM bill_items i JOIN bills b ON b.id = i.bill_id WHERE b.house_id = ? ORDER BY i.position", args: [m.houseId] }),
    db.execute({ sql: "SELECT * FROM payments WHERE house_id = ? ORDER BY created_at DESC", args: [m.houseId] }),
    db.execute({ sql: "SELECT * FROM requests WHERE house_id = ? ORDER BY created_at DESC", args: [m.houseId] }),
  ]);
  const byBill = new Map<string, BillItem[]>();
  for (const row of items.rows) {
    const list = byBill.get(String(row.bill_id)) ?? [];
    list.push(toItem(row));
    byBill.set(String(row.bill_id), list);
  }
  const memberList = members.rows.map(toMember);
  const out: HouseState = {
    house: toHouse(house.rows[0]),
    me: memberList.find((x) => x.id === m.id)!,
    members: memberList,
    bills: bills.rows.map((b) => toBill(b, byBill.get(String(b.id)) ?? [])),
    payments: payments.rows.map(toPayment),
    requests: requests.rows.map(toRequest),
  };
  res.set("Cache-Control", "no-store").json(out);
});
