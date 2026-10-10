"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, MagnifyingGlass, SealCheck, SealWarning, XCircle } from "@phosphor-icons/react";
import { canonicalJson } from "@plenum/crypto";
import { managerGatewayAbi, plenumAbi, plenumFactoryAbi, REASONS } from "@plenum/abis";
import { decodeEventLog, encodeAbiParameters, keccak256, toHex, type Address as Addr, type Hash } from "viem";
import { Address } from "@/components/Address";
import { MemoView } from "@/components/MemoView";
import { ReasonChip } from "@/components/ReasonChip";
import { Button, Card, Field, Notice, PageHeader, TxLink, inputClass } from "@/components/ui";
import { publicClient } from "@/lib/chain";
import { DEPLOYMENT } from "@/lib/config";
import { modelName } from "@/lib/feedText";

const OPS = ["Deposit", "Withdraw", "RequestRedeem", "Claim"] as const;
const ACTIONS_TYPE = [
  {
    type: "tuple[]",
    components: [
      { name: "adapter", type: "address" },
      { name: "op", type: "uint8" },
      { name: "assets", type: "uint256" },
    ],
  },
] as const;

interface Found {
  gateway: Addr;
  plenum: Addr;
  groupName: string;
  manager: Addr;
  actionsHash: Hash;
  rationaleHash: Hash;
  modelId: Hash;
  reason: string;
  block: bigint;
  timestamp: number;
  /** The emitter is a ManagerGateway clone made by the Plenum factory, and its group points back at it. */
  genuine: { factoryClone: boolean; linked: boolean };
}

/** EIP-1167 minimal proxy runtime code: the implementation address sits at bytes 10..30. */
const cloneOf = (code: string | undefined) =>
  code && /^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/i.test(code) ? (`0x${code.slice(22, 62)}` as Addr) : undefined;

async function inspect(hash: Hash): Promise<Found> {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  for (const log of receipt.logs) {
    let ev;
    try {
      ev = decodeEventLog({ abi: managerGatewayAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (ev.eventName !== "ManagerAction") continue;
    const a = ev.args as { actionsHash: Hash; rationaleHash: Hash; modelId: Hash; reason: number };
    const gateway = log.address;
    const read = <T,>(address: Addr, abi: readonly unknown[], functionName: string) =>
      publicClient.readContract({ address, abi, functionName } as never) as Promise<T>;
    const [plenum, manager, code, impl, block] = await Promise.all([
      read<Addr>(gateway, managerGatewayAbi, "plenum"),
      read<Addr>(gateway, managerGatewayAbi, "manager"),
      publicClient.getCode({ address: gateway }),
      read<Addr>(DEPLOYMENT.factory, plenumFactoryAbi, "gatewayImpl"),
      publicClient.getBlock({ blockNumber: receipt.blockNumber }),
    ]);
    const [groupName, backLink] = await Promise.all([read<string>(plenum, plenumAbi, "name"), read<Addr>(plenum, plenumAbi, "gateway")]);
    return {
      gateway,
      plenum,
      groupName,
      manager,
      ...a,
      reason: REASONS[a.reason] ?? String(a.reason),
      block: receipt.blockNumber,
      timestamp: Number(block.timestamp),
      genuine: {
        factoryClone: cloneOf(code)?.toLowerCase() === impl.toLowerCase(),
        linked: backLink.toLowerCase() === gateway.toLowerCase(),
      },
    };
  }
  throw new Error("This transaction has no ManagerAction event. Paste the hash of a manager action or escalation.");
}

type MemoCheck = { memo: boolean; actions: boolean | null } | { error: string };

/** Hashes a pasted memo the way the manager does (canonical JSON, keccak256) and its actions the way the gateway does. */
function checkMemo(text: string, f: Found): MemoCheck {
  let memo: { actions?: { adapter: string; op: string; assets: string }[] };
  try {
    memo = JSON.parse(text);
  } catch {
    return { error: "That isn't valid JSON." };
  }
  const memoOk = keccak256(toHex(canonicalJson(memo))) === f.rationaleHash;
  let actionsOk: boolean | null = null;
  try {
    if (memo.actions) {
      const encoded = encodeAbiParameters(ACTIONS_TYPE, [
        memo.actions.map((x) => ({ adapter: x.adapter as Addr, op: OPS.indexOf(x.op as (typeof OPS)[number]), assets: BigInt(x.assets) })),
      ]);
      actionsOk = keccak256(encoded) === f.actionsHash;
    }
  } catch {
    actionsOk = false;
  }
  return { memo: memoOk, actions: actionsOk };
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
      setFound(await inspect(hash as Hash));
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

  const memoCheck = found && memoText.trim() ? checkMemo(memoText, found) : null;

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
              <Check ok={found.genuine.factoryClone}>Sent by a ManagerGateway made by the Plenum factory (its bytecode points at the factory's implementation)</Check>
              <Check ok={found.genuine.linked}>That group names this gateway as its manager gateway</Check>
            </ul>
            <dl className="grid gap-x-6 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
              <Row label="Model">{modelName(found.modelId)}</Row>
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
