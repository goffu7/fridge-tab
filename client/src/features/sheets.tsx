import { Camera, Check, ChevronLeft, ChevronRight, Copy, HandCoins, ImageOff, Receipt, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { pairBreakdown } from "@shared/ledger";
import { PersonChip, QuickAmounts, Sheet } from "@/components/ui";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { shortDate, useT, type Dict } from "@/lib/i18n";
import { shrinkImage } from "@/lib/image";
import { bahtText, fmt, parseBaht } from "@/lib/money";
import { useAction, useBook, type Book } from "@/lib/queries";
import { closeSheet, openSheet, useSheet, type SheetState } from "@/lib/sheets";

/** Mounted once in the app shell; renders whichever sheet is open. */
export function Sheets() {
  const sheet = useSheet();
  const book = useBook();
  const T = useT();
  // Keep the last sheet's content on screen while it animates closed.
  const last = useRef<SheetState>(null);
  if (sheet) last.current = sheet;
  const s = sheet ?? last.current;
  if (!book || !s) return null;
  const open = sheet !== null;
  const key = JSON.stringify({ ...s, onOk: undefined });
  switch (s.kind) {
    case "record": return <RecordSheet key={key} open={open} book={book} fromId={s.fromId} paymentId={s.paymentId} />;
    case "payback": return <PaybackSheet key={key} open={open} book={book} toId={s.toId} />;
    case "review": return <ReviewSheet key={key} open={open} book={book} requestId={s.requestId} />;
    case "slip": return (
      <Sheet open={open} onClose={closeSheet} title={T.paymentSlip}>
        <img src={api.slipUrl(s.slipId)} alt={T.paymentSlip} className="max-h-[75dvh] w-full rounded-ctl bg-surface-2 object-contain" />
      </Sheet>
    );
    case "breakdown": return <BreakdownSheet key={key} open={open} book={book} memberId={s.memberId} otherId={s.otherId} />;
    case "confirm": return <ConfirmSheet key={key} open={open} {...s} />;
  }
}

function AmountField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input amount-input" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function leftText(T: Dict, owed: number, paid: number) {
  const left = owed - paid;
  if (left > 0) return T.leftOwed(fmt(left));
  if (left < 0) return T.leftCredit(fmt(-left));
  return T.clearsAll;
}

/** The person owed records money they received (or edits an earlier record). */
function RecordSheet({ open, book, fromId, paymentId }: { open: boolean; book: Book; fromId: string; paymentId?: string }) {
  const editing = paymentId ? book.payments.find((p) => p.id === paymentId) : undefined;
  const debt = book.ledger.debts.find((d) => d.fromId === fromId && d.toId === book.me.id)?.amount ?? 0;
  const owed = debt + (editing?.amount ?? 0);
  const [amount, setAmount] = useState(bahtText(editing?.amount ?? owed));
  const [note, setNote] = useState(editing?.note ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  const action = useAction();
  const T = useT();
  const from = book.member(fromId);
  const sat = parseBaht(amount);

  const save = async () => {
    if (sat <= 0) return toast.error(T.amountAbove0);
    const ok = editing
      ? await action.run(() => api.editPayment(editing.id, { amount: sat, note }), T.paymentUpdated)
      : await action.run(() => api.recordPayment({ fromId, amount: sat, note }), T.recordedFrom(fmt(sat), from.name));
    if (ok) {
      closeSheet();
      if (!editing && sat >= owed) celebrate();
    }
  };
  const del = async () => {
    if (editing && (await action.run(() => api.deletePayment(editing.id), T.paymentDeleted))) closeSheet();
  };

  return (
    <Sheet open={open} onClose={closeSheet} title={editing ? T.editPayment : T.gotPaidBy(from.name)}>
      <p className="text-muted">
        {T.recordIntro(from.name, !!editing, <b className="num text-ink">{fmt(owed)}</b>)}
      </p>
      <AmountField label={T.amountReceived} value={amount} onChange={setAmount} />
      <QuickAmounts full={owed} onPick={(v) => setAmount(bahtText(v))} fmt={fmt} />
      <label className="field">
        <span>{T.noteOptional}</span>
        <input className="input" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.notePhCash} />
      </label>
      <p className="text-sm text-muted">{leftText(T, owed, sat)}</p>
      <button className="btn btn-primary btn-lg" disabled={action.pending} onClick={save}>
        <Check />
        {editing ? T.saveChanges : T.recordPayment}
      </button>
      {editing &&
        (confirmDel ? (
          <div className="note note-err">
            <span className="flex-1">{T.deletePaymentQ}</span>
            <button className="btn btn-danger" onClick={del}>{T.delete}</button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-danger" onClick={() => setConfirmDel(true)}>
            <Trash2 />
            {T.deletePayment}
          </button>
        ))}
    </Sheet>
  );
}

/** The borrower tells the lender they paid, optionally with a slip photo. */
function PaybackSheet({ open, book, toId }: { open: boolean; book: Book; toId: string }) {
  const to = book.member(toId);
  const owed = book.ledger.debts.find((d) => d.fromId === book.me.id && d.toId === toId)?.amount ?? 0;
  const waiting = book.pending.filter((r) => r.fromId === book.me.id && r.toId === toId).reduce((s, r) => s + r.amount, 0);
  const [amount, setAmount] = useState(bahtText(Math.max(0, owed - waiting) || owed));
  const [note, setNote] = useState("");
  const [slip, setSlip] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const action = useAction();
  const T = useT();
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const small = await shrinkImage(f, 1200, 400_000);
      setSlip(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      toast.error(T.photoUnusable);
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    const sat = parseBaht(amount);
    if (sat <= 0) return toast.error(T.amountAbove0);
    if (await action.run(() => api.sendRequest({ toId, amount: sat, note, slip }), T.sentToAccept(to.name))) closeSheet();
  };
  const copyPP = async () => {
    try {
      await navigator.clipboard.writeText(to.promptpay);
      toast.success(T.ppCopied);
    } catch {
      toast.error(T.couldntCopy);
    }
  };

  return (
    <Sheet open={open} onClose={closeSheet} title={T.payBackTitle(to.name)}>
      <p className="text-muted">
        {T.paybackIntro(<b className="num text-ink">{fmt(owed)}</b>, waiting ? fmt(waiting) : null, to.name)}
      </p>
      <AmountField label={T.amountYouPaid} value={amount} onChange={setAmount} />
      <QuickAmounts full={owed} onPick={(v) => setAmount(bahtText(v))} fmt={fmt} />
      {to.promptpay && (
        <div className="note note-info">
          <span className="flex-1">
            {T.promptpayFor(to.name)}<b className="num">{to.promptpay}</b>
          </span>
          <button className="btn" onClick={copyPP}>
            <Copy />
            {T.copy}
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      {preview ? (
        <>
          <img src={preview} alt={T.yourSlip} className="max-h-[40dvh] w-full rounded-ctl bg-surface-2 object-contain" />
          <button className="btn btn-ghost" onClick={() => (setSlip(null), setPreview(null))}>
            <X />
            {T.removePhoto}
          </button>
        </>
      ) : (
        <button className="btn w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Camera />
          {busy ? T.preparingPhoto : T.attachSlip}
        </button>
      )}
      <label className="field">
        <span>{T.noteOptional}</span>
        <input className="input" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder={T.notePhTransfer} />
      </label>
      <button className="btn btn-primary btn-lg" disabled={busy || action.pending} onClick={send}>
        <Send />
        {T.sendTo(to.name)}
      </button>
    </Sheet>
  );
}

/** The lender checks a slip and accepts (amount editable) or declines. */
function ReviewSheet({ open, book, requestId }: { open: boolean; book: Book; requestId: string }) {
  const r = book.requests.find((x) => x.id === requestId);
  const [amount, setAmount] = useState(bahtText(r?.amount ?? 0));
  const action = useAction();
  const T = useT();
  if (!r) return null;
  const from = book.member(r.fromId);
  const debt = book.ledger.debts.find((d) => d.fromId === r.fromId && d.toId === r.toId)?.amount ?? 0;
  const decide = async (accept: boolean) => {
    const sat = parseBaht(amount);
    if (accept && sat <= 0) return toast.error(T.amountAbove0OrDecline);
    const ok = await action.run(
      () => (accept ? api.acceptRequest(r.id, sat) : api.declineRequest(r.id)),
      accept ? T.acceptedFrom(fmt(sat), from.name) : T.declined,
    );
    if (ok) {
      closeSheet();
      if (accept) celebrate();
    }
  };
  return (
    <Sheet open={open} onClose={closeSheet} title={T.paidYou(from.name)}>
      {r.slipId ? (
        <img src={api.slipUrl(r.slipId)} alt={T.paymentSlip} className="max-h-[50dvh] w-full rounded-ctl bg-surface-2 object-contain" />
      ) : (
        <div className="note">
          <ImageOff />
          <span>{T.noSlip}</span>
        </div>
      )}
      <p className="text-muted">
        {T.reviewIntro(<b className="num text-ink">{fmt(debt)}</b>, r.note)}
      </p>
      <AmountField label={T.amountReceived} value={amount} onChange={setAmount} />
      <div className="flex gap-2">
        <button className="btn btn-danger btn-lg flex-1" disabled={action.pending} onClick={() => decide(false)}>
          <X />
          {T.decline}
        </button>
        <button className="btn btn-primary btn-lg flex-1" disabled={action.pending} onClick={() => decide(true)}>
          <Check />
          {T.accept}
        </button>
      </div>
    </Sheet>
  );
}

/** Signed amount from the viewer's side: green when it adds to what they're owed. */
function Signed({ v, className = "" }: { v: number; className?: string }) {
  return <span className={`num ${v > 0 ? "text-owed" : v < 0 ? "text-owe" : ""} ${className}`}>{v > 0 ? "+" : ""}{fmt(v)}</span>;
}

/** Explains a balance: which bills and payments make it up. */
function BreakdownSheet({ open, book, memberId, otherId }: { open: boolean; book: Book; memberId: string; otherId?: string }) {
  const me = book.member(memberId);
  const you = memberId === book.me.id;
  const T = useT();
  const meName = you ? T.you : me.name;

  if (!otherId) {
    const rows = book.members
      .filter((m) => m.id !== memberId)
      .map((m) => ({ m, total: pairBreakdown(book, memberId, m.id).total }))
      .filter((r) => r.total !== 0);
    const net = book.ledger.net[memberId] ?? 0;
    return (
      <Sheet open={open} onClose={closeSheet} title={you ? T.whereYourBalance : T.balanceOf(me.name)}>
        <p className="text-muted">
          {net > 0 ? T.balOwed(you, me.name) : net < 0 ? T.balOwes(you, me.name) : T.balSquare}
          <b className="num text-ink">{fmt(Math.abs(net))}</b>
          {rows.length ? T.balTail : ""}
        </p>
        <div className="card !gap-0">
          {rows.map(({ m, total }) => (
            <button
              key={m.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-line py-3 text-left first:pt-0 last:pb-0 [&+&]:border-t"
              onClick={() => openSheet({ kind: "breakdown", memberId, otherId: m.id })}
            >
              <span className="flex flex-wrap items-center gap-1.5">
                <PersonChip member={m} />
                <span className="text-sm text-muted">{total > 0 ? T.rowOwesThem(you, me.name) : T.rowTheyOwe(you, me.name)}</span>
              </span>
              <Signed v={total} className="font-semibold" />
              <ChevronRight className="size-4 text-muted" />
            </button>
          ))}
          {!rows.length && <p className="text-center text-muted">{T.nothingOwed}</p>}
        </div>
      </Sheet>
    );
  }

  const other = book.member(otherId);
  const { entries, total } = pairBreakdown(book, memberId, otherId);
  const sum = (pick: (amount: number, kind: string) => boolean) => entries.filter((e) => pick(e.amount, e.kind)).reduce((s, e) => s + e.amount, 0);
  const summary = total > 0 ? T.sumOwesMe(other.name, you, me.name) : total < 0 ? T.sumIOwe(you, me.name, other.name) : T.allSquare;

  return (
    <Sheet open={open} onClose={closeSheet} title={`${meName} & ${other.name}`}>
      <button className="btn btn-ghost self-start !px-2" onClick={() => openSheet({ kind: "breakdown", memberId })}>
        <ChevronLeft />
        {T.everyone}
      </button>
      <div className="card !gap-1.5 text-sm">
        <div className="flex justify-between gap-2"><span>{T.ateFromMine(other.name, you, me.name)}</span><Signed v={sum((v, k) => k === "bill" && v > 0)} /></div>
        <div className="flex justify-between gap-2"><span>{T.iAteFrom(meName, other.name)}</span><Signed v={sum((v, k) => k === "bill" && v < 0)} /></div>
        <div className="flex justify-between gap-2"><span>{T.paymentsBetween}</span><Signed v={sum((_v, k) => k === "payment")} /></div>
        <div className="flex justify-between gap-2 border-t border-dashed border-line pt-1.5 text-base font-semibold">
          <span>{summary}</span>
          <span className="num">{fmt(Math.abs(total))}</span>
        </div>
      </div>
      {!entries.length ? (
        <p className="text-center text-muted">{T.noShared}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) =>
            e.kind === "bill" ? (
              <li key={e.bill.id} className="card !gap-1.5 !p-3">
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                  <Receipt className="size-4 text-muted" />
                  <span className="min-w-0 truncate">
                    <b>{e.bill.store}</b> <small className="text-muted">· {shortDate(e.bill.date)} · {T.paidBy(book.member(e.bill.payerId).name)}</small>
                  </span>
                  <Signed v={e.amount} className="font-semibold" />
                </div>
                <ul className="flex flex-col gap-0.5 pl-6 text-sm text-muted">
                  {e.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">{it.name}</span>
                      <span className="num">{fmt(it.share)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ) : (
              <li key={e.payment.id} className="card grid grid-cols-[auto_1fr_auto] items-center !gap-2 !p-3">
                <HandCoins className="size-4 text-muted" />
                <span className="min-w-0 truncate">
                  <b>{T.xPaidY(book.member(e.payment.fromId).name, book.member(e.payment.toId).name)}</b>{" "}
                  <small className="text-muted">· {shortDate(e.payment.date)}{e.payment.note ? ` · ${e.payment.note}` : ""}</small>
                </span>
                <Signed v={e.amount} className="font-semibold" />
              </li>
            ),
          )}
        </ul>
      )}
    </Sheet>
  );
}

function ConfirmSheet({ open, title, text, ok, onOk }: Extract<SheetState, { kind: "confirm" }> & { open: boolean }) {
  const [busy, setBusy] = useState(false);
  const T = useT();
  return (
    <Sheet open={open} onClose={closeSheet} title={title}>
      <p className="text-muted">{text}</p>
      <div className="flex gap-2">
        <button className="btn btn-lg flex-1" onClick={closeSheet}>{T.keep}</button>
        <button
          className="btn btn-danger btn-lg flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onOk();
            setBusy(false);
            closeSheet();
          }}
        >
          {ok}
        </button>
      </div>
    </Sheet>
  );
}

