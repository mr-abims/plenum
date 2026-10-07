"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/session";
import { short } from "@/lib/format";
import { CHAIN } from "@/lib/config";

export function Header() {
  const t = useTranslations("common");
  const { session, profile, logout } = useSession();
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Link href="/" className="flex items-baseline gap-2">
        <span className="font-display text-2xl">Plenum</span>
        <span className="hidden text-xs text-muted sm:inline">{CHAIN.id === 10143 ? "Monad testnet" : "local chain"}</span>
      </Link>
      {session ? (
        <div className="flex items-center gap-3 text-sm">
          <Link href="/start" className="text-muted hover:text-ink">
            {profile.displayName || short(session.account.address)}
          </Link>
          <button onClick={logout} className="text-muted underline-offset-2 hover:text-ink hover:underline">
            {t("signOut")}
          </button>
        </div>
      ) : (
        <Link href="/start" className="text-sm font-medium text-accent">
          {t("signIn")}
        </Link>
      )}
    </header>
  );
}
