"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, MagnifyingGlass, SealCheck, SealWarning, XCircle } from "@phosphor-icons/react";
import { checkMemo, verifyAction, type VerifiedAction } from "@plenum/sdk";
import type { Hash } from "viem";
import { Address } from "@/components/Address";
import { MemoView } from "@/components/MemoView";
import { ReasonChip } from "@/components/ReasonChip";
import { Button, Card, Field, Notice, PageHeader, TxLink, inputClass } from "@/components/ui";
import { publicClient } from "@/lib/chain";
import { DEPLOYMENT } from "@/lib/config";

type Found = VerifiedAction;
type MemoCheck = { memo: boolean; actions: boolean | null } | { error: string };

function checkPasted(text: string, f: Found): MemoCheck {
  try {
    const r = checkMemo(JSON.parse(text), f);
    return { memo: r.reasoning, actions: r.actions };
  } catch {
    return { error: "That isn't valid JSON." };
  }
}

function Verifier() {
  const params = useSearchParams();
  const router = useRouter();
  const [input, setInput] = useState(params.get("tx") ?? "");
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [memoText, setMemoText] = useState("");

  const run = async (hash: string) => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return setError("A transaction hash is 0x followed by 64 hex characters.");
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await verifyAction(publicClient as never, DEPLOYMENT.factory, hash as Hash));
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0]! : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const tx = params.get("tx");
    if (tx) void run(tx);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const memoCheck = found && memoText.trim() ? checkPasted(memoText, found) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pt-10">
      <PageHeader
        title="Verify a manager action"
        lead="Every move the AI manager makes commits a fingerprint of its written reasoning and the model it ran on. Paste a transaction to check where it came from and what it committed to. Nothing here trusts Plenum's servers: every answer is read from Monad testnet."
      />

      <Card>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            router.replace(`/verify?tx=${input.trim()}`);
            void run(input.trim());
          }}
        >
          <div className="flex-1">
            <Field label="Transaction hash">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x…" spellCheck={false} className={`${inputClass} font-mono text-sm`} />
            </Field>
          </div>
          <Button busy={busy} type="submit">
            <MagnifyingGlass size={16} /> Verify
          </Button>
        </form>
        {error ? (
          <div className="mt-4">
            <Notice tone="bad">{error}</Notice>
          </div>
        ) : null}
      </Card>

      {found ? (
        <>
          <Card className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Group</p>
                <p className="font-display text-xl font-semibold tracking-tight">{found.groupName}</p>
                <Address value={found.plenum} />
              </div>
              <ReasonChip reason={found.reason} />
            </div>
            <ul className="space-y-2 text-sm">
              <Check ok={found.factoryClone}>Sent by a ManagerGateway made by the Plenum factory (its bytecode points at the factory's implementation)</Check>
              <Check ok={found.linked}>That group names this gateway as its manager gateway</Check>
            </ul>
            <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
              <Row label="Model">{found.modelId}</Row>
              <Row label="When">
                {new Date(found.timestamp * 1000).toUTCString()} · block {found.block.toString()}
              </Row>
              <Row label="Reasoning fingerprint" mono>
                {found.rationaleHash}
              </Row>
              <Row label="Actions fingerprint" mono>
                {found.actionsHash}
              </Row>
            </dl>
            <TxLink hash={input.trim()}>View on MonadVision</TxLink>
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="font-medium">Check the reasoning</p>
              <p className="mt-1 text-sm text-muted">
                Members read the memo decrypted with their passkey. Anyone holding a copy can paste it here: it is hashed the same way the manager hashed it before
                committing.
              </p>
            </div>
            <MemoView rationaleHash={found.rationaleHash} manager={found.manager} />
            <Field label="Memo JSON">
              <textarea value={memoText} onChange={(e) => setMemoText(e.target.value)} rows={6} spellCheck={false} placeholder='{"observations": [...], "actions": [...], ...}' className={`${inputClass} font-mono text-xs`} />
            </Field>
            {memoCheck ? (
              "error" in memoCheck ? (
                <Notice tone="bad">{memoCheck.error}</Notice>
              ) : (
                <ul className="space-y-2 text-sm">
                  <Seal ok={memoCheck.memo}>{memoCheck.memo ? "This memo matches the onchain reasoning fingerprint." : "This memo does not match the onchain reasoning fingerprint."}</Seal>
                  {memoCheck.actions !== null ? (
                    <Seal ok={memoCheck.actions}>
                      {memoCheck.actions ? "The actions in the memo are exactly the actions sent onchain." : "The actions in the memo differ from the actions sent onchain."}
                    </Seal>
                  ) : null}
                </ul>
              )
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle : XCircle;
  return (
    <li className="flex gap-2 leading-snug">
      <Icon size={18} weight="fill" className={`mt-px shrink-0 ${ok ? "text-accent" : "text-bad"}`} />
      <span className={ok ? "" : "text-bad"}>{children}</span>
    </li>
  );
}

function Seal({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? SealCheck : SealWarning;
  return (
    <li className={`flex gap-2 leading-snug ${ok ? "text-accent" : "text-bad"}`}>
      <Icon size={18} weight="fill" className="mt-px shrink-0" />
      {children}
    </li>
  );
}

function Row({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 break-all ${mono ? "font-mono text-xs" : ""}`}>{children}</dd>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <Verifier />
    </Suspense>
  );
}
