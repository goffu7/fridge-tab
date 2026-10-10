import { Camera, Check, Copy, ImageOff, Send, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { QuickAmounts, Sheet } from "@/components/ui";
import { api } from "@/lib/api";
import { celebrate } from "@/lib/celebrate";
import { shrinkImage } from "@/lib/image";
import { bahtText, fmt, parseBaht } from "@/lib/money";
import { useAction, useBook, type Book } from "@/lib/queries";
import { closeSheet, useSheet, type SheetState } from "@/lib/sheets";

/** Mounted once in the app shell; renders whichever sheet is open. */
export function Sheets() {
  const sheet = useSheet();
  const book = useBook();
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
      <Sheet open={open} onClose={closeSheet} title="Payment slip">
        <img src={api.slipUrl(s.slipId)} alt="Payment slip" className="max-h-[75dvh] w-full rounded-ctl bg-surface-2 object-contain" />
      </Sheet>
    );
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

function leftText(owed: number, paid: number) {
  const left = owed - paid;
  if (left > 0) return `${fmt(left)} will still be owed.`;
  if (left < 0) return `That's ${fmt(-left)} more than owed. The extra becomes a credit.`;
  return "This clears it completely.";
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
  const from = book.member(fromId);
  const sat = parseBaht(amount);

  const save = async () => {
    if (sat <= 0) return toast.error("Enter an amount above ฿0.");
    const ok = editing
      ? await action.run(() => api.editPayment(editing.id, { amount: sat, note }), "Payment updated")
      : await action.run(() => api.recordPayment({ fromId, amount: sat, note }), `Recorded ${fmt(sat)} from ${from.name}`);
    if (ok) {
      closeSheet();
      if (!editing && sat >= owed) celebrate();
    }
  };
  const del = async () => {
    if (editing && (await action.run(() => api.deletePayment(editing.id), "Payment deleted"))) closeSheet();
  };

  return (
    <Sheet open={open} onClose={closeSheet} title={editing ? "Edit payment" : `Got paid by ${from.name}`}>
      <p className="text-muted">
        {from.name} {editing ? "owed" : "owes"} you <b className="num text-ink">{fmt(owed)}</b>. Enter what you actually received; the rest stays on the tab.
      </p>
      <AmountField label="Amount received (฿)" value={amount} onChange={setAmount} />
      <QuickAmounts full={owed} onPick={(v) => setAmount(bahtText(v))} fmt={fmt} />
      <label className="field">
        <span>Note (optional)</span>
        <input className="input" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cash, transfer…" />
      </label>
      <p className="text-sm text-muted">{leftText(owed, sat)}</p>
      <button className="btn btn-primary btn-lg" disabled={action.pending} onClick={save}>
        <Check />
        {editing ? "Save changes" : "Record payment"}
      </button>
      {editing &&
        (confirmDel ? (
          <div className="note note-err">
            <span className="flex-1">Delete this payment? The full amount goes back on the tab.</span>
            <button className="btn btn-danger" onClick={del}>Delete</button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-danger" onClick={() => setConfirmDel(true)}>
            <Trash2 />
            Delete payment
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
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const small = await shrinkImage(f, 1200, 400_000);
      setSlip(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      toast.error("That photo couldn't be used. Try a screenshot of the slip.");
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    const sat = parseBaht(amount);
    if (sat <= 0) return toast.error("Enter an amount above ฿0.");
    if (await action.run(() => api.sendRequest({ toId, amount: sat, note, slip }), `Sent to ${to.name} to accept`)) closeSheet();
  };
  const copyPP = async () => {
    try {
      await navigator.clipboard.writeText(to.promptpay);
      toast.success("PromptPay number copied");
    } catch {
      toast.error("Couldn't copy. Select the number instead.");
    }
  };

  return (
    <Sheet open={open} onClose={closeSheet} title={`Pay back ${to.name}`}>
      <p className="text-muted">
        You owe <b className="num text-ink">{fmt(owed)}</b>
        {waiting ? <> ({fmt(waiting)} already sent, waiting)</> : null}. Send what you paid and {to.name} accepts it.
      </p>
      <AmountField label="Amount you paid (฿)" value={amount} onChange={setAmount} />
      <QuickAmounts full={owed} onPick={(v) => setAmount(bahtText(v))} fmt={fmt} />
      {to.promptpay && (
        <div className="note note-info">
          <span className="flex-1">
            PromptPay for {to.name}: <b className="num">{to.promptpay}</b>
          </span>
          <button className="btn" onClick={copyPP}>
            <Copy />
            Copy
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      {preview ? (
        <>
          <img src={preview} alt="Your slip" className="max-h-[40dvh] w-full rounded-ctl bg-surface-2 object-contain" />
          <button className="btn btn-ghost" onClick={() => (setSlip(null), setPreview(null))}>
            <X />
            Remove photo
          </button>
        </>
      ) : (
        <button className="btn w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Camera />
          {busy ? "Preparing photo…" : "Attach slip photo"}
        </button>
      )}
      <label className="field">
        <span>Note (optional)</span>
        <input className="input" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid by transfer" />
      </label>
      <button className="btn btn-primary btn-lg" disabled={busy || action.pending} onClick={send}>
        <Send />
        Send to {to.name}
      </button>
    </Sheet>
  );
}

/** The lender checks a slip and accepts (amount editable) or declines. */
function ReviewSheet({ open, book, requestId }: { open: boolean; book: Book; requestId: string }) {
  const r = book.requests.find((x) => x.id === requestId);
  const [amount, setAmount] = useState(bahtText(r?.amount ?? 0));
  const action = useAction();
  if (!r) return null;
  const from = book.member(r.fromId);
  const debt = book.ledger.debts.find((d) => d.fromId === r.fromId && d.toId === r.toId)?.amount ?? 0;
  const decide = async (accept: boolean) => {
    const sat = parseBaht(amount);
    if (accept && sat <= 0) return toast.error("Enter an amount above ฿0, or decline.");
    const ok = await action.run(
      () => (accept ? api.acceptRequest(r.id, sat) : api.declineRequest(r.id)),
      accept ? `Accepted ${fmt(sat)} from ${from.name}` : "Declined",
    );
    if (ok) {
      closeSheet();
      if (accept) celebrate();
    }
  };
  return (
    <Sheet open={open} onClose={closeSheet} title={`${from.name} paid you`}>
      {r.slipId ? (
        <img src={api.slipUrl(r.slipId)} alt="Payment slip" className="max-h-[50dvh] w-full rounded-ctl bg-surface-2 object-contain" />
      ) : (
        <div className="note">
          <ImageOff />
          <span>No slip attached.</span>
        </div>
      )}
      <p className="text-muted">
        They owe you <b className="num text-ink">{fmt(debt)}</b> in total.{r.note ? ` Note: “${r.note}”.` : ""} Change the amount if it doesn't match the slip.
      </p>
      <AmountField label="Amount received (฿)" value={amount} onChange={setAmount} />
      <div className="flex gap-2">
        <button className="btn btn-danger btn-lg flex-1" disabled={action.pending} onClick={() => decide(false)}>
          <X />
          Decline
        </button>
        <button className="btn btn-primary btn-lg flex-1" disabled={action.pending} onClick={() => decide(true)}>
          <Check />
          Accept
        </button>
      </div>
    </Sheet>
  );
}

function ConfirmSheet({ open, title, text, ok, onOk }: Extract<SheetState, { kind: "confirm" }> & { open: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={closeSheet} title={title}>
      <p className="text-muted">{text}</p>
      <div className="flex gap-2">
        <button className="btn btn-lg flex-1" onClick={closeSheet}>Keep</button>
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

