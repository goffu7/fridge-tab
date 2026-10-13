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
  if (!book) return <p className="card text-center text-muted">Loading…</p>;
  const scanEnabled = me?.scanEnabled ?? false;
  const d = drafts.find((x) => x.id === cur) ?? drafts[0];

  if (!drafts.length) {
    return (
      <section className="flex flex-col gap-3">
        <h2>Add bills</h2>
        {scanEnabled ? (
          <div className="flex w-full flex-col items-center gap-2.5 rounded-card border-2 border-dashed border-accent bg-accent/5 px-4 py-7 text-center">
            <ScanLine className="size-9 text-accent-strong" />
            <span className="display text-2xl">Scan receipts</span>
            <span className="text-muted">Snap a receipt, or pick one photo or many at once. Each receipt becomes its own bill, and the amounts add up on everyone's tab.</span>
            <div className="mt-1 flex w-full flex-wrap justify-center gap-2">
              <button className="btn btn-primary" onClick={takeReceiptPhoto}><Camera />Take photo</button>
              <button className="btn" onClick={pickReceipts}><Images />Choose photos</button>
            </div>
          </div>
        ) : (
          <p className="note note-info">Receipt scanning isn't set up on this server yet. You can type the items in.</p>
        )}
        <button className="btn w-full" onClick={() => addBlank(book.me.id)}><Pencil />Type items in instead</button>
      </section>
    );
  }

  const saveOne = async (x: Draft) => {
    const items = realItems(x);
    if (!items.length) return toast.error("Add at least one item first."), false;
    const missing = items.filter((i) => !i.eaters.length).length;
    if (missing) return toast.error(`Tick who ate ${missing} more item${missing > 1 ? "s" : ""} first.`), false;
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
      toast.success(editing ? "Changes saved" : left ? `Bill saved. ${left} left.` : "Bill saved");
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
    toast.success(left ? `Saved ${saved}. ${left} still need${left === 1 ? "s" : ""} ticks.` : `Saved ${saved} bills`);
    if (!left) navigate("/");
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <h2>{drafts.length > 1 ? `${drafts.length} bills to save` : d?.billId ? "Edit bill" : "New bill"}</h2>
        <div role="tablist" aria-label="Bills" className="-mx-0.5 flex snap-x gap-2 overflow-x-auto px-0.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {drafts.map((x, i) => {
            const st = draftState(x);
            const pv = previewOf(x.id);
            return (
              <button key={x.id} role="tab" aria-selected={x.id === d?.id} className="dpill" onClick={() => select(x.id)}>
                <span className="grid h-10 w-[34px] place-items-center overflow-hidden rounded-md bg-surface-2 font-mono text-[13px] font-semibold text-muted">
                  {pv ? <img src={pv} alt="" className="size-full object-cover" /> : i + 1}
                </span>
                <span>
                  <b className="block text-[13.5px] leading-tight">{x.store || "Bill"} {realItems(x).length ? fmt(draftTotal(x)) : ""}</b>
                  <span className={`text-[11.5px] ${TONE[st.tone]}`}>{st.label}</span>
                </span>
              </button>
            );
          })}
          {scanEnabled && <button className="dpill border-dashed !pl-3 text-muted" onClick={takeReceiptPhoto}><Camera className="size-4" />Camera</button>}
          {scanEnabled && <button className="dpill border-dashed !pl-3 text-muted" onClick={pickReceipts}><Plus className="size-4" />More</button>}
          <button className="dpill border-dashed !pl-3 text-muted" onClick={() => addBlank(book.me.id)}><Pencil className="size-4" />Blank</button>
        </div>
      </section>

      {d && <DraftEditor key={d.id} d={d} members={book.members} />}

      <div className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 bg-gradient-to-t from-bg from-70% to-transparent px-4 py-2.5">
        <div className="mx-auto flex max-w-[640px] gap-2">
          {drafts.length > 1 ? (
            <>
              <button className="btn btn-lg flex-1" disabled={!d || !isReady(d) || saving} onClick={onSaveOne}><Check />Save this</button>
              <button className="btn btn-primary btn-lg flex-1" disabled={!ready.length || saving} onClick={onSaveAll}><CheckCheck />Save {ready.length} ready</button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg flex-1" disabled={!d || d.status === "reading" || d.status === "queued" || saving} onClick={onSaveOne}>
              <Check />{d?.billId ? "Save changes" : "Save bill"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function DraftEditor({ d, members }: { d: Draft; members: Member[] }) {
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
          {pv && <img src={pv} alt="Receipt photo" className="h-[72px] w-[54px] rounded-md border border-line object-cover" />}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <b>{d.status === "queued" ? "Waiting its turn…" : "Reading receipt…"}</b>
            <span className="text-sm text-muted">Usually 10 to 40 seconds. You can tick other bills meanwhile.</span>
            <div className="flex items-center gap-2"><div className="bar" /><button className="btn btn-ghost" onClick={() => stopScan(d.id)}>Stop</button></div>
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
          {canRescan(d.id) && <button className="btn" onClick={() => rescan(d.id)}><RotateCw />Rescan</button>}
        </div>
      )}
      <div className="slip">
        <span className="vs-tab skin-only only-vscode">bill-{d.date}.json</span>
        <div className="flex flex-col gap-2.5 border-b border-dashed border-line pb-3 font-mono text-xs tracking-wide text-muted">
          <span className="text-center">— RECEIPT —</span>
          <div className="flex flex-wrap gap-2">
            <label className="field basis-[140px]"><span>Shop</span><input className="input" value={d.store} maxLength={40} onChange={(e) => set({ store: e.target.value })} /></label>
            <label className="field basis-[160px]"><span>Date</span><input className="input" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span>PAID BY</span>
            <div className="flex flex-wrap gap-2">{members.map((m) => <PersonChip key={m.id} member={m} pressed={d.payerId === m.id} onClick={() => set({ payerId: m.id })} />)}</div>
          </div>
        </div>

        {d.items.length > 1 && (
          <div className="flex flex-col gap-2 rounded-ctl bg-surface-2 px-3 py-2.5">
            <span className="text-[11.5px] font-semibold tracking-wider text-muted uppercase">Tick on every item</span>
            <div className="flex flex-wrap items-center gap-2">
              {members.map((m) => {
                const all = d.items.every((i) => i.eaters.includes(m.id));
                return <PersonChip key={m.id} member={m} pressed={all} onClick={() => setItems((i) => ({ ...i, eaters: all ? i.eaters.filter((e) => e !== m.id) : [...new Set([...i.eaters, m.id])] }))} />;
              })}
              <button className="btn btn-ghost" onClick={() => setItems((i) => ({ ...i, eaters: [] }))}>Clear</button>
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
                    <input id={`n-${it.id}`} className="input" value={it.name} placeholder="Item name" aria-label="Item name" maxLength={80} onChange={(e) => setItem(it.id, (i) => ({ ...i, name: e.target.value }))} />
                    {it.en && it.en !== it.name && <span className="px-[7px] text-[12.5px] text-muted">{it.en}</span>}
                  </div>
                  <input
                    className={`input price-input ${price < 0 ? "!text-owed" : ""}`}
                    inputMode="decimal" value={it.price} placeholder="0" aria-label="Price in baht"
                    onChange={(e) => setItem(it.id, (i) => ({ ...i, price: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
                  />
                  <button className="grid h-11 w-10 place-items-center text-muted" aria-label="Remove item" onClick={() => update(d.id, (x) => ({ ...x, items: x.items.filter((i) => i.id !== it.id) }))}><X className="size-5" /></button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {members.map((m) => <PersonChip key={m.id} member={m} pressed={it.eaters.includes(m.id)} onClick={() => setItem(it.id, (i) => ({ ...i, eaters: toggle(i.eaters, m.id) }))} />)}
                  <button className="btn btn-ghost !min-h-9" onClick={() => setItem(it.id, (i) => ({ ...i, eaters: i.eaters.length === allIds.length ? [] : allIds }))}>All</button>
                  <span className="ml-auto font-mono text-[12.5px] text-muted">
                    {n === 0 ? <span className="font-semibold text-warn">Who ate this?</span> : n > 1 ? `${fmt(price / n)} each` : ""}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <button className="btn w-full" onClick={addItem}><Plus />Add item</button>

        <div className="flex flex-col gap-1 font-mono text-sm">
          {members.map((m) => (
            <div key={m.id} className="flex justify-between">
              <span className="font-semibold" style={{ color: `var(--m${m.color % 6})` }}>{m.name}{m.id === d.payerId ? " (paid)" : ""}</span>
              <span>{fmt(per[m.id] ?? 0)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-dashed border-line pt-2 text-[17px] font-semibold">
            <span>TOTAL · {items.length} ITEMS</span>
            <span>{fmt(total)}</span>
          </div>
          {d.receiptTotal != null && Math.abs(total - d.receiptTotal) >= 1 && (
            <p className="note mt-1 font-body text-sm">
              <TriangleAlert />
              <span className="flex-1">The receipt says {fmt(d.receiptTotal)}, but these items add up to {fmt(total)}. Check for a missed item or discount.</span>
            </p>
          )}
        </div>
      </div>

      {unassigned > 0 && (
        <div className="note">
          <Hand />
          <span className="flex-1">{unassigned} item{unassigned > 1 ? "s have" : " has"} nobody ticked.</span>
          <button className="btn" onClick={() => setItems((i) => (i.eaters.length ? i : { ...i, eaters: allIds }))}>Split between everyone</button>
        </div>
      )}
      <button
        className="btn btn-ghost btn-danger w-full"
        onClick={() =>
          openSheet({
            kind: "confirm",
            title: d.billId ? "Stop editing?" : "Discard this bill?",
            text: d.billId ? "Your changes to this bill won't be saved." : "The items on this bill will be thrown away.",
            ok: d.billId ? "Stop editing" : "Discard",
            onOk: () => remove(d.id),
          })
        }
      >
        <Trash2 />{d.billId ? "Cancel editing" : "Discard this bill"}
      </button>
    </>
  );
}
