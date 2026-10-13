import type { Bill, BillItem, HouseState, Id, Payment, PayRequest } from "./types";

/** One person owing another, after netting both directions. Amount in satang. */
export interface Debt {
  fromId: Id;
  toId: Id;
  amount: number;
}

export interface Ledger {
  debts: Debt[];
  /** Positive = is owed money, negative = owes money. */
  net: Record<Id, number>;
  /** Total of bills each person paid for. */
  paid: Record<Id, number>;
  /** Total each person ate across all bills. */
  ate: Record<Id, number>;
}

export type RequestStatus = "pending" | "accepted" | "declined";

export function itemShares(item: Pick<BillItem, "price" | "eaters">, memberIds?: Set<Id>): Record<Id, number> {
  const ids = memberIds ? item.eaters.filter((e) => memberIds.has(e)) : item.eaters;
  if (!ids.length) return {};
  const each = item.price / ids.length;
  return Object.fromEntries(ids.map((id) => [id, each]));
}

export function billShares(bill: Pick<Bill, "items">, memberIds?: Set<Id>): Record<Id, number> {
  const out: Record<Id, number> = {};
  for (const it of bill.items) {
    for (const [id, v] of Object.entries(itemShares(it, memberIds))) out[id] = (out[id] ?? 0) + v;
  }
  return out;
}

export const billTotal = (bill: Pick<Bill, "items">) => bill.items.reduce((s, it) => s + it.price, 0);

export function requestStatus(req: PayRequest, payments: Payment[]): RequestStatus {
  const decision = payments.find((p) => p.requestId === req.id);
  return decision ? decision.status : "pending";
}

/**
 * Pairwise balances: for each pair, what A ate on B's bills minus what B ate on A's bills,
 * minus accepted payments. Debts are never re-routed through a third person, so
 * "B owes A" always means B actually ate A's food.
 */
export function computeLedger(state: Pick<HouseState, "members" | "bills" | "payments">): Ledger {
  const ids = state.members.map((m) => m.id);
  const known = new Set(ids);
  const owe = new Map<string, number>();
  const key = (a: Id, b: Id) => `${a}>${b}`;
  const add = (a: Id, b: Id, v: number) => owe.set(key(a, b), (owe.get(key(a, b)) ?? 0) + v);

  const paid: Record<Id, number> = {};
  const ate: Record<Id, number> = {};
  const net: Record<Id, number> = {};
  for (const id of ids) paid[id] = ate[id] = net[id] = 0;

  for (const bill of state.bills) {
    if (!known.has(bill.payerId)) continue;
    paid[bill.payerId] += billTotal(bill);
    for (const [eater, amount] of Object.entries(billShares(bill, known))) {
      ate[eater] += amount;
      if (eater !== bill.payerId) add(eater, bill.payerId, amount);
    }
  }
  for (const p of state.payments) {
    if (p.status === "accepted" && known.has(p.fromId) && known.has(p.toId)) add(p.fromId, p.toId, -p.amount);
  }

  const debts: Debt[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const d = Math.round((owe.get(key(a, b)) ?? 0) - (owe.get(key(b, a)) ?? 0));
      if (d > 0) debts.push({ fromId: a, toId: b, amount: d });
      else if (d < 0) debts.push({ fromId: b, toId: a, amount: -d });
    }
  }
  for (const d of debts) {
    net[d.toId] += d.amount;
    net[d.fromId] -= d.amount;
  }
  debts.sort((x, y) => y.amount - x.amount);
  return { debts, net, paid, ate };
}

/** One line in a pair breakdown. Amount is signed from `me`'s side: positive = `other` owes `me` more. */
export type BreakdownEntry =
  | { kind: "bill"; bill: Bill; items: { name: string; share: number }[]; amount: number }
  | { kind: "payment"; payment: Payment; amount: number };

/**
 * Where the balance between two people comes from: every bill where one ate the other's
 * food, and every accepted payment between them, newest first. Sums to the ledger's debt.
 */
export function pairBreakdown(state: Pick<HouseState, "members" | "bills" | "payments">, me: Id, other: Id): { entries: BreakdownEntry[]; total: number } {
  const known = new Set(state.members.map((m) => m.id));
  const entries: BreakdownEntry[] = [];
  for (const bill of state.bills) {
    const eater = bill.payerId === me ? other : bill.payerId === other ? me : null;
    if (!eater) continue;
    const sign = eater === other ? 1 : -1;
    const items = bill.items.filter((it) => it.eaters.includes(eater)).map((it) => ({ name: it.name, share: itemShares(it, known)[eater] }));
    if (!items.length) continue;
    entries.push({ kind: "bill", bill, items, amount: sign * items.reduce((s, it) => s + it.share, 0) });
  }
  for (const p of state.payments) {
    if (p.status !== "accepted") continue;
    if (p.fromId === other && p.toId === me) entries.push({ kind: "payment", payment: p, amount: -p.amount });
    else if (p.fromId === me && p.toId === other) entries.push({ kind: "payment", payment: p, amount: p.amount });
  }
  const at = (e: BreakdownEntry) => (e.kind === "bill" ? [e.bill.date, e.bill.createdAt] : [e.payment.date, e.payment.createdAt]) as [string, number];
  entries.sort((x, y) => at(y)[0].localeCompare(at(x)[0]) || at(y)[1] - at(x)[1]);
  return { entries, total: Math.round(entries.reduce((s, e) => s + e.amount, 0)) };
}
