"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { erc20Abi, isAddress, zeroAddress, type Address } from "viem";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarBlank, CheckCircle, Copy, LinkSimple, ShareNetwork, SignOut } from "@phosphor-icons/react";
import { plenumAbi } from "@plenum/abis";
import { Allocation } from "@/components/Allocation";
import { ChamberDial, rowsFromPlenum } from "@/components/ChamberDial";
import { Money } from "@/components/Money";
import { ReasonChip } from "@/components/ReasonChip";
import { Skeleton, SkeletonPanel } from "@/components/Skeleton";
import { TxSteps } from "@/components/TxSteps";
import { Button, Card, Field, Notice, inputClass } from "@/components/ui";
import { send } from "@/lib/chain";
import { DEPLOYMENT } from "@/lib/config";
import { loadFeed, type FeedItem } from "@/lib/feed";
import { feedTitle } from "@/lib/feedText";
import { ago, duration, durationAdj, inTimeZone, money, parseUsd, pct, until } from "@/lib/format";
import { inviteLink, signInvite } from "@/lib/invite";
import { exitQuote, UNIT, type PlenumState } from "@/lib/plenum";
import { ensureFreshPrice, needsPrice } from "@/lib/price";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";
import { useTx } from "@/lib/useTx";

function Home() {
  const { plenum } = useParams<{ plenum: Address }>();
  const created = useSearchParams().get("created");
  const { session } = useSession();
  const { state: p, position, error, refresh } = usePlenum(plenum);

  if (error && !p) return <Notice tone="bad">Couldn't load this group: {error}</Notice>;
  if (!p)
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
          <SkeletonPanel lines={2} className="h-44" />
          <SkeletonPanel lines={2} className="h-44" />
        </div>
        <Skeleton className="h-96 rounded-[20px]!" />
      </div>
    );

  return (
    <div className="space-y-6">
      <AnimatePresence>{created ? <CreatedBanner personal={p.personal} /> : null}</AnimatePresence>

      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <Card className="relative overflow-hidden">
          <p className="text-[13px] text-muted">{p.personal ? "Portfolio value" : "Group value"}</p>
          <div className="mt-2">
            <Money amount={p.total} />
          </div>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 font-mono text-xs text-muted tabular">
            <span>
              {p.memberCount} member{p.memberCount === 1 ? "" : "s"}
            </span>
            <span>{(Number(p.totalUnits) / Number(UNIT)).toLocaleString(undefined, { maximumFractionDigits: 2 })} units</span>
            <span>{p.nav.timestamp ? `priced ${ago(p.nav.ageSeconds)}` : "not priced yet"}</span>
          </div>
        </Card>
        <Card>
          <p className="text-[13px] text-muted">Your share</p>
          {position?.isMember ? (
            <>
              <div className="mt-2">
                <Money amount={position.value} />
              </div>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 font-mono text-xs text-muted tabular">
                {p.personal ? null : <span>{pct(position.shareBps)} of the group</span>}
                <span>{(Number(position.units) / Number(UNIT)).toFixed(2)} units</span>
              </div>
            </>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-relaxed text-muted">{session ? "You're not a member of this group. Ask a member for an invite link." : "Sign in with your passkey to see your share."}</p>
              {!session ? (
                <Link href={`/start?next=/g/${plenum}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm transition hover:border-accent hover:text-accent">
                  Sign in <ArrowRight size={15} />
                </Link>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      <Card className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
        <div className="mx-auto w-full max-w-[440px]">
          <ChamberDial rows={rowsFromPlenum(p)} seats={p.memberCount}>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{p.sleeves.every((s) => s.inBand) && p.cashBps >= p.minLiquidityBps ? "All in range" : "Drift"}</p>
            <p className="mt-1 text-xs leading-snug text-muted">{p.sleeves.filter((s) => !s.inBand).length ? "the manager may correct it step by step" : "inside the group's rules"}</p>
          </ChamberDial>
        </div>
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">Where the money is</h2>
          <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">Shaded ranges are what the group's rules allow. The manager may only trade inside them without asking you.</p>
          <Allocation p={p} />
        </div>
      </Card>

      {p.v2 && (p.periodLength > 0 || p.pendingChange) ? <PeriodCard p={p} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {position?.isMember && session ? <MoneyPanel plenum={plenum} /> : null}
        <LatestFromManager plenum={plenum} />
      </div>

      {position?.isMember && session && !p.personal ? <InvitePanel plenum={plenum} highlight={!!created} onDone={refresh} /> : null}
    </div>
  );
}

function CreatedBanner({ personal }: { personal: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-4 rounded-[20px] border border-accent/30 bg-accent-soft p-5">
      <CheckCircle size={28} weight="fill" className="text-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Your {personal ? "portfolio" : "group"} is live on Monad.</p>
        <p className="text-sm text-muted">
          {personal ? "Next: make your first contribution below." : "Next: invite the people you invest with, then make the first contribution."}
        </p>
      </div>
      {personal ? null : (
        <a href="#invite" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-ink">
          Invite members <ArrowRight size={15} />
        </a>
      )}
    </motion.div>
  );
}

/** Investment period status (SPEC A26): when the period ends, whether leaving is free right now, and why. */
function PeriodCard({ p }: { p: PlenumState }) {
  const free = p.exitFeeNowBps === 0;
  const windowOpen = free && !p.pendingChange && p.periodLength > 0;
  const windowCloses = windowOpen ? p.nextPeriodEnd - p.periodLength + p.exitWindow : 0;
  return (
    <Card className="flex flex-wrap items-start gap-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl border ${free ? "border-accent/40 bg-accent-soft text-accent" : "border-line bg-sunk text-muted"}`}>
        <CalendarBlank size={18} />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">
          {p.pendingChange
            ? `Leaving is free until the new rules apply (${until(p.pendingChange.eta, p.now)})`
            : windowOpen
              ? `Free exit window is open: closes ${until(windowCloses, p.now)}`
              : `This period ends ${until(p.nextPeriodEnd, p.now)}`}
        </p>
        <p className="text-sm leading-relaxed text-muted">
          {p.periodLength > 0
            ? `Money is invested in ${durationAdj(p.periodLength)} periods that renew on their own. For ${duration(p.exitWindow)} after each period ends, anyone can leave free of charge; otherwise leaving costs ${pct(p.earlyExitFeeBps, p.earlyExitFeeBps % 100 ? 1 : 0)}${p.personal ? ", paid to Plenum" : `: ${pct(10_000 - p.protocolFeeCutBps, 0)} of it stays with the members who remain, ${pct(p.protocolFeeCutBps, 0)} goes to Plenum`}.`
            : "No fixed period: leaving is always free."}
          {p.periodLength > 0 ? ` Next period ends ${inTimeZone(p.nextPeriodEnd)}.` : ""}
        </p>
      </div>
    </Card>
  );
}

function MoneyPanel({ plenum }: { plenum: Address }) {
  const { session, profile, rate } = useSession();
  const { state: p, position, refresh } = usePlenum(plenum);
  const [mode, setMode] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const tx = useTx();
  if (!p || !position || !session) return null;

  let assets: bigint | null = null;
  let invalid: string | undefined;
  try {
    assets = amount ? parseUsd(amount) : null;
  } catch (e) {
    invalid = e instanceof Error ? e.message : String(e);
  }
  if (assets !== null && mode === "in" && assets > position.balance) invalid = "That's more than you have in your account.";
  if (assets !== null && mode === "out" && assets > position.value) invalid = "That's more than your share.";
  const quote = mode === "out" && assets && !invalid ? exitQuote(p, assets, position.value === 0n ? 0n : (assets * position.units) / position.value) : null;
  const leaveQuote = exitQuote(p, position.value, position.units);
  const noun = p.personal ? "portfolio" : "group";

  // Contributions after the first, and every exit, are priced: fetch a FALLBACK price first if the CRE one is stale.
  const priceStep = needsPrice(p) ? [{ label: "Get a fresh price (labelled FALLBACK writer, testnet)", run: (sent: (h: `0x${string}`) => void) => ensureFreshPrice(p, sent) }] : [];

  const leave = async () => {
    setDone(null);
    const ok = await tx.run([
      ...(position.units > 0n ? priceStep : []),
      {
        label: p.personal ? "Withdraw everything and close the portfolio" : "Withdraw everything and leave the group",
        run: (sent) => send(session.account, { address: p.address, abi: plenumAbi, functionName: "leave", args: [session.account.address] }, sent),
      },
    ]);
    if (ok) {
      setDone(`${money(leaveQuote.payout)} is on its way to your account. You're no longer a member of this ${noun}.`);
      await refresh();
    }
  };

  const submit = async () => {
    if (!assets) return;
    setDone(null);
    const a = assets;
    const ok =
      mode === "in"
        ? await tx.run([
            ...(p.totalUnits > 0n ? priceStep : []),
            { label: `Allow the group to receive ${money(a)}`, run: (sent) => send(session.account, { address: DEPLOYMENT.asset, abi: erc20Abi, functionName: "approve", args: [p.address, a] }, sent) },
            { label: `Contribute ${money(a)}`, run: (sent) => send(session.account, { address: p.address, abi: plenumAbi, functionName: "contribute", args: [a] }, sent) },
          ])
        : await tx.run([
            ...priceStep,
            {
              label: `Take out ${money(a)}`,
              run: (sent) => {
                const units = position.value === 0n ? 0n : (a * position.units) / position.value;
                if (units === 0n || units > position.units) throw new Error("That's more than your share.");
                return send(session.account, { address: p.address, abi: plenumAbi, functionName: "redeem", args: [units, session.account.address] }, sent);
              },
            },
          ]);
    if (ok) {
      setDone(
        mode === "in"
          ? `Contributed ${money(a)}. Your units were priced at the latest independent valuation.`
          : `${money(exitQuote(p, a, position.units).payout)} is on its way back to your account.`,
      );
      setAmount("");
      await refresh();
    }
  };

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">Your money</h2>
        <div className="inline-flex rounded-full border border-line-strong bg-sunk p-1">
          {(["in", "out"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                tx.reset();
                setDone(null);
              }}
              className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm transition ${mode === m ? "text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              {mode === m ? <motion.span layoutId="money-mode" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 400, damping: 32 }} /> : null}
              <span className="relative inline-flex items-center gap-1.5">
                {m === "in" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                {m === "in" ? "Contribute" : "Take out"}
              </span>
            </button>
          ))}
        </div>
      </div>
      <Field
        label="Amount in US dollars"
        error={invalid}
        hint={
          mode === "in"
            ? `In your account: ${money(position.balance)}${profile.currency !== "USD" && assets ? ` · about ${money(assets, profile.currency, rate)}` : ""}`
            : `Your share is worth ${money(position.value)}. Paid from the group's cash to your account.`
        }
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-2xl text-faint">$</span>
          <input
            className={`${inputClass} py-3.5! pl-9! font-display text-2xl! font-semibold tabular`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="250"
            aria-invalid={!!invalid}
          />
        </div>
      </Field>
      <div className="flex flex-wrap gap-2">
        {["50", "100", "250", "1000"].map((v) => (
          <button key={v} onClick={() => setAmount(v)} className="min-h-8 rounded-full border border-line px-3 font-mono text-xs text-muted transition hover:border-line-strong hover:text-ink">
            ${v}
          </button>
        ))}
      </div>
      <Button className="w-full" size="lg" busy={tx.busy} disabled={!assets || !!invalid || tx.busy || (mode === "out" && position.units === 0n)} onClick={submit}>
        {mode === "in" ? `Contribute${assets && !invalid ? ` ${money(assets)}` : ""}` : `Take out${assets && !invalid ? ` ${money(assets)}` : ""}`}
      </Button>
      {quote && quote.fee > 0n ? (
        <Notice tone="warn">
          Leaving now costs {money(quote.fee)} ({pct(p.exitFeeNowBps, p.exitFeeNowBps % 100 ? 1 : 0)}): you receive {money(quote.payout)}.{" "}
          {quote.toGroup > 0n ? `${money(quote.toGroup)} stays with the ${noun}, shared by the members who remain; ${money(quote.toTreasury)} goes to Plenum.` : `The fee goes to Plenum.`}{" "}
          It's free in the {duration(p.exitWindow)} after the period ends ({until(p.nextPeriodEnd, p.now)}).
        </Notice>
      ) : null}
      <TxSteps steps={tx.steps} error={tx.error} />
      {done ? <Notice tone="ok">{done}</Notice> : null}
      {p.v2 && mode === "out" ? (
        <div className="space-y-3 border-t border-line pt-5">
          <p className="text-sm leading-relaxed text-muted">
            {p.personal ? "Close this portfolio: withdraw everything" : "Leave the group: withdraw everything and give up your membership"}
            {position.value > 0n ? ` (${money(leaveQuote.payout)}${leaveQuote.fee > 0n ? ` after a ${money(leaveQuote.fee)} fee` : ""})` : ""}. Paid from the {noun}'s cash.
          </p>
          <Button variant="ghost" busy={tx.busy} disabled={tx.busy} onClick={leave}>
            <SignOut size={16} /> {p.personal ? "Close portfolio" : "Withdraw everything and leave"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function LatestFromManager({ plenum }: { plenum: Address }) {
  const { state: p } = usePlenum(plenum);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  useEffect(() => {
    if (!p) return;
    loadFeed(p)
      .then((f) => setItems(f.filter((i) => ["MANAGER_ACTION", "ESCALATED", "NAV", "PAUSED", "UNPAUSED"].includes(i.kind)).slice(0, 4)))
      .catch(() => setItems([]));
  }, [p?.total, p?.nav.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em]">Latest from the manager</h2>
        <Link href={`/g/${plenum}/manager`} className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-accent">
          All <ArrowRight size={14} />
        </Link>
      </div>
      {!items ? (
        <div className="mt-5 space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-5 text-sm leading-relaxed text-muted">Nothing yet. Once the group has money and a fresh price, the manager's moves and refusals appear here with their reasons.</p>
      ) : (
        <ol className="mt-5 space-y-1">
          {items.map((i) => (
            <li key={i.id} className="flex gap-3 rounded-xl p-2 transition hover:bg-well">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${i.kind === "MANAGER_ACTION" && i.detail === "OK" ? "bg-accent" : i.kind === "NAV" ? "bg-info" : i.kind === "PAUSED" ? "bg-bad" : "bg-warn"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{feedTitle(i)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {i.kind === "MANAGER_ACTION" ? <ReasonChip reason={i.detail} showCode={false} /> : null}
                  {i.amount !== undefined && i.kind !== "NAV" ? <span className="font-mono tabular">{money(i.amount)}</span> : null}
                  <span>{ago(Date.now() / 1000 - i.timestamp)}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function InvitePanel({ plenum, highlight }: { plenum: Address; highlight: boolean; onDone: () => Promise<void> }) {
  const { session } = useSession();
  const [invitee, setInvitee] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session) return null;

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const i = await signInvite(session.account, plenum, invitee ? (invitee as Address) : zeroAddress);
      setLink(inviteLink(location.origin, i));
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={`scroll-mt-24 ${highlight ? "border-accent/40" : ""}`}>
      <div id="invite" className="grid gap-6 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <div>
          <span className="grid size-11 place-items-center rounded-2xl border border-line-strong bg-sunk text-accent">
            <LinkSimple size={22} />
          </span>
          <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em]">Invite a member</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">The link works once and expires in 7 days, and it's signed by you.</p>
        </div>
        <div className="space-y-4">
          <Field label="Their account ID (optional)" hint="Leave empty for a link anyone can use once." error={invitee !== "" && !isAddress(invitee) ? "That isn't a valid account ID." : undefined}>
            <input className={`${inputClass} font-mono text-sm!`} value={invitee} onChange={(e) => setInvitee(e.target.value.trim())} placeholder="0x…" />
          </Field>
          <Button variant="secondary" busy={busy} disabled={invitee !== "" && !isAddress(invitee)} onClick={make}>
            Create invite link
          </Button>
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <AnimatePresence>
            {link ? (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap gap-2 rounded-2xl border border-line bg-sunk p-2">
                <code className="min-w-0 flex-1 truncate px-2 py-2 font-mono text-xs text-muted">{link}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(link);
                    setCopied(true);
                  }}
                >
                  {copied ? <CheckCircle size={15} className="text-accent" /> : <Copy size={15} />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                {typeof navigator !== "undefined" && "share" in navigator ? (
                  <Button size="sm" onClick={() => void navigator.share({ title: "Join our Plenum group", url: link }).catch(() => {})}>
                    <ShareNetwork size={15} /> Share
                  </Button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </Card>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
