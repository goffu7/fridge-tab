import { Image, Pencil, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { billShares, billTotal } from "@shared/ledger";
import { Empty, PersonChip } from "@/components/ui";
import { api } from "@/lib/api";
import { editBill } from "@/lib/drafts";
import { shortMonth, useT } from "@/lib/i18n";
import { fmt } from "@/lib/money";
import { useAction, useBook } from "@/lib/queries";
import { openSheet } from "@/lib/sheets";

function DateTile({ iso, dashed }: { iso: string; dashed?: boolean }) {
  useT();
  const d = Number(iso.split("-")[2]);
  return (
    <div className={`w-[46px] rounded-ctl border border-line py-1 text-center font-num leading-tight ${dashed ? "border-dashed" : ""}`}>
      <b className="block text-[17px]">{d}</b>
      <span className="text-[10.5px] text-muted uppercase">{shortMonth(iso)}</span>
    </div>
  );
}

export function History() {
  const book = useBook();
  const navigate = useNavigate();
  const action = useAction();
  const [open, setOpen] = useState<string | null>(null);
  const T = useT();
  if (!book) return <p className="card text-center text-muted">{T.loadingHistory}</p>;

  const rows = [
    ...book.bills.map((b) => ({ kind: "bill" as const, date: b.date, at: b.createdAt, b })),
    ...book.payments.map((p) => ({ kind: "pay" as const, date: p.date, at: p.createdAt, p })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);

  if (!rows.length)
    return (
      <>
        <h2>{T.history}</h2>
        <div className="card"><Empty icon={<Receipt />} title={T.nothingYet}><p className="text-muted">{T.historyEmpty}</p></Empty></div>
      </>
    );

  const accepted = book.payments.filter((p) => p.status === "accepted").length;
  return (
    <>
      <div className="sec-title">
        <h2>{T.history}</h2>
        <span className="text-sm text-muted">{T.historyCount(book.bills.length, accepted)}</span>
      </div>
      <ul className="list">
        {rows.map((r) => {
          if (r.kind === "pay") {
            const p = r.p;
            const req = p.requestId ? book.requests.find((x) => x.id === p.requestId) : undefined;
            const declined = p.status === "declined";
            return (
              <li key={p.id}>
                <div className={`list-row ${declined ? "opacity-60" : ""}`}>
                  <DateTile iso={p.date} dashed />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <PersonChip member={book.member(p.fromId)} />
                      <span className="text-[13.5px] text-muted">{declined ? T.slipDeclinedBy : T.paid}</span>
                      <PersonChip member={book.member(p.toId)} />
                    </div>
                    {p.note && <span className="text-xs text-muted">{p.note}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    {req?.slipId && (
                      <button className="btn btn-ghost !px-2" aria-label={T.viewSlip} onClick={() => openSheet({ kind: "slip", slipId: req.slipId! })}><Image /></button>
                    )}
                    <b className="num">{declined ? "—" : fmt(p.amount)}</b>
                  </div>
                </div>
                {p.toId === book.me.id && !declined && (
                  <div className="flex justify-end px-4 pb-3">
                    <button className="btn btn-ghost" onClick={() => openSheet({ kind: "record", fromId: p.fromId, paymentId: p.id })}><Pencil />{T.editAmount}</button>
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
            <li key={b.id}>
              <button className="list-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}>
                <DateTile iso={b.date} />
                <div className="flex min-w-0 flex-col">
                  <b className="truncate">{b.store}</b>
                  <span className="text-sm text-muted">
                    {T.nItemsPaidBy(b.items.length)}<span className="font-semibold" style={{ color: `var(--m${payer.color % 6})` }}>{payer.name}</span>
                  </span>
                </div>
                <span className="num">{fmt(billTotal(b))}</span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-2.5 px-4 pb-4">
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
                  {b.createdBy === book.me.id ? (
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => (editBill(b), navigate("/add"))}><Pencil />{T.edit}</button>
                    <button
                      className="btn btn-danger"
                      onClick={() =>
                        openSheet({
                          kind: "confirm", title: T.deleteBillQ, text: T.deleteBillText, ok: T.deleteBill,
                          onOk: () => action.run(() => api.deleteBill(b.id), T.billDeleted),
                        })
                      }
                    >
                      <Trash2 />{T.delete}
                    </button>
                  </div>
                  ) : (
                    <p className="text-xs text-muted">{T.onlyCreator(book.member(b.createdBy).name)}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
