"use client";

/** Indicative exchange rates for display only (labelled "indicative" in the UI). Settlement is always in USD. */
const URL = "https://open.er-api.com/v6/latest/USD";
let cache: { at: number; rates: Record<string, number> } | undefined;

export async function usdRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < 3_600_000) return cache.rates;
  try {
    const res = await fetch(URL);
    const body = (await res.json()) as { result: string; rates: Record<string, number> };
    if (body.result !== "success") throw new Error("fx");
    cache = { at: Date.now(), rates: body.rates };
  } catch {
    cache = { at: Date.now(), rates: { USD: 1 } };
  }
  return cache.rates;
}

export const CURRENCIES = ["USD", "BRL", "EUR", "SGD", "NGN", "CAD", "GBP", "INR", "MXN", "KES"] as const;
