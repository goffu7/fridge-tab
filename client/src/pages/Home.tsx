import { Clock, Copy, HandCoins, ListTree, PartyPopper, ScanLine, Send, ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { billTotal } from "@shared/ledger";
import type { Debt } from "@shared/ledger";
import { pickReceipts } from "@/components/AppShell";
import { Empty, PersonChip } from "@/components/ui";
import { RequestCard } from "@/features/RequestCard";
import { shortDate, t, useT } from "@/lib/i18n";
import { fmt } from "@/lib/money";
import { useBook, useMe, type Book } from "@/lib/queries";
import { openSheet } from "@/lib/sheets";

function reminderText(book: Book, d: Debt) {
  const lastPay = Math.max(0, ...book.payments.filter((p) => p.status === "accepted" && p.fromId === d.fromId && p.toId === d.toId).map((p) => p.createdAt));
  let count = 0;
  let oldest: string | null = null;
  for (const b of book.bills) {
    if (b.payerId !== d.toId || b.createdAt <= lastPay) continue;
    for (const it of b.items) if (it.eaters.includes(d.fromId)) {
      count++;
      if (!oldest || b.date < oldest) oldest = b.date;
    }
  }
  const from = book.member(d.fromId), to = book.member(d.toId);
  return t().reminder({
    from: from.name, to: to.name, amount: fmt(d.amount), count, since: oldest && shortDate(oldest), promptpay: to.promptpay, url: location.origin,
  });
}

export function Home() {
  const book = useBook();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [shown, setShown] = useState<string | null>(null);
  const T = useT();
  if (!book) return <p className="card text-center text-muted">{T.openingTab}</p>;

  const myId = book.me.id;
  const v = book.ledger.net[myId] ?? 0;
  const mySent = book.pending.filter((r) => r.fromId === myId).reduce((s, r) => s + r.amount, 0);
  const incoming = book.pending.filter((r) => r.toId === myId);
  const scan = () => (me?.scanEnabled ? pickReceipts() : navigate("/add"));

  const remind = async (d: Debt) => {
    const text = reminderText(book, d);
    setShown(`${d.fromId}>${d.toId}:${text}`);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* cancelled: fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(T.reminderCopied);
    } catch {
      toast(T.selectToCopy);
    }
  };

  return (
    <>
      <section className="card hero" aria-label={T.yourBalance}>
        <span className="hero-label">{v > 0 ? T.roommatesOweYou : v < 0 ? T.youOwe : T.youreSquare}</span>
        <div className="hero-big">{fmt(Math.abs(v))}</div>
        <span className="hero-label !text-[13px]">
          {T.billsTracked(book.bills.length)}
          {mySent ? T.sentWaitingApproval(fmt(mySent)) : ""}
        </span>
        {book.bills.length > 0 && (
          <button className="btn relative mt-2 self-center" onClick={() => openSheet({ kind: "breakdown", memberId: myId })}>
            <ListTree />
            {T.whereFrom}
          </button>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="sec-title">
            <h2>{T.paymentsToCheck}</h2>
            <span className="pill pill-wait"><Clock />{T.nWaiting(incoming.length)}</span>
          </div>
          <div className="card">{incoming.map((r) => <RequestCard key={r.id} r={r} book={book} />)}</div>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>{T.whoOwesWhom}</h2></div>
        <div className="card">
          {!book.bills.length ? (
            <Empty icon={<ShoppingBasket />} title={T.noBills}>
              <p className="text-muted">{T.noBillsText}</p>
              <button className="btn btn-primary mt-2" onClick={scan}><ScanLine />{T.scanReceipts}</button>
            </Empty>
          ) : !book.ledger.debts.length ? (
            <Empty icon={<PartyPopper />} title={T.everyoneSquare}><p className="text-muted">{T.nobodyOwes}</p></Empty>
          ) : (
            book.ledger.debts.map((d) => {
              const key = `${d.fromId}>${d.toId}`;
              const pend = book.pending.filter((r) => r.fromId === d.fromId && r.toId === d.toId).reduce((s, r) => s + r.amount, 0);
              return (
                <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-2 border-dashed border-line py-3.5 first:pt-0 [&+&]:border-t">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PersonChip member={book.member(d.fromId)} />
                      <span className="text-[13.5px] text-muted">{T.owes}</span>
                      <PersonChip member={book.member(d.toId)} />
                    </div>
                    {pend > 0 && <span className="pill pill-wait self-start"><Clock />{T.waitingFor(fmt(pend), book.member(d.toId).name)}</span>}
                  </div>
                  <button
                    className="num text-xl font-semibold underline decoration-dotted underline-offset-4"
                    aria-label={T.seeWhere(fmt(d.amount))}
                    onClick={() => openSheet({ kind: "breakdown", memberId: d.toId, otherId: d.fromId })}
                  >
                    {fmt(d.amount)}
                  </button>
                  {d.toId === myId && (
                    <div className="col-span-2 flex gap-2">
                      <button className="btn btn-primary flex-1" onClick={() => openSheet({ kind: "record", fromId: d.fromId })}><HandCoins />{T.gotPaid}</button>
                      <button className="btn flex-1" onClick={() => remind(d)}><Copy />{T.remind}</button>
                    </div>
                  )}
                  {d.fromId === myId && (
                    <div className="col-span-2 flex">
                      <button className="btn btn-primary flex-1" onClick={() => openSheet({ kind: "payback", toId: d.toId })}><Send />{T.payBack}</button>
                    </div>
                  )}
                  {shown?.startsWith(`${key}:`) && (
                    <p className="col-span-2 rounded-ctl bg-surface-2 px-3 py-2.5 text-sm whitespace-pre-wrap select-all">{shown.slice(key.length + 1)}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {book.bills.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="sec-title"><h2>{T.everyone}</h2></div>
          <div className="card !gap-0">
            {book.members.map((m) => {
              const n = book.ledger.net[m.id] ?? 0;
              return (
                <div key={m.id} className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 border-line py-2.5 first:pt-0 last:pb-0 [&+&]:border-t">
                  <div><PersonChip member={m} onClick={() => openSheet({ kind: "breakdown", memberId: m.id })} /></div>
                  <div className={`num text-right font-semibold ${n > 0 ? "text-owed" : n < 0 ? "text-owe" : ""}`}>{n > 0 ? "+" : ""}{fmt(n)}</div>
                  <div className="text-sm text-muted">{T.boughtAte(fmt(book.ledger.paid[m.id] ?? 0), fmt(book.ledger.ate[m.id] ?? 0))}</div>
                  <div className="text-right text-sm text-muted">{n > 0 ? T.isOwed : n < 0 ? T.owes : T.square}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <p className="text-center text-xs text-muted">{T.totalTracked(fmt(book.bills.reduce((s, b) => s + billTotal(b), 0)))}</p>
    </>
  );
}
