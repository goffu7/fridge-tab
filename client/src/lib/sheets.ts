import { useSyncExternalStore } from "react";

/** Which bottom sheet is open. One at a time, app-wide. */
export type SheetState =
  | { kind: "record"; fromId: string; paymentId?: string }
  | { kind: "payback"; toId: string }
  | { kind: "review"; requestId: string }
  | { kind: "slip"; slipId: string }
  /** Where a balance comes from. Without otherId, lists everyone memberId has a balance with. */
  | { kind: "breakdown"; memberId: string; otherId?: string }
  | { kind: "confirm"; title: string; text: string; ok: string; onOk: () => Promise<unknown> | void }
  | null;

let current: SheetState = null;
const listeners = new Set<() => void>();

export function openSheet(s: SheetState) {
  current = s;
  listeners.forEach((l) => l());
}
export const closeSheet = () => openSheet(null);
export const useSheet = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
