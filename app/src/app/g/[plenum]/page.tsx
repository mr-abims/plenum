"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { erc20Abi, isAddress, zeroAddress, type Address } from "viem";
import { plenumAbi } from "@plenum/abis";
import { Allocation } from "@/components/Allocation";
import { NavBadge } from "@/components/NavBadge";
import { Button, Card, Eyebrow, Field, H1, Notice, inputClass } from "@/components/ui";
import { send } from "@/lib/chain";
import { DEPLOYMENT } from "@/lib/config";
import { money, parseUsd, pct } from "@/lib/format";
import { inviteLink, signInvite } from "@/lib/invite";
import { UNIT } from "@/lib/plenum";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";

function Home() {
  const { plenum } = useParams<{ plenum: Address }>();
  const created = useSearchParams().get("created");
  const { session, profile, rate } = useSession();
  const { state: p, position, error, refresh } = usePlenum(plenum);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [link, setLink] = useState("");
  const [invitee, setInvitee] = useState("");

  if (error) return <Notice tone="bad">Couldn't load this group: {error}</Notice>;
  if (!p) return <p className="text-muted">Loading…</p>;

  const local = (x: bigint) => money(x, profile.currency, rate);
  const usd = (x: bigint) => money(x, "USD");
  const showLocal = profile.currency !== "USD";

  async function act(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const text = await fn();
      setMsg({ tone: "ok", text: text || "Done." });
      setAmount("");
      await refresh();
    } catch (err) {
      setMsg({ tone: "bad", text: err instanceof Error ? err.message.split("\n")[0]! : String(err) });
    } finally {
      setBusy(null);
    }
  }

  const contribute = () =>
    act("contribute", async () => {
      if (!session || !p) return;
      const assets = parseUsd(amount);
      await send(session.account, { address: DEPLOYMENT.aToken, abi: erc20Abi, functionName: "approve", args: [p.address, assets] });
      await send(session.account, { address: p.address, abi: plenumAbi, functionName: "contribute", args: [assets] });
      return `Contributed ${usd(assets)}.`;
    });

  const redeem = () =>
    act("redeem", async () => {
      if (!session || !p || !position) return;
      const assets = parseUsd(amount);
      const units = position.value === 0n ? 0n : (assets * position.units) / position.value;
      if (units === 0n || units > position.units) throw new Error("That's more than your share.");
      await send(session.account, { address: p.address, abi: plenumAbi, functionName: "redeem", args: [units, session.account.address] });
      return `Requested ${usd(assets)} back to your account.`;
    });

  return (
    <div className="space-y-6">
      {created ? <Notice tone="ok">Your group is ready. Invite members below, then contribute.</Notice> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Group</Eyebrow>
          <H1>{p.name}</H1>
          <p className="mt-2 text-sm text-muted">
            {p.memberCount} member{p.memberCount === 1 ? "" : "s"} · {p.paused ? "Manager paused" : "Manager active"}
          </p>
        </div>
        <NavBadge p={p} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-sm text-muted">Total value</p>
          <p className="mt-1 font-display text-5xl tabular">{showLocal ? local(p.total) : usd(p.total)}</p>
          {showLocal ? <p className="mt-1 text-sm text-muted tabular">{usd(p.total)} · {profile.currency} at an indicative rate</p> : null}
        </Card>
        <Card>
          <p className="text-sm text-muted">Your share</p>
          {position?.isMember ? (
            <>
              <p className="mt-1 font-display text-5xl tabular">{showLocal ? local(position.value) : usd(position.value)}</p>
              <p className="mt-1 text-sm text-muted tabular">
                {showLocal ? `${usd(position.value)} · ` : ""}
                {pct(position.shareBps)} of the group · {(Number(position.units) / Number(UNIT)).toFixed(2)} units
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{session ? "You're not a member of this group." : "Sign in to see your share."}</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 font-medium">Where the money is</h2>
        <Allocation p={p} />
        <p className="mt-4 text-xs text-muted">Shaded areas show what the group's rules allow. Assets are <span className="text-mock">MOCK</span> testnet funds.</p>
      </Card>

      {position?.isMember && session ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-4">
            <h2 className="font-medium">Add or take out money</h2>
            <Field label="Amount in USD" hint={`In your account: ${usd(position.balance)}. Units are priced at the latest independent valuation.`}>
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250" />
            </Field>
            <div className="flex flex-wrap gap-3">
              <Button busy={busy === "contribute"} disabled={!amount || !!busy} onClick={contribute}>
                Contribute
              </Button>
              <Button variant="secondary" busy={busy === "redeem"} disabled={!amount || !!busy || position.units === 0n} onClick={redeem}>
                Take out
              </Button>
            </div>
            {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          </Card>
          <Card className="space-y-4">
            <h2 className="font-medium">Invite a member</h2>
            <p className="text-sm text-muted">The link works once and expires in 7 days. Only verified people can use it.</p>
            <Field label="Their account ID (optional)" hint="Leave empty for a link anyone verified can use once.">
              <input className={inputClass} value={invitee} onChange={(e) => setInvitee(e.target.value.trim())} placeholder="0x…" />
            </Field>
            <Button
              variant="secondary"
              busy={busy === "invite"}
              disabled={invitee !== "" && !isAddress(invitee)}
              onClick={() =>
                act("invite", async () => {
                  const i = await signInvite(session.account, p.address, invitee ? (invitee as Address) : zeroAddress);
                  setLink(inviteLink(location.origin, i));
                  return "Invite link ready.";
                })
              }
            >
              Create invite link
            </Button>
            {link ? (
              <div className="flex gap-2">
                <input readOnly className={`${inputClass} text-xs`} value={link} />
                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(link)}>
                  Copy
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
