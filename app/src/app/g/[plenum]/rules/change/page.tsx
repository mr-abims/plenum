"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Address } from "viem";
import { ArrowLeft } from "@phosphor-icons/react";
import { governanceAbi } from "@plenum/abis";
import type { MandateConfig } from "@plenum/sdk";
import { PasskeySheet } from "@/components/PasskeySheet";
import { SkeletonPanel } from "@/components/Skeleton";
import { TxSteps } from "@/components/TxSteps";
import { Button, Card, Field, MockTag, Notice, PageHeader, inputClass } from "@/components/ui";
import { confirmWithPasskey } from "@/lib/account";
import { send } from "@/lib/chain";
import { adapterName, DEPLOYMENT } from "@/lib/config";
import { duration, pct } from "@/lib/format";
import { configDiff, configProblem } from "@/lib/rules";
import { useSession } from "@/lib/session";
import { FEES, PERIODS } from "@/lib/templates";
import { usePlenum } from "@/lib/usePlenum";
import { useTx } from "@/lib/useTx";

/** A cleared number field shows empty (not "0"), so typing "8" gives 8, not 08. */
const shown = (v: number) => (v === 0 ? "" : v);
const KNOWN = [DEPLOYMENT.tbillVault, DEPLOYMENT.creditVault, DEPLOYMENT.gold] as Address[];
type Row = { adapter: Address; on: boolean; target: number; band: number };

/** Members draft new rules here; the proposal then needs the supermajority and waits out the timelock (SPEC A26). */
export default function ChangeRulesPage() {
  const { plenum } = useParams<{ plenum: Address }>();
  const { state: p, position } = usePlenum(plenum);
  const { session } = useSession();
  const router = useRouter();
  const tx = useTx();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [floor, setFloor] = useState(0);
  const [trade, setTrade] = useState(0);
  const [daily, setDaily] = useState(0);
  const [periodKey, setPeriodKey] = useState("current");
  const [feeBps, setFeeBps] = useState(200);

  useEffect(() => {
    if (!p || rows) return;
    const c = p.config;
    const listed = c.adapters.map((a) => a.toLowerCase());
    const known = KNOWN.filter((a) => !listed.includes(a.toLowerCase()));
    setRows([
      ...c.adapters.map((a, i) => ({ adapter: a, on: true, target: c.targetBps[i]! / 100, band: c.bandBps[i]! / 100 })),
      ...known.map((a) => ({ adapter: a, on: false, target: 5, band: 2 })),
    ]);
    setFloor(c.minLiquidityBps / 100);
    setTrade(c.maxTradeBps / 100);
    setDaily(c.maxDailyTurnoverBps / 100);
    setFeeBps(c.earlyExitFeeBps || 200);
  }, [p, rows]);

  if (!p || !rows) return <SkeletonPanel lines={8} />;
  if (!p.v2) return <Notice>This group was created before rule changes shipped, so its rules are fixed.</Notice>;
  if (!session || !position?.isMember) return <Notice>Only members can propose new rules.</Notice>;
  if (p.pendingChange) return <Notice>A rule change is already waiting to apply. Propose the next one after it does.</Notice>;

  const current = { key: "current", label: p.periodLength ? `Keep: ${duration(p.periodLength)}` : "Keep: no fixed period", length: p.periodLength, window: p.exitWindow };
  const period = periodKey === "current" ? current : (PERIODS.find((x) => x.key === periodKey) ?? current);
  const on = rows.filter((r) => r.on);
  const draft: MandateConfig = {
    ...p.config,
    adapters: on.map((r) => r.adapter),
    targetBps: on.map((r) => Math.round(r.target * 100)),
    bandBps: on.map((r) => Math.round(r.band * 100)),
    minLiquidityBps: Math.round(floor * 100),
    maxTradeBps: Math.round(trade * 100),
    maxDailyTurnoverBps: Math.round(daily * 100),
    periodLength: period.length,
    exitWindow: period.window,
    earlyExitFeeBps: period.length ? feeBps : 0,
  };
  const diff = configDiff(p.config, draft);
  const problem = configProblem(draft);
  const unchanged = diff.length === 1 && diff[0] === "No change";

  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (v: number, set: (n: number) => void, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input type="number" min={0} max={100} step={0.5} className={`${inputClass} tabular`} value={shown(v)} placeholder="0" onChange={(e) => set(Number(e.target.value))} disabled={tx.busy} />
    </Field>
  );

  const propose = async () => {
    const ok = await tx.run([
      { label: "Confirm it's you", kind: "passkey", run: () => confirmWithPasskey(session.account.address) },
      { label: "Propose the new rules", run: (sent) => send(session.account, { address: p.governance, abi: governanceAbi, functionName: "proposeMandateChange", args: [draft, `0x${"00".repeat(32)}`] }, sent) },
    ]);
    if (ok) router.push(`/g/${plenum}/approvals`);
  };

  return (
    <div className="space-y-8">
      <PasskeySheet open={tx.passkey} action="Proposing new rules" />
      <Link href={`/g/${plenum}/rules`} className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink">
        <ArrowLeft size={14} /> Back to the rules
      </Link>
      <PageHeader
        title="Propose new rules"
        lead={
          p.personal
            ? `You approve the change yourself; it then waits ${duration(p.timelock)} before it applies.`
            : `It passes with ${pct(p.mandateChangeBps, 0)} of members' approval, then waits ${duration(p.timelock)} before it applies. Anyone who disagrees can leave free of charge during the wait.`
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="space-y-6">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">What it may hold</h2>
            <ul className="mt-4 space-y-3">
              {rows.map((r, i) => (
                <li key={r.adapter} className="grid grid-cols-[auto_minmax(0,1fr)_88px_88px] items-center gap-3">
                  <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={r.on} onChange={(e) => setRow(i, { on: e.target.checked })} disabled={tx.busy} aria-label={`Hold ${adapterName(r.adapter)}`} />
                  <span className="flex items-center gap-2 text-sm">
                    {adapterName(r.adapter)} <MockTag />
                  </span>
                  <input type="number" className={`${inputClass} tabular`} value={shown(r.target)} placeholder="0" min={0} max={100} step={0.5} onChange={(e) => setRow(i, { target: Number(e.target.value) })} disabled={!r.on || tx.busy} aria-label="Target %" />
                  <input type="number" className={`${inputClass} tabular`} value={shown(r.band)} placeholder="0" min={0} max={50} step={0.5} onChange={(e) => setRow(i, { band: Number(e.target.value) })} disabled={!r.on || tx.busy} aria-label="Allowed drift ±%" />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Target % and allowed drift ±% for each asset. An asset can only be removed once the group holds none of it.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {num(floor, setFloor, "Cash floor %")}
            {num(trade, setTrade, "One trade at most %")}
            {num(daily, setDaily, "Trades per day at most %")}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Investment period">
              <select className={inputClass} value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} disabled={tx.busy}>
                <option value="current">{current.label}</option>
                {PERIODS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Field>
            {period.length ? (
              <Field label="Fee for leaving early">
                <select className={inputClass} value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))} disabled={tx.busy}>
                  {FEES.map((f) => (
                    <option key={f} value={f}>
                      {pct(f, f % 100 ? 1 : 0)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-4 lg:self-start">
          <h2 className="font-display text-xl font-semibold tracking-tight">What changes</h2>
          <ul className="space-y-1.5 font-mono text-xs">
            {diff.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {problem ? <Notice tone="bad">{problem}</Notice> : null}
          <Button className="w-full" size="lg" busy={tx.busy} disabled={!!problem || unchanged || tx.busy} onClick={propose}>
            Propose these rules
          </Button>
          <TxSteps steps={tx.steps} error={tx.error} />
        </Card>
      </div>
    </div>
  );
}
