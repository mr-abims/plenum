"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Badge, Button, Card, Eyebrow, Field, H1, Notice, inputClass } from "@/components/ui";
import { CURRENCIES } from "@/lib/fx";
import { isVerified } from "@/lib/plenum";
import { useSession, type Profile } from "@/lib/session";

function Start() {
  const { session, profile, busy, error, create, login, saveProfile } = useSession();
  const [name, setName] = useState("");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [draft, setDraft] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const next = useSearchParams().get("next");
  const router = useRouter();

  useEffect(() => setDraft(profile), [profile]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const poll = async () => {
      const v = await isVerified(session.account.address).catch(() => false);
      if (live) setVerified(v);
    };
    void poll();
    const id = setInterval(poll, 8000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [session]);

  if (!session) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <Eyebrow>Get started</Eyebrow>
        <H1>Your account is a passkey</H1>
        <p className="mt-4 text-muted">
          No seed phrase, no browser extension. Face ID, Touch ID or your security key creates your account and signs for
          you. The same passkey also unlocks your private documents.
        </p>
        <Card className="mt-8 space-y-4">
          <Field label="Your name" hint="Shown to the other members of your groups.">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana" />
          </Field>
          <Button busy={busy} disabled={!name.trim()} onClick={() => create(name.trim())} className="w-full">
            Create account with passkey
          </Button>
          <div className="text-center text-sm text-muted">or</div>
          <Button variant="secondary" busy={busy} onClick={login} className="w-full">
            Sign in with an existing passkey
          </Button>
          {error ? <Notice tone="bad">{error}</Notice> : null}
        </Card>
      </div>
    );
  }

  const address = session.account.address;
  return (
    <div className="mx-auto max-w-lg space-y-6 pt-10">
      <div>
        <Eyebrow>Your account</Eyebrow>
        <H1>{profile.displayName ? `Hello, ${profile.displayName}` : "You're signed in"}</H1>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Identity check</h2>
          {verified === null ? <Badge>Checking…</Badge> : verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Not verified yet</Badge>}
        </div>
        <p className="text-sm text-muted">
          Only verified people can join a group, put money in or receive money. {verified ? "You're all set." : "Send this account ID to your group's organizer to get verified."}
        </p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-paper px-3 py-2 text-xs">{address}</code>
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(address);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-muted">
          Provider: <span className="text-mock">MOCK identity provider</span> standing in for Cleanverse A-Pass on testnet.
        </p>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Your preferences</h2>
        <p className="text-sm text-muted">Encrypted with your passkey before it leaves this device. Nobody else can read it.</p>
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
          <Field label="Time zone">
            <input className={inputClass} value={draft.timeZone} onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })} />
          </Field>
        </div>
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
        {saved ? <p className="text-sm text-ok">Saved and encrypted.</p> : null}
      </Card>

      {next ? (
        <Button className="w-full" onClick={() => router.push(next)}>
          Continue
        </Button>
      ) : null}
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
