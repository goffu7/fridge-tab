/** Money helpers. The API uses integer satang; inputs are typed in baht. */

export function fmt(satang: number): string {
  const baht = Math.round(satang) / 100;
  const abs = Math.abs(baht);
  return (baht < 0 ? "−" : "") + "฿" + abs.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(abs) ? 0 : 2, maximumFractionDigits: 2 });
}

/** Parses what someone typed ("1,250.50", "฿45") into satang. */
export function parseBaht(text: string): number {
  const n = parseFloat(String(text ?? "").replace(/[,฿\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Satang to a plain baht string for an input box. */
export const bahtText = (satang: number) => String(Math.round(satang) / 100);
