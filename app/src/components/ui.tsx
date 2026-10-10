"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight, CheckCircle, Info, WarningCircle, XCircle } from "@phosphor-icons/react";
import { EXPLORER } from "@/lib/config";

/** Raised panel. Radius rule: panels 20px, inputs 12px, everything interactive is a pill. */
export function Card({ children, className = "", as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "li" }) {
  return <Tag className={`rounded-[20px] border border-line bg-raised p-5 shadow-panel sm:p-6 ${className}`}>{children}</Tag>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{children}</p>;
}

export function H1({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h1 className={`font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] text-balance sm:text-5xl ${className}`}>{children}</h1>;
}

export function H2({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-display text-2xl font-semibold tracking-[-0.02em] ${className}`}>{children}</h2>;
}

/** Page title block used by every app screen: title, optional lead, optional trailing slot. */
export function PageHeader({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <H1>{title}</H1>
        {lead ? <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted">{lead}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`spin inline-block size-4 rounded-full border-2 border-current border-r-transparent ${className}`} />;
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "primary",
  busy,
  size = "md",
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; size?: "sm" | "md" | "lg" }) {
  const styles: Record<Variant, string> = {
    primary: "bg-accent text-accent-ink hover:brightness-110",
    secondary: "border border-line-strong bg-raised text-ink hover:border-faint hover:bg-well",
    ghost: "text-muted hover:bg-well hover:text-ink",
    danger: "border border-bad/40 bg-bad/10 text-bad hover:bg-bad/15",
  };
  const sizes = { sm: "min-h-9 px-4 text-[13px]", md: "min-h-11 px-5 text-sm", lg: "min-h-13 px-7 text-[15px]" };
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      aria-busy={busy || undefined}
      className={`inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition duration-200 ease-out-expo active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${sizes[size]} ${styles[variant]} ${className}`}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  );
}

export type Tone = "neutral" | "ok" | "warn" | "bad" | "mock" | "info" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "border-line-strong text-muted",
  ok: "border-ok/35 bg-ok/8 text-ok",
  accent: "border-accent/35 bg-accent-soft text-accent",
  warn: "border-warn/35 bg-warn/8 text-warn",
  bad: "border-bad/35 bg-bad/8 text-bad",
  mock: "border-mock/40 bg-mock/8 text-mock",
  info: "border-info/35 bg-info/8 text-info",
};

/** Small status pill. `mono` for codes such as reason names. */
export function Chip({ tone = "neutral", mono, icon, children, className = "" }: { tone?: Tone; mono?: boolean; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${mono ? "font-mono text-[11px] tracking-wide" : ""} ${TONES[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}
export const Badge = Chip;

/** The MOCK / FALLBACK label required on every simulated asset and fallback path. */
export function MockTag({ children = "MOCK" }: { children?: ReactNode }) {
  return <Chip tone="mock" mono>{children}</Chip>;
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "bad" | "ok"; children: ReactNode }) {
  const map = {
    neutral: { cls: "border-line-strong text-muted", Icon: Info },
    ok: { cls: "border-ok/40 text-ink", Icon: CheckCircle },
    warn: { cls: "border-warn/40 text-ink", Icon: WarningCircle },
    bad: { cls: "border-bad/40 text-ink", Icon: XCircle },
  }[tone];
  const iconTone = { neutral: "text-muted", ok: "text-ok", warn: "text-warn", bad: "text-bad" }[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={`flex gap-3 rounded-2xl border bg-well/60 px-4 py-3 text-sm leading-relaxed ${map.cls}`}>
      <map.Icon size={18} weight="fill" className={`mt-0.5 shrink-0 ${iconTone}`} />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function TxLink({ hash, children, explorer = EXPLORER }: { hash: string; children?: ReactNode; explorer?: string }) {
  if (!explorer) return <span className="font-mono text-xs text-faint">{hash.slice(0, 10)}…</span>;
  return (
    <a
      className="inline-flex items-center gap-1 font-mono text-xs text-muted underline-offset-4 transition hover:text-accent hover:underline"
      href={`${explorer}/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
    >
      {children ?? `${hash.slice(0, 10)}…`}
      <ArrowUpRight size={12} />
    </a>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="block text-xs text-bad">{error}</span> : hint ? <span className="block text-xs leading-relaxed text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line-strong bg-sunk px-3.5 py-2.5 text-base text-ink placeholder:text-faint outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

/** A label/value row used in definition-style panels. */
export function Stat({ label, value, sub, className = "" }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[13px] text-muted">{label}</p>
      <div className="mt-1 font-display text-4xl font-semibold tracking-[-0.03em] tabular sm:text-5xl">{value}</div>
      {sub ? <div className="mt-1.5 font-mono text-xs text-muted tabular">{sub}</div> : null}
    </div>
  );
}
