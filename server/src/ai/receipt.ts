import { env } from "../env";
import { HttpError } from "../http";
import type { ScanResult } from "../../../shared/types";

/**
 * Reads a receipt photo with Google Gemini (free tier works).
 * To switch providers, replace this module: it only has to return a ScanResult.
 */
const PROMPT = `You are reading a photo of a receipt from a Thai convenience store (usually 7-Eleven). Roommates will split it item by item.
Extract the purchased lines:
- One entry per purchased line. If a line has quantity N greater than 1 (and N is at most 6), output N separate entries, each with the unit price, so each unit can be assigned to a different person.
- Discounts or promotions (ส่วนลด, negative amounts, "-") are their own entry with a NEGATIVE price.
- Skip subtotal, total, VAT, cash, change, card, points, member and barcode lines.
- "name": the product name as printed (Thai is fine). "en": a short plain-English description, 2 to 4 words.
- "price": number in baht for that entry.
- "date": the purchase date as YYYY-MM-DD in the Gregorian calendar. Thai receipts often print the Buddhist year (2569 = 2026): subtract 543. Use null if you cannot read it.
- "total": the grand total printed on the receipt as a number, or null.
Reply with only JSON in this shape:
{"store":"7-Eleven","date":"2026-10-10","total":87,"items":[{"name":"ข้าวกะเพราไก่","en":"Basil chicken rice","price":45}]}`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    store: { type: "STRING", nullable: true },
    date: { type: "STRING", nullable: true },
    total: { type: "NUMBER", nullable: true },
    items: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { name: { type: "STRING" }, en: { type: "STRING" }, price: { type: "NUMBER" } }, required: ["name", "price"] },
    },
  },
  required: ["items"],
};

export const scanEnabled = () => Boolean(env.geminiKey);

export async function readReceipt(image: Buffer, mime: string): Promise<ScanResult> {
  if (!env.geminiKey) throw new HttpError(503, "Receipt scanning isn't set up on this server. Add GEMINI_API_KEY.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.geminiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: image.toString("base64") } }, { text: PROMPT }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new HttpError(504, "The receipt reader took too long. Try again.");
  }
  if (res.status === 429) {
    console.error("Gemini 429", (await res.text()).slice(0, 500));
    throw new HttpError(429, "The free receipt reader is busy. Wait a minute and try again.");
  }
  if (!res.ok) {
    console.error("Gemini error", res.status, (await res.text()).slice(0, 500));
    throw new HttpError(502, "The receipt reader failed. Try again, or type the items in.");
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let out: { store?: unknown; date?: unknown; total?: unknown; items?: unknown };
  try {
    out = JSON.parse(text);
  } catch {
    throw new HttpError(422, "The receipt was hard to read. Try a flatter, sharper photo.");
  }
  const toSatang = (v: unknown) => Math.round((Number(v) || 0) * 100);
  const items = (Array.isArray(out.items) ? out.items : [])
    .map((x: { name?: unknown; en?: unknown; price?: unknown }) => ({
      name: String(x?.name || x?.en || "Item").slice(0, 80),
      en: String(x?.en || "").slice(0, 60),
      price: toSatang(x?.price),
    }))
    .filter((x) => x.price !== 0);
  return {
    store: out.store ? String(out.store).slice(0, 40) : null,
    date: typeof out.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : null,
    total: out.total == null ? null : toSatang(out.total) || null,
    items,
  };
}
