"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Check, Copy, Fingerprint, Info, LockKey, Rocket, SlidersHorizontal, User, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { AccountSetup } from "@/components/AccountSetup";
import { Seal } from "@/components/Seal";
import { Button, Card, Chip, Field, Notice, inputClass } from "@/components/ui";
import { money } from "@/lib/format";
import { CURRENCIES, usdRates } from "@/lib/fx";
import { USD } from "@/lib/plenum";
import { useAccountSetup } from "@/lib/useAccountSetup";
import { loadMyGroups, type MyGroup } from "@/lib/feed";
import { useSession, type Profile } from "@/lib/session";

const STEPS = [
  { key: "passkey", label: "Passkey", icon: Fingerprint },
  { key: "ready", label: "Ready", icon: Rocket },
  { key: "prefs", label: "Preferences", icon: SlidersHorizontal },
] as const;

function Stepper({ at }: { at: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < at;
        const now = i === at;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2">
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full border transition ${done ? "border-accent bg-accent text-accent-ink" : now ? "border-accent text-accent" : "border-line-strong text-faint"}`}
            >
              {done ? <Check size={14} weight="bold" /> : <s.icon size={15} />}
            </span>
            <span className={`hidden text-sm sm:inline ${now ? "text-ink" : "text-muted"}`}>{s.label}</span>
            {i < STEPS.length - 1 ? <span className={`h-px flex-1 ${done ? "bg-accent" : "bg-line"}`} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Start() {
  const { session, profile, busy, error, create, login, saveProfile } = useSession();
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const next = useSearchParams().get("next");
  const router = useRouter();

  useEffect(() => setDraft(profile), [profile]);
  useEffect(() => void usdRates().then(setRates).catch(() => {}), []);
  const setup = useAccountSetup(session);
  const [groups, setGroups] = useState<MyGroup[] | null>(null);
  useEffect(() => {
    if (!session) return setGroups(null);
    loadMyGroups(session.account.address).then(setGroups).catch(() => setGroups([]));
  }, [session]);

  const at = !session ? 0 : setup.ready ? 2 : 1;

  if (!session) {
    return (
      <div className="mx-auto grid max-w-5xl gap-12 pt-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:pt-16">
        <div>
          <Stepper at={0} />
          <h1 className="mt-10 font-display text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">Your account is a passkey.</h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted">
            No seed phrase and no browser extension. Face ID, Touch ID or a security key creates your account and signs for you. The same passkey unlocks your private documents.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              [Fingerprint, "Signs every approval and vote, on your device"],
              [LockKey, "Derives the key that encrypts your documents"],
              [UsersThree, "One account for every group you join, ready to use straight away"],
            ].map(([I, t]) => {
              const Icon = I as typeof Fingerprint;
              return (
                <li key={t as string} className="flex items-center gap-3 text-muted">
                  <Icon size={18} className="text-accent" /> {t as string}
                </li>
              );
            })}
          </ul>
        </div>

        <Card className="space-y-5 p-6 sm:p-8">
          <motion.div
            className="relative mx-auto grid size-24 place-items-center text-accent"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
          >
            <span className="absolute inset-0 rounded-full border border-accent/25 bg-accent-soft" />
            <span className="pulse absolute inset-4 rounded-full text-accent opacity-25" />
            <Fingerprint size={44} weight="light" className="relative" />
          </motion.div>
          <Field label="Your name" hint="Shown to the other members of your groups. Stored encrypted, never onchain.">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana" autoComplete="nickname" />
          </Field>
          <Button size="lg" busy={busy} disabled={!name.trim()} onClick={() => create(name.trim())} className="w-full">
            Create account with passkey
          </Button>
          <div className="flex items-center gap-3 text-xs text-faint">
            <span className="h-px flex-1 bg-line" /> already have one <span className="h-px flex-1 bg-line" />
          </div>
          <Button variant="secondary" busy={busy} onClick={login} className="w-full">
            Sign in with your passkey
          </Button>
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <p className="flex gap-2 text-xs leading-relaxed text-muted">
            <Info size={14} className="mt-0.5 shrink-0" />
            Use iCloud Keychain, Google Password Manager or 1Password. Passkeys saved only in desktop Chrome can't create a Plenum account.
          </p>
        </Card>
      </div>
    );
  }

  const address = session.account.address;
  const previewRate = rates[draft.currency] ?? 1;
  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-10">
      <Stepper at={at} />
      <div className="flex items-center gap-4 pt-4">
        <Seal address={address} size={56} />
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em]">{profile.displayName ? `Hello, ${profile.displayName}` : "You're signed in"}</h1>
          <p className="mt-1 text-sm text-muted">This seal is your account's mark. Other members see it next to your share.</p>
        </div>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Your account</h2>
          {setup.ready ? <Chip tone="accent">Ready</Chip> : <Chip>Setting up…</Chip>}
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Rebuilt from your passkey on any device. Share this ID if someone wants to send you a personal invite.
        </p>
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-sunk p-2">
          <code className="min-w-0 flex-1 truncate px-2 font-mono text-xs">{address}</code>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(address);
              setCopied(true);
            }}
          >
            {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <AccountSetup setup={setup} />
        {next ? (
          <Button size="lg" className="w-full" disabled={!setup.ready} onClick={() => router.push(next)}>
            Continue <ArrowRight size={17} />
          </Button>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/create"
              aria-disabled={!setup.ready}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink transition hover:brightness-110 ${setup.ready ? "" : "pointer-events-none opacity-45"}`}
            >
              <UsersThree size={17} /> Start a group
            </Link>
            <Link
              href="/create?mode=personal"
              aria-disabled={!setup.ready}
              className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong px-6 text-[15px] font-medium transition hover:border-faint ${setup.ready ? "" : "pointer-events-none opacity-45"}`}
            >
              <User size={17} /> Just me
            </Link>
          </div>
        )}
        <p className="text-xs text-muted">Joining a friend's group? Open the invite link they sent you.</p>
      </Card>

      {groups && groups.length > 0 ? (
        <Card className="space-y-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">Your groups and portfolios</h2>
          <ul className="divide-y divide-line">
            {groups.map((g) => (
              <li key={g.address}>
                <Link href={`/g/${g.address}`} className="flex items-center justify-between gap-3 py-3 transition hover:text-accent">
                  <span className="font-medium">{g.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {g.personal ? "Personal portfolio" : `Group · ${g.memberCount} member${g.memberCount === 1 ? "" : "s"}`} <ArrowRight size={14} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Found from your account onchain, so this list is the same on any device.</p>
        </Card>
      ) : null}

      <Card className="space-y-5">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Your preferences <span className="text-sm font-normal text-muted">(optional)</span>
          </h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <LockKey size={15} /> Encrypted with your passkey before it leaves this device.
          </p>
        </div>
        <Field label="Name">
          <input className={inputClass} value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Show amounts in" hint="Converted at an indicative rate. Settlement is in USD.">
            <select className={inputClass} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Time zone" hint="Vote deadlines are shown in this time zone.">
            <input className={inputClass} value={draft.timeZone} onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })} />
          </Field>
        </div>
        {draft.currency !== "USD" ? (
          <p className="rounded-2xl border border-line bg-sunk px-4 py-3 font-mono text-xs text-muted">
            {money(1000n * USD)} ≈ {money(1000n * USD, draft.currency, previewRate)} at today's indicative rate
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            busy={saving}
            onClick={async () => {
              setSaving(true);
              setSaved(false);
              try {
                await saveProfile(draft);
                setSaved(true);
              } finally {
                setSaving(false);
              }
            }}
          >
            Save preferences
          </Button>
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-accent">
              <Check size={15} weight="bold" /> Saved and encrypted
            </span>
          ) : null}
        </div>
      </Card>

    </div>
  );
}

export default function StartPage() {
  return (
    <Suspense>
      <Start />
    </Suspense>
  );
}
