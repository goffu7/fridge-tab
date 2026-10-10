import { Image, Pencil, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { billShares, billTotal } from "@shared/ledger";
import { Empty, PersonChip } from "@/components/ui";
import { api } from "@/lib/api";
import { editBill } from "@/lib/drafts";
import { fmt } from "@/lib/money";
import { useAction, useBook } from "@/lib/queries";
import { openSheet } from "@/lib/sheets";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function DateTile({ iso, dashed }: { iso: string; dashed?: boolean }) {
  const [, m, d] = iso.split("-").map(Number);
  return (
    <div className={`w-[46px] rounded-ctl border border-line py-1 text-center font-mono leading-tight ${dashed ? "border-dashed" : ""}`}>
      <b className="block text-[17px]">{d}</b>
      <span className="text-[10.5px] text-muted uppercase">{MONTHS[(m || 1) - 1]}</span>
    </div>
  );
}

export function History() {
  const book = useBook();
  const navigate = useNavigate();
  const action = useAction();
  const [open, setOpen] = useState<string | null>(null);
  if (!book) return <p className="card text-center text-muted">Loading history…</p>;

  const rows = [
    ...book.bills.map((b) => ({ kind: "bill" as const, date: b.date, at: b.createdAt, b })),
    ...book.payments.map((p) => ({ kind: "pay" as const, date: p.date, at: p.createdAt, p })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);

  if (!rows.length)
    return (
      <>
        <h2>History</h2>
        <div className="card"><Empty icon={<Receipt />} title="Nothing here yet"><p className="text-muted">Saved bills and payments show up here, newest first.</p></Empty></div>
      </>
    );

  const accepted = book.payments.filter((p) => p.status === "accepted").length;
  return (
    <>
      <div className="sec-title">
        <h2>History</h2>
        <span className="text-sm text-muted">{book.bills.length} bills · {accepted} payments</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => {
          if (r.kind === "pay") {
            const p = r.p;
            const req = p.requestId ? book.requests.find((x) => x.id === p.requestId) : undefined;
            const declined = p.status === "declined";
            return (
              <li key={p.id} className="card !gap-0 !p-0">
                <div className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-3 ${declined ? "opacity-60" : ""}`}>
                  <DateTile iso={p.date} dashed />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PersonChip member={book.member(p.fromId)} />
                      <span className="text-[13.5px] text-muted">{declined ? "slip declined by" : "paid"}</span>
                      <PersonChip member={book.member(p.toId)} />
                    </div>
                    {p.note && <span className="text-xs text-muted">{p.note}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {req?.slipId && (
                      <button className="btn btn-ghost !px-2" aria-label="View slip" onClick={() => openSheet({ kind: "slip", slipId: req.slipId! })}><Image /></button>
                    )}
                    <b className="num">{declined ? "—" : fmt(p.amount)}</b>
                  </div>
                </div>
                {p.toId === book.me.id && !declined && (
                  <div className="flex justify-end px-3.5 pb-3">
                    <button className="btn btn-ghost" onClick={() => openSheet({ kind: "record", fromId: p.fromId, paymentId: p.id })}><Pencil />Edit amount</button>
                  </div>
                )}
              </li>
            );
          }
          const b = r.b;
          const isOpen = open === b.id;
          const shares = billShares(b);
          const payer = book.member(b.payerId);
          return (
            <li key={b.id} className="card !gap-0 overflow-hidden !p-0">
              <button className="grid min-h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3.5 py-3 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}>
                <DateTile iso={b.date} />
                <div className="flex min-w-0 flex-col">
                  <b className="truncate">{b.store}</b>
                  <span className="text-sm text-muted">
                    {b.items.length} items · paid by <span className="font-semibold" style={{ color: `var(--m${payer.color % 6})` }}>{payer.name}</span>
                  </span>
                </div>
                <span className="num font-semibold">{fmt(billTotal(b))}</span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-2.5 px-3.5 pb-3.5">
                  <div className="flex flex-wrap gap-2">
                    {book.members.filter((m) => shares[m.id]).map((m) => <PersonChip key={m.id} member={m} label={`${m.name} ${fmt(shares[m.id])}`} />)}
                  </div>
                  <ul className="flex flex-col gap-1 border-t border-dashed border-line pt-2.5 text-sm">
                    {b.items.map((it) => (
                      <li key={it.id} className="grid grid-cols-[1fr_auto] gap-2">
                        <span>
                          {it.name} <small className="text-muted">· {it.eaters.map((e) => book.member(e).name).join(", ")}</small>
                        </span>
                        <span className="num">{fmt(it.price)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => (editBill(b), navigate("/add"))}><Pencil />Edit</button>
                    <button
                      className="btn btn-danger"
                      onClick={() =>
                        openSheet({
                          kind: "confirm", title: "Delete this bill?", text: "It's removed for everyone and its amounts come off the tab.", ok: "Delete bill",
                          onOk: () => action.run(() => api.deleteBill(b.id), "Bill deleted"),
                        })
                      }
                    >
                      <Trash2 />Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
