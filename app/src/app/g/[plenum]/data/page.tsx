"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { decodeEventLog, keccak256, toHex, type Address } from "viem";
import { consentRegistryAbi } from "@plenum/abis";
import { addReader, bytes32ToPublicKey, decryptDocument, encryptDocument, revokeReader, shred, type Envelope } from "@plenum/crypto";
import { Badge, Button, Card, Eyebrow, H1, Notice, inputClass } from "@/components/ui";
import { confirmWithPasskey } from "@/lib/account";
import { deleteBlob, getBlob, putBlob, riskDocId } from "@/lib/blobs";
import { publicClient, send } from "@/lib/chain";
import { DEPLOYMENT, MANAGER_ENC_PUBKEY } from "@/lib/config";
import { inTimeZone } from "@/lib/format";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";

interface Grant {
  id: bigint;
  expiry: number;
  active: boolean;
}

export default function DataRoomPage() {
  const { plenum } = useParams<{ plenum: Address }>();
  const { state: p, position } = usePlenum(plenum);
  const { session, profile } = useSession();
  const [text, setText] = useState("");
  const [env, setEnv] = useState<Envelope | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

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
  }, [session, p?.manager, docId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => void load(), [load]);

  if (!session || !position?.isMember || !p) return <p className="text-muted">Sign in as a member to use the data room.</p>;
  const activeGrant = grants.find((g) => g.active);

  async function act(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setMsg(null);
    try {
      setMsg({ tone: "ok", text: await fn() });
      await load();
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error ? err.message.split("\n")[0]! : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const s = session;
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Data room</Eyebrow>
        <H1>Your data, your keys</H1>
        <p className="mt-3 max-w-2xl text-muted">
          Documents are encrypted on this device with a key that only your passkey can produce. The storage server only
          ever sees scrambled data. You decide if and for how long the AI manager may read them.
        </p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Your risk profile</h2>
          {activeGrant ? <Badge tone="ok">Shared with the manager until {inTimeZone(activeGrant.expiry, profile.timeZone)}</Badge> : <Badge>Private</Badge>}
        </div>
        <textarea
          className={`${inputClass} min-h-32`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="How much risk you're comfortable with, when you might need money back, anything the manager should know."
        />
        <div className="flex flex-wrap gap-3">
          <Button
            busy={busy === "save"}
            disabled={!text.trim() || !!busy}
            onClick={() =>
              act("save", async () => {
                const readers = [s.encryption.publicKey, ...(activeGrant && managerKey ? [managerKey] : [])];
                await putBlob(s.account, docId, await encryptDocument(docId, new TextEncoder().encode(text), readers));
                return "Saved, encrypted.";
              })
            }
          >
            Save encrypted
          </Button>
          {env ? (
            <Button
              variant="danger"
              busy={busy === "erase"}
              disabled={!!busy}
              onClick={() =>
                act("erase", async () => {
                  await confirmWithPasskey(s.account.address);
                  await putBlob(s.account, docId, shred(env));
                  await deleteBlob(s.account, docId);
                  setText("");
                  return "Erased: every key to this document was deleted.";
                })
              }
            >
              Erase
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-medium">Share with the AI manager</h2>
        <p className="text-sm text-muted">
          Sharing lets the manager take your situation into account for 24 hours. The permission is recorded onchain and the
          manager checks it before every read. Withdrawing it re-locks the document with a new key.
        </p>
        {!managerKey ? <Notice tone="warn">The manager's data-room key isn't configured yet (NEXT_PUBLIC_MANAGER_ENC_PUBKEY).</Notice> : null}
        <div className="flex flex-wrap gap-3">
          {!activeGrant ? (
            <Button
              busy={busy === "grant"}
              disabled={!env || !managerKey || !!busy}
              onClick={() =>
                act("grant", async () => {
                  await confirmWithPasskey(s.account.address);
                  await putBlob(s.account, docId, await addReader(env!, s.encryption, managerKey!));
                  const expiry = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);
                  const hash = await send(s.account, {
                    address: DEPLOYMENT.consentRegistry,
                    abi: consentRegistryAbi,
                    functionName: "grant",
                    args: [p.manager, keccak256(toHex(docId)), expiry],
                  });
                  const receipt = await publicClient.getTransactionReceipt({ hash });
                  const ev = receipt.logs
                    .map((l) => {
                      try {
                        return decodeEventLog({ abi: consentRegistryAbi, data: l.data, topics: l.topics });
                      } catch {
                        return undefined;
                      }
                    })
                    .find((e) => e?.eventName === "ConsentGranted");
                  return `Shared for 24 hours (grant ${ev && "id" in ev.args ? ev.args.id : "?"}).`;
                })
              }
            >
              Share for 24 hours
            </Button>
          ) : (
            <Button
              variant="danger"
              busy={busy === "revoke"}
              disabled={!!busy}
              onClick={() =>
                act("revoke", async () => {
                  await confirmWithPasskey(s.account.address);
                  if (env && managerKey) await putBlob(s.account, docId, await revokeReader(env, s.encryption, managerKey));
                  await send(s.account, { address: DEPLOYMENT.consentRegistry, abi: consentRegistryAbi, functionName: "revoke", args: [activeGrant.id] });
                  return "Withdrawn. The manager can no longer read it.";
                })
              }
            >
              Withdraw permission
            </Button>
          )}
        </div>
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      </Card>
    </div>
  );
}
