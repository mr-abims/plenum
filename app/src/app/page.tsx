import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function Welcome() {
  const t = await getTranslations("welcome");
  const brand = await getTranslations("brand");
  const points = ["rules", "price", "people", "fire"] as const;
  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-sm text-muted">{brand("tagline")}</p>
      <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[1.05] tracking-tight sm:text-6xl">{t("title")}</h1>
      <p className="mt-6 max-w-2xl text-lg text-muted">{t("lead")}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/create" className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-accent-ink">
          {t("create")}
        </Link>
        <Link href="/join" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-6 text-sm font-medium">
          {t("join")}
        </Link>
      </div>
      <ol className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        {points.map((p, i) => {
          const [head, ...rest] = t(`points.${p}`).split(". ");
          return (
            <li key={p} className="bg-surface p-6">
              <span className="font-display text-3xl text-accent">{i + 1}</span>
              <p className="mt-3 font-medium">{head}.</p>
              <p className="mt-1 text-sm text-muted">{rest.join(". ")}</p>
            </li>
          );
        })}
      </ol>
      <p className="mt-10 text-xs text-muted">
        Software, not a fund or an adviser. Runs on Monad testnet with test money. Simulated assets and identity checks
        are labelled <span className="text-mock">MOCK</span>.
      </p>
    </div>
  );
}
