// Types shared by the API and the web client.
// All money is stored and sent as integer satang (1 baht = 100 satang).

export type Id = string;

export interface Member {
  id: Id;
  name: string;
  promptpay: string;
  /** Index into the theme's member colour palette (0-5). */
  color: number;
}

export interface House {
  id: Id;
  name: string;
  inviteCode: string;
}

export interface BillItem {
  id: Id;
  name: string;
  /** Short English description from the receipt reader. */
  en: string;
  /** Satang. Negative for discounts. */
  price: number;
  /** Members who ate this item; the price is split evenly between them. */
  eaters: Id[];
}

export interface Bill {
  id: Id;
  date: string; // YYYY-MM-DD
  store: string;
  payerId: Id;
  receiptTotal: number | null;
  items: BillItem[];
  createdBy: Id;
  createdAt: number;
  updatedAt: number;
}

export type PaymentStatus = "accepted" | "declined";

/** A payment recorded by the person who was owed (toId). */
export interface Payment {
  id: Id;
  fromId: Id;
  toId: Id;
  amount: number;
  note: string;
  status: PaymentStatus;
  requestId: Id | null;
  date: string;
  createdAt: number;
  updatedAt: number;
}

/** A "I paid you back" request sent by the borrower (fromId). */
export interface PayRequest {
  id: Id;
  fromId: Id;
  toId: Id;
  amount: number;
  note: string;
  slipId: Id | null;
  createdAt: number;
}

export interface HouseState {
  house: House;
  me: Member;
  members: Member[];
  bills: Bill[];
  payments: Payment[];
  requests: PayRequest[];
}

export interface MeResponse {
  member: Member;
  house: House;
  scanEnabled: boolean;
}

export interface InviteInfo {
  house: { name: string };
  members: Pick<Member, "id" | "name" | "color">[];
  full: boolean;
}

export interface BillInput {
  date: string;
  store: string;
  payerId: Id;
  receiptTotal: number | null;
  items: { name: string; en: string; price: number; eaters: Id[] }[];
}

export interface ScanResult {
  store: string | null;
  date: string | null;
  total: number | null;
  items: { name: string; en: string; price: number }[];
}

export const MAX_MEMBERS = 6;
