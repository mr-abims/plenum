"use client";

import { useEffect, useState } from "react";
import { canonicalJson as canonical, decryptDocument, memoDocId } from "@plenum/crypto";
import { keccak256, toHex } from "viem";
import { getBlob } from "@/lib/blobs";
import { adapterName } from "@/lib/config";
import { money } from "@/lib/format";
import { useSession } from "@/lib/session";

interface Memo {
  observations: string[];
  actions: { adapter: string; op: string; assets: string }[];
  risks: string[];
  mandateCheck: string;
  modelId: string;
  promptVersion: string;
}

/** Decrypts the manager's memo with the member's own data-room key and checks it against the onchain hash. */
export function MemoView({ rationaleHash, manager }: { rationaleHash: string; manager: string }) {
  const { session } = useSession();
  const [memo, setMemo] = useState<Memo | null>(null);
  const [verified, setVerified] = useState(false);
  const [state, setState] = useState<"loading" | "missing" | "locked" | "ok">("loading");

  useEffect(() => {
    if (!session) return;
    let live = true;
    void (async () => {
      const env = await getBlob(memoDocId(rationaleHash, manager)).catch(() => undefined);
      if (!env) return live && setState("missing");
      try {
        const text = new TextDecoder().decode(await decryptDocument(env, session.encryption));
        const parsed = JSON.parse(text) as Memo;
        if (!live) return;
        setMemo(parsed);
        setVerified(keccak256(toHex(canonical(parsed))) === rationaleHash);
        setState("ok");
      } catch {
        if (live) setState("locked");
      }
    })();
    return () => {
      live = false;
    };
  }, [session, rationaleHash, manager]);

  if (!session || state === "loading") return null;
  if (state === "missing") return <p className="text-xs text-muted">The full reasoning wasn't published to the data room.</p>;
  if (state === "locked") return <p className="text-xs text-muted">The reasoning is encrypted to members who had joined at the time.</p>;
  return (
    <details className="mt-3 rounded-xl bg-paper p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Read the manager's reasoning {verified ? <span className="text-ok">· matches the onchain fingerprint</span> : <span className="text-bad">· does not match</span>}
      </summary>
      <div className="mt-3 space-y-3">
        <ul className="list-disc space-y-1 pl-5">{memo!.observations.map((o, i) => <li key={i}>{o}</li>)}</ul>
        <ul className="space-y-1">
          {memo!.actions.map((a, i) => (
            <li key={i}>
              {a.op} {adapterName(a.adapter)}: {money(BigInt(a.assets))}
            </li>
          ))}
        </ul>
        {memo!.risks.length ? <p className="text-muted">Risks: {memo!.risks.join("; ")}</p> : null}
      </div>
    </details>
  );
}
