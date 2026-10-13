import { Clock, Copy, HandCoins, ListTree, PartyPopper, ScanLine, Send, ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { billTotal } from "@shared/ledger";
import type { Debt } from "@shared/ledger";
import { pickReceipts } from "@/components/AppShell";
import { Empty, PersonChip } from "@/components/ui";
import { RequestCard } from "@/features/RequestCard";
import { fmt } from "@/lib/money";
import { useBook, useMe, type Book } from "@/lib/queries";
import { openSheet } from "@/lib/sheets";

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

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
  let m = `Hi ${from.name}! Food tab: you owe ${to.name} ${fmt(d.amount)}`;
  if (count && oldest) m += ` (${count} item${count > 1 ? "s" : ""} since ${shortDate(oldest)})`;
  m += ".";
  if (to.promptpay) m += `\nPromptPay: ${to.promptpay}`;
  m += `\nSend it with a slip in Fridge Tab when your salary is in: ${location.origin}`;
  return m;
}

export function Home() {
  const book = useBook();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [shown, setShown] = useState<string | null>(null);
  if (!book) return <p className="card text-center text-muted">Opening the tab…</p>;

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
      toast.success("Reminder copied. Paste it in LINE.");
    } catch {
      toast("Select the message below to copy it.");
    }
  };

  return (
    <>
      <section className="card hero" aria-label="Your balance">
        <span className="hero-label">{v > 0 ? "Roommates owe you" : v < 0 ? "You owe" : "You're all square"}</span>
        <div className="hero-big">{fmt(Math.abs(v))}</div>
        <span className="hero-label !text-[13px]">
          {book.bills.length} bill{book.bills.length === 1 ? "" : "s"} tracked
          {mySent ? ` · ${fmt(mySent)} sent, waiting for approval` : ""}
        </span>
        {book.bills.length > 0 && (
          <button className="btn relative mt-2 self-center" onClick={() => openSheet({ kind: "breakdown", memberId: myId })}>
            <ListTree />
            Where it comes from
          </button>
        )}
      </section>

      {incoming.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="sec-title">
            <h2>Payments to check</h2>
            <span className="pill pill-wait"><Clock />{incoming.length} waiting</span>
          </div>
          <div className="card">{incoming.map((r) => <RequestCard key={r.id} r={r} book={book} />)}</div>
        </section>
      )}

      <section className="flex flex-col gap-2.5">
        <div className="sec-title"><h2>Who owes whom</h2></div>
        <div className="card">
          {!book.bills.length ? (
            <Empty icon={<ShoppingBasket />} title="No bills yet">
              <p className="text-muted">Scan your 7-Eleven receipts and tick who ate what.</p>
              <button className="btn btn-primary mt-2" onClick={scan}><ScanLine />Scan receipts</button>
            </Empty>
          ) : !book.ledger.debts.length ? (
            <Empty icon={<PartyPopper />} title="Everyone is square"><p className="text-muted">Nobody owes anything right now.</p></Empty>
          ) : (
            book.ledger.debts.map((d) => {
              const key = `${d.fromId}>${d.toId}`;
              const pend = book.pending.filter((r) => r.fromId === d.fromId && r.toId === d.toId).reduce((s, r) => s + r.amount, 0);
              return (
                <div key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-2 border-dashed border-line py-3.5 first:pt-0 [&+&]:border-t">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PersonChip member={book.member(d.fromId)} />
                      <span className="text-[13.5px] text-muted">owes</span>
                      <PersonChip member={book.member(d.toId)} />
                    </div>
                    {pend > 0 && <span className="pill pill-wait self-start"><Clock />{fmt(pend)} waiting for {book.member(d.toId).name}</span>}
                  </div>
                  <button
                    className="num text-xl font-semibold underline decoration-dotted underline-offset-4"
                    aria-label={`See where ${fmt(d.amount)} comes from`}
                    onClick={() => openSheet({ kind: "breakdown", memberId: d.toId, otherId: d.fromId })}
                  >
                    {fmt(d.amount)}
                  </button>
                  {d.toId === myId && (
                    <div className="col-span-2 flex gap-2">
                      <button className="btn btn-primary flex-1" onClick={() => openSheet({ kind: "record", fromId: d.fromId })}><HandCoins />Got paid</button>
                      <button className="btn flex-1" onClick={() => remind(d)}><Copy />Remind</button>
                    </div>
                  )}
                  {d.fromId === myId && (
                    <div className="col-span-2 flex">
                      <button className="btn btn-primary flex-1" onClick={() => openSheet({ kind: "payback", toId: d.toId })}><Send />Pay back</button>
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
          <div className="sec-title"><h2>Everyone</h2></div>
          <div className="card !gap-0">
            {book.members.map((m) => {
              const n = book.ledger.net[m.id] ?? 0;
              return (
                <div key={m.id} className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 border-line py-2.5 first:pt-0 last:pb-0 [&+&]:border-t">
                  <div><PersonChip member={m} onClick={() => openSheet({ kind: "breakdown", memberId: m.id })} /></div>
                  <div className={`num text-right font-semibold ${n > 0 ? "text-owed" : n < 0 ? "text-owe" : ""}`}>{n > 0 ? "+" : ""}{fmt(n)}</div>
                  <div className="text-sm text-muted">Bought {fmt(book.ledger.paid[m.id] ?? 0)} · ate {fmt(book.ledger.ate[m.id] ?? 0)}</div>
                  <div className="text-right text-sm text-muted">{n > 0 ? "is owed" : n < 0 ? "owes" : "square"}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <p className="text-center text-xs text-muted">Total food tracked: {fmt(book.bills.reduce((s, b) => s + billTotal(b), 0))}</p>
    </>
  );
}
