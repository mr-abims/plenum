"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { decodeEventLog, type Address } from "viem";
import { ArrowLeft, ArrowRight, CalendarBlank, Check, Coins, Gavel, HandPalm, Prohibit, Scales, SlidersHorizontal, User, UsersThree, Vault } from "@phosphor-icons/react";
import { plenumAbi, plenumFactoryAbi } from "@plenum/abis";
import { publicKeyToBytes32 } from "@plenum/crypto";
import { ChamberDial, rowsFromTemplate } from "@/components/ChamberDial";
import { TxSteps } from "@/components/TxSteps";
import { Button, Card, Field, MockTag, inputClass } from "@/components/ui";
import { publicClient, send } from "@/lib/chain";
import { adapterName, DEPLOYMENT, MANAGER_ADDRESS } from "@/lib/config";
import { duration, pct } from "@/lib/format";
import { encodeInvite, signInvite } from "@/lib/invite";
import { AccountSetup } from "@/components/AccountSetup";
import { useAccountSetup } from "@/lib/useAccountSetup";
import { useSession } from "@/lib/session";
import { FEES, mandateConfig, PERIODS, TEMPLATES, type Period, type Template } from "@/lib/templates";
import { useTx } from "@/lib/useTx";

export default function CreatePage() {
  return (
    <Suspense>
      <Create />
    </Suspense>
  );
}

function Create() {
  const { session } = useSession();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<0 | 1>(0);
  // Groups are the default; "?mode=personal" (from the landing page) preselects a personal portfolio.
  const startPersonal = useSearchParams().get("mode") === "personal";
  const [personal, setPersonal] = useState(startPersonal);
  const [name, setName] = useState(startPersonal ? "My portfolio" : "");
  const noun = personal ? "portfolio" : "group";
  const [template, setTemplate] = useState<Template>(TEMPLATES[1]);
  const [period, setPeriod] = useState<Period>(PERIODS[3]);
  const [feeBps, setFeeBps] = useState<number>(200);
  const tx = useTx();
  const setup = useAccountSetup(session);

  if (!session) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em]">{personal ? "Start a personal portfolio" : "Start a group"}</h1>
        <p className="mt-4 text-muted">First, set up your passkey account. It takes a few seconds.</p>
        <Link href={`/start?next=${encodeURIComponent(personal ? "/create?mode=personal" : "/create")}`} className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 text-sm font-medium text-accent-ink">
          Get started <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  async function create() {
    if (!session) return;
    let plenum: Address | undefined;
    const ok = await tx.run([
      {
        label: `Write "${name.trim()}" and its rules to Monad`,
        run: async (sent) => {
          if (!MANAGER_ADDRESS) throw new Error("The AI manager's address is not configured (NEXT_PUBLIC_MANAGER_ADDRESS).");
          const hash = await send(
            session.account,
            { address: DEPLOYMENT.factory, abi: plenumFactoryAbi, functionName: "createPlenum", args: [name.trim(), template.id, mandateConfig(template, { personal, period, feeBps }), MANAGER_ADDRESS] },
            sent,
          );
          const receipt = await publicClient.getTransactionReceipt({ hash });
          for (const log of receipt.logs) {
            try {
              const ev = decodeEventLog({ abi: plenumFactoryAbi, data: log.data, topics: log.topics });
              if (ev.eventName === "PlenumCreated") plenum = ev.args.plenum;
            } catch {}
          }
          if (!plenum) throw new Error(`The ${noun} was created but its address was not found in the receipt.`);
        },
      },
      {
        label: personal ? "Make you its owner" : "Add you as the first member",
        run: async (sent) => {
          const invite = await signInvite(session.account, plenum!, session.account.address, 1);
          return send(session.account, { address: plenum!, abi: plenumAbi, functionName: "join", args: [encodeInvite(invite), publicKeyToBytes32(session.encryption.publicKey)] }, sent);
        },
      },
    ]);
    if (ok && plenum) router.push(`/g/${plenum}?created=1`);
  }

  const clauses = [
    { icon: Vault, text: `The manager may only buy and sell the ${template.sleeves.length} assets below. It can never send money anywhere else.` },
    { icon: Scales, text: `Any single trade is limited to ${pct(template.maxTrade, 0)} of the ${noun}'s value, and all trades in a day to 25%.` },
    { icon: Coins, text: `At least ${pct(template.cashFloor, 0)} stays in cash so ${personal ? "you" : "members"} can take money out.` },
    {
      icon: Gavel,
      text: personal
        ? "Anything outside these limits becomes a proposal that you approve with your passkey."
        : "Anything outside these limits becomes a proposal that members approve with their passkey.",
    },
    { icon: HandPalm, text: personal ? "You can pause the manager instantly." : "Any 2 members can pause the manager instantly." },
    {
      icon: CalendarBlank,
      text:
        period.length === 0
          ? `No fixed period: ${personal ? "you" : "members"} can take money out at any time, free.`
          : `Money is invested in ${period.label.replace(" (testnet demo)", "")} periods that renew on their own. Leaving is free for ${duration(period.window)} after each period ends; at other times it costs ${pct(feeBps, feeBps % 100 ? 1 : 0)}${
              personal ? ", which goes to Plenum." : ": three quarters stay with the group, shared by the members who remain, and a quarter goes to Plenum."
            }`,
    },
    {
      icon: SlidersHorizontal,
      text: personal
        ? "You can change these rules later; a change waits 10 minutes on testnet (48 hours in production) before it applies."
        : "Members can change these rules later with two-thirds approval. A change waits 10 minutes on testnet (48 hours in production) before it applies, and anyone can leave free of charge in the meantime.",
    },
  ];

  return (
    <div className="pt-10">
      <div className="flex items-center gap-3 font-mono text-xs text-muted">
        <span className={step === 0 ? "text-accent" : ""}>Choose the rules</span>
        <span className="h-px w-8 bg-line" />
        <span className={step === 1 ? "text-accent" : ""}>Name and create</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 ? (
          <motion.div key="pick" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -12 }}>
            <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Who is investing">
              {([
                [false, UsersThree, "A group", "Pool money with people you know. Bigger moves need the members' approval."],
                [true, User, "Just me", "Your own portfolio. You set the rules and approve bigger moves yourself."],
              ] as const).map(([value, I, title, body]) => {
                const on = personal === value;
                return (
                  <button
                    key={title}
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setPersonal(value);
                      if (value && !name.trim()) setName("My portfolio");
                      if (!value && name === "My portfolio") setName("");
                    }}
                    className={`flex gap-3 rounded-[20px] border p-4 text-left transition ${on ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong"}`}
                  >
                    <I size={22} className={on ? "text-accent" : "text-muted"} />
                    <span>
                      <span className="block font-medium">{title}</span>
                      <span className="mt-1 block text-sm text-muted">{body}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <h1 className="mt-8 max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">Choose your {noun}'s rules.</h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
              The rules decide what the AI manager may buy, how far each holding may drift, how much cash stays on hand and how big one trade can be. They're written into a contract the manager can't change.
            </p>

            {!setup.ready ? (
              <div className="mt-6 max-w-2xl">
                <AccountSetup setup={setup} />
              </div>
            ) : null}

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {TEMPLATES.map((t) => {
                const on = template.id === t.id;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTemplate(t)}
                    aria-pressed={on}
                    className={`relative rounded-[24px] border p-5 text-left transition active:scale-[0.99] ${on ? "border-accent/60" : "border-line hover:border-line-strong"}`}
                  >
                    {on ? <motion.span layoutId="tpl" className="absolute inset-0 rounded-[24px] bg-accent-soft" transition={{ type: "spring", stiffness: 380, damping: 34 }} /> : null}
                    <span className="relative block">
                      <span className="flex items-center justify-between">
                        <span className="font-display text-2xl font-semibold tracking-[-0.02em]">{t.title}</span>
                        <span className={`grid size-6 place-items-center rounded-full border ${on ? "border-accent bg-accent text-accent-ink" : "border-line-strong"}`}>{on ? <Check size={13} weight="bold" /> : null}</span>
                      </span>
                      <span className="mt-2 block text-sm text-muted">{t.blurb}</span>
                      <span className="mx-auto mt-4 block max-w-[220px]">
                        <ChamberDial rows={rowsFromTemplate(t)} labels={false} />
                      </span>
                      <span className="mt-2 block space-y-1.5 text-sm tabular">
                        {t.sleeves.map((s) => (
                          <span key={s.adapter} className="flex justify-between">
                            <span>{adapterName(s.adapter)}</span>
                            <span className="font-mono text-xs text-muted">
                              {pct(s.target, 0)} ± {pct(s.band, 0)}
                            </span>
                          </span>
                        ))}
                        <span className="flex justify-between">
                          <span>Cash</span>
                          <span className="font-mono text-xs text-muted">at least {pct(t.cashFloor, 0)}</span>
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-xs text-muted">
                Assets are <MockTag /> testnet versions of tokenised funds.
              </p>
              <Button size="lg" onClick={() => setStep(1)}>
                Continue with {template.title} <ArrowRight size={17} />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="name"
            className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr]"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: 12 }}
          >
            <div>
              <button onClick={() => setStep(0)} disabled={tx.busy} className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink">
                <ArrowLeft size={14} /> Change rules
              </button>
              <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">Read the rules, then name it.</h1>
              <Card className="mt-8 space-y-5">
                <p className="font-display text-xl font-semibold tracking-tight">{template.title}, in plain language</p>
                <ul className="space-y-4">
                  {clauses.map((c) => (
                    <li key={c.text} className="flex gap-3 text-sm leading-relaxed">
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-sunk text-accent">
                        <c.icon size={16} />
                      </span>
                      <span className="pt-1">{c.text}</span>
                    </li>
                  ))}
                  <li className="flex gap-3 text-sm leading-relaxed">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-bad/30 bg-bad/10 text-bad">
                      <Prohibit size={16} />
                    </span>
                    <span className="pt-1">The manager can't change any of this. {personal ? "Only you can." : "Only members can."}</span>
                  </li>
                </ul>
              </Card>
            </div>
            <div className="lg:pt-24">
              <Card className="space-y-5">
                <div className="mx-auto max-w-[260px]">
                  <ChamberDial rows={rowsFromTemplate(template)} labels={false}>
                    <p className="text-xs text-muted">{template.title}</p>
                  </ChamberDial>
                </div>
                <Field label="Investment period" hint="Members choose at each period end whether to stay or leave free of charge.">
                  <select className={inputClass} value={period.key} onChange={(e) => setPeriod(PERIODS.find((x) => x.key === e.target.value) ?? PERIODS[0])} disabled={tx.busy}>
                    {PERIODS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {period.length > 0 ? (
                  <Field label="Fee for leaving early" hint={personal ? "Paid to Plenum when you withdraw outside the free window." : "Paid by a member who withdraws outside the free window. Three quarters stay with the group."}>
                    <select className={inputClass} value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))} disabled={tx.busy}>
                      {FEES.map((f) => (
                        <option key={f} value={f}>
                          {pct(f, f % 100 ? 1 : 0)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                <Field label={personal ? "Portfolio name" : "Group name"} hint={`${personal ? "Shown on your dashboard" : "Members see this name"}. It's stored onchain, so keep personal details out of it.`}>
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={personal ? "My portfolio" : "São Paulo Investment Club"} disabled={tx.busy} />
                </Field>
                <Button size="lg" className="w-full" busy={tx.busy} disabled={!name.trim() || !setup.ready || tx.busy} onClick={create}>
                  {personal ? "Create my portfolio" : "Create group"}
                </Button>
                <TxSteps steps={tx.steps} error={tx.error} />
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
