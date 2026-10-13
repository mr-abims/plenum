"use client";

import { useEffect, useState } from "react";
import type { Address as Addr, Hash } from "viem";
import { IdentificationCard, ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { ERC8004, erc8004ReputationRegistryAbi, plenumAbi } from "@plenum/abis";
import { PasskeySheet } from "@/components/PasskeySheet";
import { TxSteps } from "@/components/TxSteps";
import { confirmWithPasskey } from "@/lib/account";
import { publicClient, send } from "@/lib/chain";
import { DEPLOYMENT } from "@/lib/config";
import type { PlenumState } from "@/lib/plenum";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/useTx";

export const AGENT_ID = DEPLOYMENT.managerAgentId;
const TAG = "plenum";

export interface Summary {
  count: number;
  /** Average score 0-100. */
  score: number;
}

/**
 * The manager's ERC-8004 reputation as seen by this group: getSummary counts only feedback from the group's own
 * members, who were each invited by a member and have money in the group, so outside accounts can't inflate or sink it.
 */
export async function loadReputation(p: PlenumState): Promise<Summary | null> {
  if (AGENT_ID === undefined) return null;
  const members = (await publicClient.readContract({ address: p.address, abi: plenumAbi, functionName: "members" })) as readonly Addr[];
  if (members.length === 0) return { count: 0, score: 0 };
  const [count, value, decimals] = await publicClient.readContract({
    address: ERC8004.reputationRegistry,
    abi: erc8004ReputationRegistryAbi,
    functionName: "getSummary",
    args: [BigInt(AGENT_ID), members, TAG, ""],
  });
  return { count: Number(count), score: Number(value) / 10 ** decimals };
}

export function AgentIdentity({ summary }: { summary: Summary | null }) {
  if (AGENT_ID === undefined) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <a href="/agents/plenum-manager.json" target="_blank" className="inline-flex items-center gap-1.5 font-mono transition hover:text-accent">
        <IdentificationCard size={14} /> ERC-8004 agent #{AGENT_ID}
      </a>
      {summary ? (
        <span>
          {summary.count === 0
            ? "No ratings from members yet"
            : `Rated ${Math.round(summary.score)}/100 from ${summary.count} member rating${summary.count === 1 ? "" : "s"}`}
        </span>
      ) : null}
    </div>
  );
}

/** One passkey transaction: a member rates one manager action, pointing at its fingerprint and verifier page. */
export function RateAction({ p, txHash, rationaleHash, escalation, onRated }: { p: PlenumState; txHash: string; rationaleHash: string; escalation: boolean; onRated: () => void }) {
  const { session } = useSession();
  const tx = useTx();
  const [member, setMember] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!session || AGENT_ID === undefined) return;
    publicClient
      .readContract({ address: p.address, abi: plenumAbi, functionName: "isMember", args: [session.account.address] })
      .then((m) => setMember(Boolean(m)))
      .catch(() => undefined);
  }, [session, p.address]);

  if (!session || !member || AGENT_ID === undefined) return null;

  const rate = async (value: number) => {
    const ok = await tx.run([
      { label: "Confirm it's you", kind: "passkey", run: () => confirmWithPasskey(session.account.address) },
      {
        label: "Record your rating on the manager's ERC-8004 identity",
        run: (sent) =>
          send(
            session.account,
            {
              address: ERC8004.reputationRegistry,
              abi: erc8004ReputationRegistryAbi,
              functionName: "giveFeedback",
              args: [BigInt(AGENT_ID), BigInt(value), 0, TAG, escalation ? "escalation" : "rebalance", `${location.origin}/g/${p.address}`, `${location.origin}/verify?tx=${txHash}`, rationaleHash as Hash],
            },
            sent,
          ),
      },
    ]);
    if (ok) {
      setDone(true);
      onRated();
    }
  };

  if (done) return <p className="mt-3 text-xs text-accent">Thanks. Your rating is onchain.</p>;
  return (
    <div className="mt-3 space-y-2">
      <PasskeySheet open={tx.passkey} action="Rating the manager" />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>Was this a good call?</span>
        <button disabled={tx.busy} onClick={() => rate(100)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 transition hover:border-accent hover:text-accent disabled:opacity-50">
          <ThumbsUp size={13} /> Good
        </button>
        <button disabled={tx.busy} onClick={() => rate(0)} className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 transition hover:border-bad hover:text-bad disabled:opacity-50">
          <ThumbsDown size={13} /> Poor
        </button>
      </div>
      {tx.steps.length ? <TxSteps steps={tx.steps} error={tx.error} /> : null}
    </div>
  );
}
