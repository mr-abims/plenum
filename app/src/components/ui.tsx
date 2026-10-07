"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { EXPLORER } from "@/lib/config";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{children}</p>;
}

export function H1({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">{children}</h1>;
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-2xl tracking-tight">{children}</h2>;
}

type Variant = "primary" | "secondary" | "danger";
export function Button({
  variant = "primary",
  busy,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-accent-ink hover:opacity-90",
    secondary: "border border-line bg-surface text-ink hover:bg-paper",
    danger: "border border-bad/40 bg-surface text-bad hover:bg-bad/10",
  };
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "mock"; children: ReactNode }) {
  const tones = {
    neutral: "border-line text-muted",
    ok: "border-ok/40 text-ok",
    warn: "border-warn/40 text-warn",
    bad: "border-bad/40 text-bad",
    mock: "border-mock/40 text-mock",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "bad" | "ok"; children: ReactNode }) {
  const tones = { neutral: "border-line", warn: "border-warn/50", bad: "border-bad/50", ok: "border-ok/50" };
  return <div className={`rounded-xl border-l-4 bg-surface px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function TxLink({ hash, children }: { hash: string; children?: ReactNode }) {
  if (!EXPLORER) return <span className="font-mono text-xs text-muted">{hash.slice(0, 10)}…</span>;
  return (
    <a className="font-mono text-xs text-accent underline-offset-2 hover:underline" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      {children ?? `${hash.slice(0, 10)}…`}
    </a>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-base outline-none focus:border-accent";
