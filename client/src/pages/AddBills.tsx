import { Camera, Check, CheckCheck, Hand, Images, Pencil, Plus, RotateCw, ScanLine, Trash2, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { itemShares } from "@shared/ledger";
import type { Member } from "@shared/types";
import { pickReceipts, takeReceiptPhoto } from "@/components/AppShell";
import { PersonChip } from "@/components/ui";
import { api } from "@/lib/api";
import {
  addBlank, canRescan, draftState, draftTotal, isReady, newItem, previewOf, realItems, remove, rescan, select, stopScan, toBillInput, update, useDrafts,
  type Draft, type DraftItem,
} from "@/lib/drafts";
import { t, useT } from "@/lib/i18n";
import { fmt, parseBaht } from "@/lib/money";
import { useAction, useBook, useMe } from "@/lib/queries";
import { openSheet } from "@/lib/sheets";

const TONE = { ok: "text-owed", wait: "text-warn", bad: "text-owe", "": "text-muted" } as const;

export function AddBills() {
  const book = useBook();
  const { data: me } = useMe();
  const { drafts, cur } = useDrafts();
  const action = useAction();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const T = useT();
  if (!book) return <p className="card text-center text-muted">{T.loading}</p>;
  const scanEnabled = me?.scanEnabled ?? false;
  const d = drafts.find((x) => x.id === cur) ?? drafts[0];

  if (!drafts.length) {
    return (
      <section className="flex flex-col gap-3">
        <h2>{T.addBills}</h2>
        {scanEnabled ? (
          <div className="flex w-full flex-col items-center gap-2.5 rounded-card border-2 border-dashed border-accent bg-accent/5 px-4 py-7 text-center">
            <ScanLine className="size-9 text-accent-strong" />
            <span className="display text-2xl">{T.scanReceipts}</span>
            <span className="text-muted">{T.scanIntro}</span>
            <div className="mt-1 flex w-full flex-wrap justify-center gap-2">
              <button className="btn btn-primary" onClick={takeReceiptPhoto}><Camera />{T.takePhoto}</button>
              <button className="btn" onClick={pickReceipts}><Images />{T.choosePhotos}</button>
            </div>
          </div>
        ) : (
          <p className="note note-info">{T.scanOff}</p>
        )}
        <button className="btn w-full" onClick={() => addBlank(book.me.id)}><Pencil />{T.typeInstead}</button>
      </section>
    );
  }

  const saveOne = async (x: Draft) => {
    const items = realItems(x);
    if (!items.length) return toast.error(t().addOneItem), false;
    const missing = items.filter((i) => !i.eaters.length).length;
    if (missing) return toast.error(t().tickMore(missing)), false;
    const input = toBillInput(x);
    const ok = await action.run(() => (x.billId ? api.updateBill(x.billId, input) : api.createBill(input)));
    if (ok) remove(x.id);
    return ok;
  };
  const onSaveOne = async () => {
    if (!d) return;
    setSaving(true);
    const editing = !!d.billId;
    if (await saveOne(d)) {
      const left = drafts.length - 1;
      toast.success(editing ? T.changesSaved : left ? T.billSavedLeft(left) : T.billSaved);
      if (!left) navigate("/");
    }
    setSaving(false);
  };
  const ready = drafts.filter(isReady);
  const onSaveAll = async () => {
    setSaving(true);
    let saved = 0;
    for (const x of ready) {
      if (await saveOne(x)) saved++;
      else break;
    }
    setSaving(false);
    const left = drafts.length - saved;
    toast.success(left ? T.savedSomeLeft(saved, left) : T.savedN(saved));
    if (!left) navigate("/");
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2>{drafts.length > 1 ? T.nBillsToSave(drafts.length) : d?.billId ? T.editBill : T.newBill}</h2>
        <div role="tablist" aria-label={T.bills} className="-mx-0.5 flex snap-x gap-2 overflow-x-auto px-0.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {drafts.map((x, i) => {
            const st = draftState(x);
            const pv = previewOf(x.id);
            return (
              <button key={x.id} role="tab" aria-selected={x.id === d?.id} className="dpill" onClick={() => select(x.id)}>
                <span className="grid h-10 w-[34px] place-items-center overflow-hidden rounded-md bg-surface-2 font-mono text-[13px] font-semibold text-muted">
                  {pv ? <img src={pv} alt="" className="size-full object-cover" /> : i + 1}
                </span>
                <span>
                  <b className="block text-[13.5px] leading-tight">{x.store || T.bill} {realItems(x).length ? fmt(draftTotal(x)) : ""}</b>
                  <span className={`text-[11.5px] ${TONE[st.tone]}`}>{st.label}</span>
                </span>
              </button>
            );
          })}
          {scanEnabled && <button className="dpill border-dashed !pl-3 text-muted" onClick={takeReceiptPhoto}><Camera className="size-4" />{T.camera}</button>}
          {scanEnabled && <button className="dpill border-dashed !pl-3 text-muted" onClick={pickReceipts}><Plus className="size-4" />{T.more}</button>}
          <button className="dpill border-dashed !pl-3 text-muted" onClick={() => addBlank(book.me.id)}><Pencil className="size-4" />{T.blank}</button>
        </div>
      </section>

      {d && <DraftEditor key={d.id} d={d} members={book.members} />}

      <div className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-bg from-70% to-transparent px-4 py-2.5">
        <div className="mx-auto flex max-w-[640px] gap-2">
          {drafts.length > 1 ? (
            <>
              <button className="btn btn-lg flex-1" disabled={!d || !isReady(d) || saving} onClick={onSaveOne}><Check />{T.saveThis}</button>
              <button className="btn btn-primary btn-lg flex-1" disabled={!ready.length || saving} onClick={onSaveAll}><CheckCheck />{T.saveNReady(ready.length)}</button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg flex-1" disabled={!d || d.status === "reading" || d.status === "queued" || saving} onClick={onSaveOne}>
              <Check />{d?.billId ? T.saveChanges : T.saveBill}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function DraftEditor({ d, members }: { d: Draft; members: Member[] }) {
  const T = useT();
  const set = (patch: Partial<Draft>) => update(d.id, (x) => ({ ...x, ...patch }));
  const setItem = (id: string, fn: (i: DraftItem) => DraftItem) => update(d.id, (x) => ({ ...x, items: x.items.map((i) => (i.id === id ? fn(i) : i)) }));
  const setItems = (fn: (i: DraftItem) => DraftItem) => update(d.id, (x) => ({ ...x, items: x.items.map(fn) }));
  const allIds = members.map((m) => m.id);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const addItem = () => {
    const it = newItem();
    update(d.id, (x) => ({ ...x, items: [...x.items, it] }));
    requestAnimationFrame(() => document.getElementById(`n-${it.id}`)?.focus());
  };

  if (d.status === "reading" || d.status === "queued") {
    const pv = previewOf(d.id);
    return (
      <div className="card">
        <div className="flex items-center gap-3">
          {pv && <img src={pv} alt={T.receiptPhoto} className="h-[72px] w-[54px] rounded-md border border-line object-cover" />}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <b>{d.status === "queued" ? T.waitingTurn : T.readingReceipt}</b>
            <span className="text-sm text-muted">{T.scanWait}</span>
            <div className="flex items-center gap-2"><div className="bar" /><button className="btn btn-ghost" onClick={() => stopScan(d.id)}>{T.stop}</button></div>
          </div>
        </div>
      </div>
    );
  }

  const items = realItems(d);
  const total = d.items.reduce((s, i) => s + parseBaht(i.price), 0);
  const unassigned = items.filter((i) => !i.eaters.length).length;
  const per: Record<string, number> = {};
  for (const it of d.items) for (const [k, v] of Object.entries(itemShares({ price: parseBaht(it.price), eaters: it.eaters }))) per[k] = (per[k] ?? 0) + v;

  return (
    <>
      {d.err && (
        <div className="note note-err">
          <TriangleAlert />
          <span className="min-w-[180px] flex-1">{d.err}</span>
          {canRescan(d.id) && <button className="btn" onClick={() => rescan(d.id)}><RotateCw />{T.rescan}</button>}
        </div>
      )}
      <div className="slip">
        <span className="vs-tab skin-only only-vscode">bill-{d.date}.json</span>
        <div className="flex flex-col gap-2.5 border-b border-dashed border-line pb-3 font-mono text-xs tracking-wide text-muted">
          <span className="text-center">{T.receiptHeader}</span>
          <div className="flex flex-wrap gap-2">
            <label className="field basis-[140px]"><span>{T.shop}</span><input className="input" value={d.store} maxLength={40} onChange={(e) => set({ store: e.target.value })} /></label>
            <label className="field basis-[160px]"><span>{T.date}</span><input className="input" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span>{T.paidByCaps}</span>
            <div className="flex flex-wrap gap-2">{members.map((m) => <PersonChip key={m.id} member={m} pressed={d.payerId === m.id} onClick={() => set({ payerId: m.id })} />)}</div>
          </div>
        </div>

        {d.items.length > 1 && (
          <div className="flex flex-col gap-2 rounded-ctl bg-surface-2 px-3 py-2.5">
            <span className="text-[11.5px] font-semibold tracking-wider text-muted uppercase">{T.tickEvery}</span>
            <div className="flex flex-wrap items-center gap-2">
              {members.map((m) => {
                const all = d.items.every((i) => i.eaters.includes(m.id));
                return <PersonChip key={m.id} member={m} pressed={all} onClick={() => setItems((i) => ({ ...i, eaters: all ? i.eaters.filter((e) => e !== m.id) : [...new Set([...i.eaters, m.id])] }))} />;
              })}
              <button className="btn btn-ghost" onClick={() => setItems((i) => ({ ...i, eaters: [] }))}>{T.clear}</button>
            </div>
          </div>
        )}

        <ul className="slip-items">
          {d.items.map((it) => {
            const price = parseBaht(it.price);
            const n = it.eaters.length;
            return (
              <li key={it.id} className="slip-item">
                <div className="slip-item-top">
                  <div className="flex min-w-0 flex-col">
                    <input id={`n-${it.id}`} className="input" value={it.name} placeholder={T.itemName} aria-label={T.itemName} maxLength={80} onChange={(e) => setItem(it.id, (i) => ({ ...i, name: e.target.value }))} />
                    {it.en && it.en !== it.name && <span className="px-[7px] text-[12.5px] text-muted">{it.en}</span>}
                  </div>
                  <input
                    className={`input price-input ${price < 0 ? "!text-owed" : ""}`}
                    inputMode="decimal" value={it.price} placeholder="0" aria-label={T.priceBaht}
                    onChange={(e) => setItem(it.id, (i) => ({ ...i, price: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
                  />
                  <button className="grid place-items-center" aria-label={T.removeItem} onClick={() => update(d.id, (x) => ({ ...x, items: x.items.filter((i) => i.id !== it.id) }))}><X className="size-5" /></button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {members.map((m) => <PersonChip key={m.id} member={m} pressed={it.eaters.includes(m.id)} onClick={() => setItem(it.id, (i) => ({ ...i, eaters: toggle(i.eaters, m.id) }))} />)}
                  <button className="btn btn-ghost !min-h-9" onClick={() => setItem(it.id, (i) => ({ ...i, eaters: i.eaters.length === allIds.length ? [] : allIds }))}>{T.all}</button>
                  <span className="ml-auto font-mono text-[12.5px] text-muted">
                    {n === 0 ? <span className="font-semibold text-warn">{T.whoAte}</span> : n > 1 ? T.each(fmt(price / n)) : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <button className="btn w-full" onClick={addItem}><Plus />{T.addItem}</button>

        <div className="flex flex-col gap-1 font-mono text-sm">
          {members.map((m) => (
            <div key={m.id} className="flex justify-between">
              <span className="font-semibold" style={{ color: `var(--m${m.color % 6})` }}>{m.name}{m.id === d.payerId ? T.paidSuffix : ""}</span>
              <span>{fmt(per[m.id] ?? 0)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-dashed border-line pt-2 text-[17px] font-semibold">
            <span>{T.totalItems(items.length)}</span>
            <span>{fmt(total)}</span>
          </div>
          {d.receiptTotal != null && Math.abs(total - d.receiptTotal) >= 1 && (
            <p className="note mt-1 font-body text-sm">
              <TriangleAlert />
              <span className="flex-1">{T.receiptMismatch(fmt(d.receiptTotal), fmt(total))}</span>
            </p>
          )}
        </div>
      </div>

      {unassigned > 0 && (
        <div className="note">
          <Hand />
          <span className="flex-1">{T.unticked(unassigned)}</span>
          <button className="btn" onClick={() => setItems((i) => (i.eaters.length ? i : { ...i, eaters: allIds }))}>{T.splitEveryone}</button>
        </div>
      )}
      <button
        className="btn btn-ghost btn-danger w-full"
        onClick={() =>
          openSheet({
            kind: "confirm",
            title: d.billId ? T.stopEditingQ : T.discardQ,
            text: d.billId ? T.stopEditingText : T.discardText,
            ok: d.billId ? T.stopEditing : T.discard,
            onOk: () => remove(d.id),
          })
        }
      >
        <Trash2 />{d.billId ? T.cancelEditing : T.discardBill}
      </button>
    </>
  );
}
