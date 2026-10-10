import type { BillInput, HouseState, InviteInfo, MeResponse, ScanResult } from "@shared/types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", signal };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  if (!res.ok) {
    let msg = "Something went wrong. Try again.";
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const form = (fields: Record<string, string | Blob | null | undefined>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) f.append(k, v);
  return f;
};

export const api = {
  me: () => call<MeResponse>("GET", "/me"),
  state: () => call<HouseState>("GET", "/state"),
  updateMe: (patch: { name?: string; promptpay?: string; pin?: string }) => call<void>("PATCH", "/me", patch),
  logout: () => call<void>("POST", "/logout"),

  createHouse: (b: { houseName: string; name: string; pin: string }) => call<{ inviteCode: string }>("POST", "/houses", b),
  invite: (code: string) => call<InviteInfo>("GET", `/invite/${encodeURIComponent(code)}`),
  join: (code: string, b: { name: string; pin: string }) => call<void>("POST", `/invite/${encodeURIComponent(code)}/join`, b),
  login: (code: string, b: { memberId: string; pin: string }) => call<void>("POST", `/invite/${encodeURIComponent(code)}/login`, b),

  createBill: (b: BillInput) => call<{ id: string }>("POST", "/bills", b),
  updateBill: (id: string, b: BillInput) => call<void>("PUT", `/bills/${id}`, b),
  deleteBill: (id: string) => call<void>("DELETE", `/bills/${id}`),
  scan: (image: Blob, signal?: AbortSignal) => call<ScanResult>("POST", "/scan", form({ image }), signal),

  recordPayment: (b: { fromId: string; amount: number; note: string }) => call<{ id: string }>("POST", "/payments", b),
  editPayment: (id: string, b: { amount: number; note?: string }) => call<void>("PATCH", `/payments/${id}`, b),
  deletePayment: (id: string) => call<void>("DELETE", `/payments/${id}`),

  sendRequest: (b: { toId: string; amount: number; note: string; slip: Blob | null }) =>
    call<{ id: string }>("POST", "/requests", form({ toId: b.toId, amount: String(b.amount), note: b.note, slip: b.slip })),
  cancelRequest: (id: string) => call<void>("DELETE", `/requests/${id}`),
  acceptRequest: (id: string, amount: number) => call<void>("POST", `/requests/${id}/accept`, { amount }),
  declineRequest: (id: string) => call<void>("POST", `/requests/${id}/decline`),
  slipUrl: (id: string) => `/api/slips/${encodeURIComponent(id)}`,
};
