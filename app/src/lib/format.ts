import { USD } from "./plenum";

/** "R$ 1.234,56" style formatting in the member's currency from a settlement-asset (USD, 6 dp) amount. */
export function money(amount: bigint, currency = "USD", rate = 1, locale?: string): string {
  const usd = Number(amount) / Number(USD);
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(usd * rate);
}

export const pct = (bps: number, digits = 1) => `${(bps / 100).toFixed(digits)}%`;

export function ago(seconds: number): string {
  if (!Number.isFinite(seconds)) return "never";
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

export function inTimeZone(unixSeconds: number, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
    new Date(unixSeconds * 1000),
  );
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Parses "1,234.56" into settlement-asset base units. */
export function parseUsd(input: string): bigint {
  const clean = input.replace(/[, ]/g, "");
  if (!/^\d+(\.\d{0,6})?$/.test(clean)) throw new Error("Enter an amount like 250 or 99.50");
  const [whole, frac = ""] = clean.split(".");
  return BigInt(whole!) * USD + BigInt((frac + "000000").slice(0, 6));
}
