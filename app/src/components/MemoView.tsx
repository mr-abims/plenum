"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretDown, LockSimple, SealCheck, SealWarning } from "@phosphor-icons/react";
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

const OP_WORDS: Record<string, string> = { Deposit: "Buy", Withdraw: "Sell", RequestRedeem: "Start selling", Claim: "Collect proceeds from" };

/** Decrypts the manager's memo with the member's own data-room key and checks it against the onchain hash. */
export function MemoView({ rationaleHash, manager }: { rationaleHash: string; manager: string }) {
  const { session } = useSession();
  const reduce = useReducedMotion();
  const [memo, setMemo] = useState<Memo | null>(null);
  const [verified, setVerified] = useState(false);
  const [state, setState] = useState<"loading" | "missing" | "locked" | "ok">("loading");
  const [open, setOpen] = useState(false);

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

  if (!session) return <Hint>Sign in as a member to read the manager's reasoning. It's encrypted to members only.</Hint>;
  if (state === "loading") return null;
  if (state === "missing") return <Hint>The full reasoning wasn't published to the data room.</Hint>;
  if (state === "locked") return <Hint>The reasoning is encrypted to members who had joined at the time.</Hint>;

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-sunk">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-well">
        <span className="font-medium">Read the reasoning</span>
        {verified ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-accent">
            <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 14 }}>
              <SealCheck size={16} weight="fill" />
            </motion.span>
            matches the onchain fingerprint
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-bad">
            <SealWarning size={16} weight="fill" /> does not match the onchain fingerprint
          </span>
        )}
        <CaretDown size={14} className={`ml-auto text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="grid gap-5 border-t border-line px-4 py-4 text-sm sm:grid-cols-2">
              <Section title="What it saw">
                <ul className="space-y-1.5">
                  {memo!.observations.map((o, i) => (
                    <li key={i} className="leading-relaxed">{o}</li>
                  ))}
                </ul>
              </Section>
              <Section title="What it proposed">
                <ul className="space-y-1.5">
                  {memo!.actions.map((a, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>
                        {OP_WORDS[a.op] ?? a.op} {adapterName(a.adapter)}
                      </span>
                      <span className="font-mono tabular text-muted">{money(BigInt(a.assets))}</span>
                    </li>
                  ))}
                </ul>
                {memo!.mandateCheck ? <p className="mt-3 font-mono text-[11px] text-faint">self-check: {memo!.mandateCheck}</p> : null}
              </Section>
              {memo!.risks.length ? (
                <Section title="Risks it named" className="sm:col-span-2">
                  <ul className="space-y-1.5 text-muted">
                    {memo!.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </Section>
              ) : null}
              <p className="font-mono text-[11px] text-faint sm:col-span-2">
                model {memo!.modelId} · prompt {memo!.promptVersion}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-medium text-muted">{title}</p>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
      <LockSimple size={13} /> {children}
    </p>
  );
}
