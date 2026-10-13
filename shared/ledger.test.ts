import { describe, expect, it } from "vitest";
import { computeLedger, pairBreakdown, requestStatus } from "./ledger";
import type { Bill, Member, Payment } from "./types";

const members: Member[] = ["a", "b", "c"].map((id, i) => ({ id, name: id.toUpperCase(), promptpay: "", color: i }));

const bill = (payerId: string, items: [number, string[]][]): Bill => ({
  id: Math.random().toString(36),
  date: "2026-10-10",
  store: "7-Eleven",
  payerId,
  receiptTotal: null,
  createdBy: payerId,
  createdAt: 0,
  updatedAt: 0,
  items: items.map(([price, eaters], i) => ({ id: String(i), name: "x", en: "", price, eaters })),
});

const pay = (fromId: string, toId: string, amount: number, extra: Partial<Payment> = {}): Payment => ({
  id: Math.random().toString(36),
  fromId, toId, amount, note: "", status: "accepted", requestId: null, date: "2026-10-10", createdAt: 0, updatedAt: 0,
  ...extra,
});

describe("computeLedger", () => {
  it("charges each eater their share of the payer's bill", () => {
    const l = computeLedger({ members, bills: [bill("a", [[4500, ["b"]], [6000, ["a", "b", "c"]]])], payments: [] });
    expect(l.debts).toEqual([
      { fromId: "b", toId: "a", amount: 6500 },
      { fromId: "c", toId: "a", amount: 2000 },
    ]);
    expect(l.net).toEqual({ a: 8500, b: -6500, c: -2000 });
  });

  it("nets debts in both directions between two people", () => {
    const l = computeLedger({ members, bills: [bill("a", [[5000, ["b"]]]), bill("b", [[2000, ["a"]]])], payments: [] });
    expect(l.debts).toEqual([{ fromId: "b", toId: "a", amount: 3000 }]);
  });

  it("keeps the remainder after a partial payment", () => {
    const l = computeLedger({ members, bills: [bill("a", [[5000, ["b"]]])], payments: [pay("b", "a", 1000)] });
    expect(l.debts).toEqual([{ fromId: "b", toId: "a", amount: 4000 }]);
  });

  it("ignores declined payments", () => {
    const l = computeLedger({ members, bills: [bill("a", [[5000, ["b"]]])], payments: [pay("b", "a", 5000, { status: "declined" })] });
    expect(l.debts[0].amount).toBe(5000);
  });

  it("never routes debt through a third person", () => {
    // c owes b, b owes a: c must not end up paying a.
    const l = computeLedger({ members, bills: [bill("a", [[1000, ["b"]]]), bill("b", [[1000, ["c"]]])], payments: [] });
    expect(l.debts).toContainEqual({ fromId: "b", toId: "a", amount: 1000 });
    expect(l.debts).toContainEqual({ fromId: "c", toId: "b", amount: 1000 });
    expect(l.debts.find((d) => d.fromId === "c" && d.toId === "a")).toBeUndefined();
  });

  it("applies discounts as negative items", () => {
    const l = computeLedger({ members, bills: [bill("a", [[2000, ["b"]], [-500, ["b"]]])], payments: [] });
    expect(l.debts).toEqual([{ fromId: "b", toId: "a", amount: 1500 }]);
  });
});

describe("requestStatus", () => {
  it("is pending until the lender decides", () => {
    const req = { id: "r1", fromId: "b", toId: "a", amount: 100, note: "", slipId: null, createdAt: 0 };
    expect(requestStatus(req, [])).toBe("pending");
    expect(requestStatus(req, [pay("b", "a", 100, { requestId: "r1" })])).toBe("accepted");
  });
});

describe("pairBreakdown", () => {
  it("lists the bills and payments behind a debt and sums to it", () => {
    const state = {
      members,
      bills: [bill("a", [[4500, ["b"]], [6000, ["a", "b", "c"]], [900, ["c"]]]), bill("b", [[1000, ["a"]]]), bill("c", [[700, ["a"]]])],
      payments: [pay("b", "a", 1500), pay("b", "a", 9999, { status: "declined" })],
    };
    const { entries, total } = pairBreakdown(state, "a", "b");
    expect(entries.map((e) => e.amount).sort((x, y) => x - y)).toEqual([-1500, -1000, 6500]);
    const debt = computeLedger(state).debts.find((d) => d.fromId === "b" && d.toId === "a")!;
    expect(total).toBe(debt.amount);
    expect(pairBreakdown(state, "b", "a").total).toBe(-debt.amount);
  });
});
