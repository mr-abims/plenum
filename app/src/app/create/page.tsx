"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decodeEventLog, type Address } from "viem";
import { plenumAbi, plenumFactoryAbi } from "@plenum/abis";
import { publicKeyToBytes32 } from "@plenum/crypto";
import { Button, Card, Eyebrow, Field, H1, Notice, inputClass } from "@/components/ui";
import { publicClient, send } from "@/lib/chain";
import { adapterName, DEPLOYMENT, MANAGER_ADDRESS } from "@/lib/config";
import { pct } from "@/lib/format";
import { encodeInvite, signInvite } from "@/lib/invite";
import { isVerified } from "@/lib/plenum";
import { useSession } from "@/lib/session";
import { mandateConfig, TEMPLATES, type Template } from "@/lib/templates";

export default function CreatePage() {
  const { session } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<Template>(TEMPLATES[1]);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) void isVerified(session.account.address).then(setVerified);
  }, [session]);

  if (!session) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <H1>Create a group</H1>
        <p className="mt-4 text-muted">First, set up your passkey account.</p>
        <Link className="mt-6 inline-block text-accent" href="/start?next=/create">
          Get started →
        </Link>
      </div>
    );
  }

  async function create() {
    if (!session) return;
    setError(null);
    try {
      if (!MANAGER_ADDRESS) throw new Error("The AI manager's address is not configured (NEXT_PUBLIC_MANAGER_ADDRESS).");
      setStep("Creating your group…");
      const hash = await send(session.account, {
        address: DEPLOYMENT.factory,
        abi: plenumFactoryAbi,
        functionName: "createPlenum",
        args: [name.trim(), template.id, mandateConfig(template), MANAGER_ADDRESS],
      });
      const receipt = await publicClient.getTransactionReceipt({ hash });
      let plenum: Address | undefined;
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: plenumFactoryAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "PlenumCreated") plenum = ev.args.plenum;
        } catch {}
      }
      if (!plenum) throw new Error("Group created but its address was not found in the receipt.");

      setStep("Adding you as the first member…");
      const invite = await signInvite(session.account, plenum, session.account.address, 1);
      await send(session.account, {
        address: plenum,
        abi: plenumAbi,
        functionName: "join",
        args: [encodeInvite(invite), publicKeyToBytes32(session.encryption.publicKey)],
      });
      router.push(`/g/${plenum}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep(null);
    }
  }

  return (
    <div className="space-y-8 pt-10">
      <div className="max-w-2xl">
        <Eyebrow>New group</Eyebrow>
        <H1>Choose your group's rules</H1>
        <p className="mt-4 text-muted">
          The rules decide what the AI manager may buy, how far each holding may drift from its target, how much cash
          stays on hand, and how big a single trade can be. Anything outside them needs the members' approval.
        </p>
      </div>

      {verified === false ? (
        <Notice tone="warn">
          You need to be verified before you can create a group. <Link className="text-accent" href="/start">Check your status</Link>.
        </Notice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTemplate(t)}
            className={`rounded-2xl border p-5 text-left transition ${
              template.id === t.id ? "border-accent bg-surface ring-2 ring-accent/30" : "border-line bg-surface hover:border-ink/30"
            }`}
          >
            <p className="font-display text-2xl">{t.title}</p>
            <p className="mt-2 text-sm text-muted">{t.blurb}</p>
            <ul className="mt-4 space-y-1 text-sm tabular">
              {t.sleeves.map((s) => (
                <li key={s.adapter} className="flex justify-between">
                  <span>{adapterName(s.adapter)}</span>
                  <span className="text-muted">
                    {pct(s.target, 0)} ± {pct(s.band, 0)}
                  </span>
                </li>
              ))}
              <li className="flex justify-between">
                <span>Cash</span>
                <span className="text-muted">at least {pct(t.cashFloor, 0)}</span>
              </li>
            </ul>
          </button>
        ))}
      </div>

      <Card className="max-w-2xl space-y-4">
        <h2 className="font-medium">In plain language</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>The manager may only buy and sell the {template.sleeves.length} assets above. It can never send money anywhere else.</li>
          <li>Any single trade is limited to {pct(template.maxTrade, 0)} of the group's value, and all trades in a day to 25%.</li>
          <li>At least {pct(template.cashFloor, 0)} stays in cash so members can take money out.</li>
          <li>Anything outside these limits becomes a proposal that members approve with their passkey.</li>
          <li>Any 2 members can pause the manager instantly.</li>
          <li>The assets are <span className="text-mock">MOCK</span> testnet versions of tokenised funds.</li>
        </ul>
        <Field label="Group name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="São Paulo Investment Club" />
        </Field>
        <Button busy={!!step} disabled={!name.trim() || verified !== true} onClick={create}>
          Create group
        </Button>
        {step ? <p className="text-sm text-muted">{step}</p> : null}
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </Card>
    </div>
  );
}
