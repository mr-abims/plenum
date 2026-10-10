import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Gavel, HandCoins, LinkSimple, Robot, ShieldCheck, UsersThree, Warning } from "@phosphor-icons/react/ssr";
import { HeroChamber } from "@/components/landing/HeroChamber";
import { Duties } from "@/components/landing/Duties";
import { RuleConsole } from "@/components/landing/RuleConsole";
import { LogoMark } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { TxLink } from "@/components/ui";
import { DEPLOYMENT, EXPLORER } from "@/lib/config";
import { EVIDENCE, EVIDENCE_EXPLORER } from "@/lib/evidence";

const FLOW = [
  { icon: UsersThree, title: "Start a group, or go solo", body: "Invest with people you know or on your own. Pick Conservative, Balanced or Liquidity-first; the template becomes your mandate, written into a contract." },
  { icon: LinkSimple, title: "Invite verified people", body: "Send a single-use link. Only people who passed the identity check can join or move money." },
  { icon: HandCoins, title: "Contribute", body: "Put money in and receive units at the latest independent price. See it in your own currency." },
  { icon: Robot, title: "Let the manager work", body: "It rebalances inside the rules and explains every move with a fingerprint of its reasoning onchain." },
  { icon: Gavel, title: "Stay in charge", body: "Approve the bigger moves with your passkey. Pause the manager at any time. Share your data only when you choose." },
] as const;

const TONE = { accent: "text-accent border-accent/30 bg-accent-soft", info: "text-info border-info/30 bg-info/10", warn: "text-warn border-warn/30 bg-warn/10", bad: "text-bad border-bad/40 bg-bad/10" } as const;

export default async function Landing() {
  const t = await getTranslations("landing");
  return (
    <>
      {/* Hero */}
      <section className="grid items-center lg:min-h-[min(calc(100dvh-4rem),880px)] gap-12 py-12 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:py-8">
        <Reveal y={24}>
          <h1 className="font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            {t("heroTitleA")}
            <span className="block text-accent">{t("heroTitleB")}</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted">{t("heroLead")}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/create" className="group inline-flex min-h-13 items-center gap-2.5 rounded-full bg-accent px-7 text-[15px] font-medium text-accent-ink transition hover:brightness-110 active:scale-[0.98]">
              {t("create")}
              <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
            <Link href="/join" className="inline-flex min-h-13 items-center rounded-full border border-line-strong px-7 text-[15px] font-medium transition hover:border-faint hover:bg-well active:scale-[0.98]">
              {t("join")}
            </Link>
          </div>
        </Reveal>
        <Reveal delay={0.15}>
          <HeroChamber />
        </Reveal>
      </section>

      {/* Manifesto */}
      <section className="border-t border-line py-24 sm:py-32">
        <Reveal>
          <p className="max-w-5xl font-display text-3xl font-medium leading-[1.12] tracking-[-0.03em] text-balance sm:text-5xl">{t("manifesto")}</p>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted sm:ml-auto sm:mt-12">{t("manifestoB")}</p>
        </Reveal>
      </section>

      {/* Separation of duties */}
      <section id="duties" className="scroll-mt-20 py-16 sm:py-24">
        <Reveal>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Separation of duties</p>
          <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{t("dutiesTitle")}</h2>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-muted">{t("dutiesLead")}</p>
        </Reveal>
        <div className="mt-12">
          <Duties />
        </div>
      </section>

      {/* Interactive rule check */}
      <section id="try" className="scroll-mt-20 py-16 sm:py-24">
        <Reveal>
          <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{t("tryTitle")}</h2>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-muted">{t("tryLead")}</p>
        </Reveal>
        <div className="mt-12">
          <RuleConsole />
        </div>
      </section>

      {/* Evidence ledger */}
      <section id="evidence" className="scroll-mt-20 py-16 sm:py-24">
        <Reveal>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Onchain proof</p>
          <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{t("evidenceTitle")}</h2>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-muted">{t("evidenceLead")}</p>
        </Reveal>
        <ol className="mt-12 overflow-hidden rounded-[24px] border border-line">
          {EVIDENCE.map((e, i) => {
            const last = i === EVIDENCE.length - 1;
            return (
              <li key={e.hash} className={`${i ? "border-t border-line" : ""} ${last ? "bg-bad/[0.06]" : "bg-raised"}`}>
                <Reveal delay={i * 0.04} y={10} className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:gap-6 sm:p-6">
                  <span className={`grid size-10 place-items-center rounded-full border ${TONE[e.tone]}`}>
                    {last ? <Warning size={18} weight="bold" /> : <ShieldCheck size={18} weight="bold" />}
                  </span>
                  <div>
                    <p className={`font-medium ${last ? "text-bad" : ""}`}>{e.title}</p>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{e.body}</p>
                  </div>
                  <TxLink hash={e.hash} explorer={EVIDENCE_EXPLORER}>{`${e.hash.slice(0, 10)}…${e.hash.slice(-4)}`}</TxLink>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </section>

      {/* How a group runs */}
      <section className="py-16 sm:py-24">
        <Reveal>
          <h2 className="max-w-3xl font-display text-4xl font-semibold tracking-[-0.035em] sm:text-5xl">{t("flowTitle")}</h2>
        </Reveal>
        <div className="rail -mx-4 mt-12 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {FLOW.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.06} className="w-[78vw] max-w-[320px] shrink-0 sm:w-[300px]">
              <article className="flex h-full flex-col rounded-[24px] border border-line bg-raised p-6">
                <span className="grid size-11 place-items-center rounded-2xl border border-line-strong bg-sunk text-accent">
                  <f.icon size={22} weight="duotone" />
                </span>
                <h3 className="mt-8 font-display text-xl font-semibold tracking-[-0.02em]">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="relative overflow-hidden rounded-[32px] border border-line bg-raised px-6 py-20 text-center sm:py-28">
        <div className="chamber-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <Reveal className="relative">
          <LogoMark size={56} className="mx-auto" />
          <h2 className="mx-auto mt-8 max-w-3xl font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">{t("closeTitle")}</h2>
          <Link href="/create" className="mt-10 inline-flex min-h-13 items-center gap-2.5 rounded-full bg-accent px-7 text-[15px] font-medium text-accent-ink transition hover:brightness-110 active:scale-[0.98]">
            {t("create")}
            <ArrowRight size={18} />
          </Link>
        </Reveal>
      </section>

      <footer className="mt-16 grid gap-8 border-t border-line pt-10 text-sm text-muted md:grid-cols-[1.4fr_1fr_1fr]">
        <p className="max-w-md leading-relaxed">{t("disclaimer")}</p>
        <div className="space-y-2">
          <p className="font-medium text-ink">Built with</p>
          <ul className="space-y-1 font-mono text-xs">
            {["Monad", "Chainlink CRE", "Envio HyperIndex", "Qwen 3.8 Max", "Mera passkeys", "Cleanverse attestations (MOCK signer)"].map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <p className="font-medium text-ink">Contracts</p>
          {EXPLORER ? (
            <a className="block font-mono text-xs transition hover:text-accent" href={`${EXPLORER}/address/${DEPLOYMENT.factory}`} target="_blank" rel="noreferrer">
              PlenumFactory on MonadVision
            </a>
          ) : (
            <p className="font-mono text-xs">Local chain {DEPLOYMENT.chainId}</p>
          )}
          {process.env.NEXT_PUBLIC_REPO_URL ? (
            <a className="block font-mono text-xs transition hover:text-accent" href={process.env.NEXT_PUBLIC_REPO_URL} target="_blank" rel="noreferrer">
              Source code (MIT)
            </a>
          ) : null}
        </div>
      </footer>
    </>
  );
}
