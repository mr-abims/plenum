"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { keccak256, toHex, type Address } from "viem";
import { Eye, Key, LockKey, LockKeyOpen, Robot, ShieldCheck, Trash } from "@phosphor-icons/react";
import { consentRegistryAbi } from "@plenum/abis";
import { addReader, bytes32ToPublicKey, decryptDocument, encryptDocument, revokeReader, shred, type Envelope } from "@plenum/crypto";
import { remaining, TimeRing } from "@/components/Countdown";
import { PasskeySheet } from "@/components/PasskeySheet";
import { SkeletonPanel } from "@/components/Skeleton";
import { TxSteps } from "@/components/TxSteps";
import { Button, Card, Chip, Notice, PageHeader, inputClass } from "@/components/ui";
import { confirmWithPasskey } from "@/lib/account";
import { deleteBlob, getBlob, putBlob, riskDocId } from "@/lib/blobs";
import { publicClient, send } from "@/lib/chain";
import { DEPLOYMENT, MANAGER_ENC_PUBKEY } from "@/lib/config";
import { inTimeZone } from "@/lib/format";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";
import { useTx } from "@/lib/useTx";

interface Grant {
  id: bigint;
  expiry: number;
  active: boolean;
}

const GRANT_SECONDS = 24 * 3600;

export default function DataRoomPage() {
  const { plenum } = useParams<{ plenum: Address }>();
  const { state: p, position } = usePlenum(plenum);
  const { session, profile } = useSession();
  const [text, setText] = useState("");
  const [env, setEnv] = useState<Envelope | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [action, setAction] = useState<string>("");
  const tx = useTx();

  const docId = session ? riskDocId(plenum, session.account.address) : "";
  const managerKey = MANAGER_ENC_PUBKEY ? bytes32ToPublicKey(MANAGER_ENC_PUBKEY) : undefined;

  const load = useCallback(async () => {
    if (!session || !p) return;
    const e = await getBlob(docId).catch(() => undefined);
    setEnv(e ?? null);
    if (e) setText(new TextDecoder().decode(await decryptDocument(e, session.encryption)));
    const reg = { address: DEPLOYMENT.consentRegistry, abi: consentRegistryAbi } as const;
    const ids = await publicClient.readContract({ ...reg, functionName: "grantIdsOf", args: [session.account.address] });
    const rows = await Promise.all(
      ids.map(async (id) => {
        const [, grantee, , expiry] = await publicClient.readContract({ ...reg, functionName: "grants", args: [id] });
        const active = await publicClient.readContract({ ...reg, functionName: "isActive", args: [id] });
        return { id, expiry: Number(expiry), active, grantee };
      }),
    );
    setGrants(rows.filter((r) => r.grantee.toLowerCase() === p.manager.toLowerCase()));
    setLoaded(true);
  }, [session, p?.manager, docId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => void load(), [load]);

  if (!session || (p && position && !position.isMember))
    return (
      <div className="rounded-[20px] border border-dashed border-line-strong p-10 text-center">
        <LockKey size={32} weight="light" className="mx-auto text-faint" />
        <p className="mt-3 font-medium">Members only</p>
        <p className="mt-1 text-sm text-muted">Sign in as a member of this group to use its data room.</p>
      </div>
    );
  if (!p || !position) return <SkeletonPanel lines={5} />;
  const activeGrant = grants.find((g) => g.active);
  const s = session;

  const run = async (label: string, steps: Parameters<typeof tx.run>[0], done: string) => {
    setAction(label);
    setMsg(null);
    if (await tx.run(steps)) {
      setMsg(done);
      await load();
    }
  };

  const save = () =>
    run(
      "save",
      [
        {
          label: "Encrypt on this device and store",
          kind: "work",
          run: async () => {
            const readers = [s.encryption.publicKey, ...(activeGrant && managerKey ? [managerKey] : [])];
            await putBlob(s.account, docId, await encryptDocument(docId, new TextEncoder().encode(text), readers));
          },
        },
      ],
      "Saved. The storage server only holds scrambled bytes.",
    );

  const grant = () =>
    run(
      "grant",
      [
        { label: "Confirm it's you", kind: "passkey", run: () => confirmWithPasskey(s.account.address) },
        { label: "Give the manager a copy of the document key", kind: "work", run: async () => putBlob(s.account, docId, await addReader(env!, s.encryption, managerKey!)) },
        {
          label: "Record your consent onchain for 24 hours",
          run: (sent) => {
            const expiry = BigInt(Math.floor(Date.now() / 1000) + GRANT_SECONDS);
            return send(s.account, { address: DEPLOYMENT.consentRegistry, abi: consentRegistryAbi, functionName: "grant", args: [p.manager, keccak256(toHex(docId)), expiry] }, sent);
          },
        },
      ],
      "Shared for 24 hours. The manager checks your consent onchain before every read.",
    );

  const revoke = () =>
    run(
      "revoke",
      [
        { label: "Confirm it's you", kind: "passkey", run: () => confirmWithPasskey(s.account.address) },
        { label: "Re-lock the document with a new key", kind: "work", run: async () => (env && managerKey ? putBlob(s.account, docId, await revokeReader(env, s.encryption, managerKey)) : undefined) },
        { label: "Withdraw consent onchain", run: (sent) => send(s.account, { address: DEPLOYMENT.consentRegistry, abi: consentRegistryAbi, functionName: "revoke", args: [activeGrant!.id] }, sent) },
      ],
      "Withdrawn. The manager can no longer read it.",
    );

  const erase = () =>
    run(
      "erase",
      [
        { label: "Confirm it's you", kind: "passkey", run: () => confirmWithPasskey(s.account.address) },
        {
          label: "Delete every key, then the document",
          kind: "work",
          run: async () => {
            await putBlob(s.account, docId, shred(env!));
            await deleteBlob(s.account, docId);
            setText("");
          },
        },
      ],
      "Erased. Every key to this document was destroyed, so even old copies are unreadable.",
    );

  return (
    <div className="space-y-8">
      <PasskeySheet open={tx.passkey} action={action === "grant" ? "Sharing with the manager" : action === "revoke" ? "Withdrawing permission" : "Erasing your document"} />
      <PageHeader
        title="Your data, your keys"
        lead="Documents are encrypted on this device with a key only your passkey can produce. You decide if, and for how long, the AI manager may read them."
      />

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`grid size-11 place-items-center rounded-2xl border ${activeGrant ? "border-info/30 bg-info/10 text-info" : "border-line-strong bg-sunk text-accent"}`}>
                {activeGrant ? <LockKeyOpen size={22} /> : <LockKey size={22} />}
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold tracking-tight">Your risk profile</h2>
                <p className="text-xs text-muted">{env ? "Encrypted and stored" : loaded ? "Not written yet" : "Loading…"}</p>
              </div>
            </div>
            {activeGrant ? <Chip tone="info" icon={<Eye size={13} />}>Manager can read</Chip> : <Chip icon={<LockKey size={13} />}>Private</Chip>}
          </div>
          <textarea
            className={`${inputClass} min-h-40 leading-relaxed`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="How much risk you're comfortable with, when you might need money back, anything the manager should know."
            aria-label="Your risk profile"
          />
          <div className="flex flex-wrap gap-3">
            <Button busy={tx.busy && action === "save"} disabled={!text.trim() || tx.busy} onClick={save}>
              <LockKey size={16} /> Save encrypted
            </Button>
            {env ? (
              <Button variant="ghost" busy={tx.busy && action === "erase"} disabled={tx.busy} onClick={erase} className="text-bad! hover:bg-bad/10!">
                <Trash size={16} /> Erase for good
              </Button>
            ) : null}
          </div>
          {action === "save" || action === "erase" ? <TxSteps steps={tx.steps} error={tx.error} /> : null}
        </Card>

        <Card className={`flex flex-col ${activeGrant ? "border-info/30" : ""}`}>
          <div className="flex items-start gap-4">
            <div className="relative grid size-14 shrink-0 place-items-center">
              {activeGrant ? (
                <span className="absolute inset-0">
                  <TimeRing start={activeGrant.expiry - GRANT_SECONDS} end={activeGrant.expiry} size={56} />
                </span>
              ) : null}
              <Robot size={24} className={activeGrant ? "text-info" : "text-muted"} />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight">{activeGrant ? "The manager holds a key" : "Lend the manager a key"}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {activeGrant
                  ? `Until ${inTimeZone(activeGrant.expiry, profile.timeZone)} (${remaining(activeGrant.expiry - Date.now() / 1000)}). Withdrawing re-locks the document with a new key.`
                  : "For 24 hours the manager can take your situation into account. Your consent is recorded onchain and checked before every read."}
              </p>
            </div>
          </div>
          <ul className="mt-6 space-y-2.5 text-sm text-muted">
            <li className="flex gap-2.5">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" /> Only the risk profile is shared, nothing else
            </li>
            <li className="flex gap-2.5">
              <Key size={16} className="mt-0.5 shrink-0 text-accent" /> It expires by itself; you can withdraw sooner
            </li>
          </ul>
          <div className="mt-auto space-y-4 pt-6">
            {!managerKey ? <Notice tone="warn">The manager's data-room key isn't configured yet (NEXT_PUBLIC_MANAGER_ENC_PUBKEY).</Notice> : null}
            {!activeGrant ? (
              <Button busy={tx.busy && action === "grant"} disabled={!env || !managerKey || tx.busy} onClick={grant} className="w-full">
                Share for 24 hours
              </Button>
            ) : (
              <Button variant="danger" busy={tx.busy && action === "revoke"} disabled={tx.busy} onClick={revoke} className="w-full">
                Withdraw permission
              </Button>
            )}
            {!env && !activeGrant ? <p className="text-xs text-muted">Save your risk profile first.</p> : null}
            {action === "grant" || action === "revoke" ? <TxSteps steps={tx.steps} error={tx.error} /> : null}
          </div>
        </Card>
      </div>

      <AnimatePresence>
        {msg ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <Notice tone="ok">{msg}</Notice>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
