import { useSyncExternalStore } from "react";
import type { Bill, BillInput, Id } from "@shared/types";
import { api } from "./api";
import { t } from "./i18n";
import { shrinkImage } from "./image";
import { bahtText, parseBaht } from "./money";

/**
 * Bills being prepared on this phone, before they are saved for everyone.
 * Several receipts can be scanned at once; each becomes its own draft.
 * Drafts survive a reload (localStorage); the photos do not.
 */
export interface DraftItem {
  id: string;
  name: string;
  en: string;
  /** Baht, as typed. */
  price: string;
  eaters: Id[];
}
export type DraftStatus = "manual" | "queued" | "reading" | "error";
export interface Draft {
  id: string;
  /** Set when editing a saved bill. */
  billId: Id | null;
  date: string;
  store: string;
  payerId: Id;
  items: DraftItem[];
  receiptTotal: number | null;
  status: DraftStatus;
  err: string;
}
interface DraftState {
  drafts: Draft[];
  cur: string | null;
}

const KEY = "ft.drafts.v1";
const uid = () => crypto.randomUUID();
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function load(): DraftState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as DraftState | null;
    if (s && Array.isArray(s.drafts)) {
      s.drafts = s.drafts.map((d) =>
        d.status === "reading" || d.status === "queued" ? { ...d, status: "error", err: t().scanInterrupted } : d,
      );
      return s;
    }
  } catch {
    /* ignore */
  }
  return { drafts: [], cur: null };
}

let state = load();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;
function commit(next: DraftState) {
  state = next;
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* full or private */
    }
  }, 250);
}
export function useDrafts() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

/* ---------- photos & scan queue (memory only) ---------- */
const files = new Map<string, Blob>();
const previews = new Map<string, string>();
const controllers = new Map<string, AbortController>();
let running = 0;
export const previewOf = (id: string) => previews.get(id);
export const canRescan = (id: string) => files.has(id);

/* ---------- derived ---------- */
export const realItems = (d: Draft) => d.items.filter((i) => i.name.trim() || parseBaht(i.price));
export const draftTotal = (d: Draft) => realItems(d).reduce((s, i) => s + parseBaht(i.price), 0);
export function draftState(d: Draft): { label: string; tone: "ok" | "wait" | "bad" | "" } {
  if (d.status === "queued") return { label: t().waiting, tone: "wait" };
  if (d.status === "reading") return { label: t().draftReading, tone: "wait" };
  const items = realItems(d);
  if (d.status === "error" && !items.length) return { label: t().draftCouldntRead, tone: "bad" };
  if (!items.length) return { label: t().draftEmpty, tone: "" };
  const n = items.filter((i) => !i.eaters.length).length;
  return n ? { label: t().draftToTick(n), tone: "wait" } : { label: t().draftReady, tone: "ok" };
}
export const isReady = (d: Draft) => draftState(d).tone === "ok";
export function toBillInput(d: Draft): BillInput {
  return {
    date: d.date || today(),
    store: d.store.trim() || t().shop,
    payerId: d.payerId,
    receiptTotal: d.receiptTotal,
    items: realItems(d).map((i) => ({ name: i.name.trim() || i.en || t().item, en: i.en, price: parseBaht(i.price), eaters: i.eaters })),
  };
}

/* ---------- actions ---------- */
export const newItem = (): DraftItem => ({ id: uid(), name: "", en: "", price: "", eaters: [] });
const blank = (payerId: Id): Draft => ({ id: uid(), billId: null, date: today(), store: "7-Eleven", payerId, items: [], receiptTotal: null, status: "manual", err: "" });

export function update(id: string, fn: (d: Draft) => Draft) {
  commit({ ...state, drafts: state.drafts.map((d) => (d.id === id ? fn(d) : d)) });
}
export const select = (id: string) => commit({ ...state, cur: id });

export function addBlank(payerId: Id) {
  const d = { ...blank(payerId), items: [newItem()] };
  commit({ drafts: [...state.drafts, d], cur: d.id });
}

export function editBill(b: Bill) {
  const existing = state.drafts.find((d) => d.billId === b.id);
  if (existing) return select(existing.id);
  const d: Draft = {
    id: uid(), billId: b.id, date: b.date, store: b.store, payerId: b.payerId, receiptTotal: b.receiptTotal, status: "manual", err: "",
    items: b.items.map((i) => ({ id: uid(), name: i.name, en: i.en, price: bahtText(i.price), eaters: [...i.eaters] })),
  };
  commit({ drafts: [...state.drafts, d], cur: d.id });
}

export function remove(id: string) {
  controllers.get(id)?.abort();
  const url = previews.get(id);
  if (url) URL.revokeObjectURL(url);
  previews.delete(id);
  files.delete(id);
  const i = state.drafts.findIndex((d) => d.id === id);
  const drafts = state.drafts.filter((d) => d.id !== id);
  const cur = state.cur === id ? (drafts[i] ?? drafts[i - 1] ?? null)?.id ?? null : state.cur;
  commit({ drafts, cur });
}

export function enqueueScans(photos: File[], payerId: Id) {
  const list = photos.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, 12);
  if (!list.length) return 0;
  const cur = state.drafts.find((d) => d.id === state.cur);
  const reuse = cur && !cur.billId && !realItems(cur).length && cur.status !== "reading" && cur.status !== "queued" ? cur : null;
  const added: Draft[] = list.map((f, i) => {
    const d: Draft = i === 0 && reuse ? { ...reuse, status: "queued", err: "" } : { ...blank(payerId), status: "queued" };
    files.set(d.id, f);
    previews.set(d.id, URL.createObjectURL(f));
    return d;
  });
  const drafts = state.drafts.map((d) => (reuse && d.id === reuse.id ? added[0] : d)).concat(reuse ? added.slice(1) : added);
  commit({ drafts, cur: added[0].id });
  pump();
  return list.length;
}

export function rescan(id: string) {
  if (!files.has(id)) return;
  update(id, (d) => ({ ...d, status: "queued", err: "" }));
  pump();
}
export const stopScan = (id: string) => controllers.get(id)?.abort();

function pump() {
  while (running < 2) {
    const d = state.drafts.find((x) => x.status === "queued");
    if (!d) return;
    running++;
    update(d.id, (x) => ({ ...x, status: "reading" }));
    void scanOne(d.id).finally(() => {
      running--;
      pump();
    });
  }
}

async function scanOne(id: string) {
  const file = files.get(id);
  if (!file) return update(id, (d) => ({ ...d, status: "error", err: t().pickAgain }));
  const ctl = new AbortController();
  controllers.set(id, ctl);
  try {
    const small = await shrinkImage(file, 1800, 2_500_000).catch(() => file);
    const r = await api.scan(small, ctl.signal);
    const items: DraftItem[] = r.items.map((i) => ({ id: uid(), name: i.name, en: i.en, price: bahtText(i.price), eaters: [] }));
    update(id, (d) => ({
      ...d,
      items: [...realItems(d), ...items],
      date: r.date ?? d.date,
      store: r.store ?? d.store,
      receiptTotal: r.total,
      status: items.length ? "manual" : "error",
      err: items.length ? "" : t().noItemsFound,
    }));
  } catch (e) {
    const err = (e as Error).name === "AbortError" ? t().scanStopped : (e as Error).message || t().couldntReadReceipt;
    update(id, (d) => ({ ...d, status: "error", err }));
  } finally {
    controllers.delete(id);
  }
}
