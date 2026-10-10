"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fingerprint, Moon, SignOut, Sun } from "@phosphor-icons/react";
import { useSession } from "@/lib/session";
import { short } from "@/lib/format";
import { CHAIN } from "@/lib/config";
import { publicClient } from "@/lib/chain";
import { Logo } from "./Logo";
import { Seal } from "./Seal";

export function Header() {
  const t = useTranslations("common");
  const { session, profile, logout } = useSession();
  const path = usePathname();
  const landing = path === "/";
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-page/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="rounded-lg" aria-label="Plenum home">
          <Logo />
        </Link>
        {landing ? (
          <nav className="hidden items-center gap-7 text-sm text-muted lg:flex">
            <a href="#duties" className="transition hover:text-ink">How it's guarded</a>
            <a href="#try" className="transition hover:text-ink">Try the rules</a>
            <a href="#evidence" className="transition hover:text-ink">Onchain proof</a>
          </nav>
        ) : null}
        <div className="flex items-center gap-2 sm:gap-3">
          <NetworkPill />
          <ThemeToggle />
          {session ? (
            <div className="flex items-center gap-1">
              <Link href="/start" className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-sm transition hover:border-line-strong">
                <Seal address={session.account.address} size={26} />
                <span className="max-w-28 truncate">{profile.displayName || short(session.account.address)}</span>
              </Link>
              <button onClick={logout} aria-label={t("signOut")} title={t("signOut")} className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-well hover:text-ink">
                <SignOut size={17} />
              </button>
            </div>
          ) : (
            <Link href="/start" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line-strong px-4 text-[13px] font-medium transition hover:border-accent hover:text-accent">
              <Fingerprint size={16} />
              <span className="hidden sm:inline">{t("signIn")}</span>
              <span className="sm:hidden">Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Live chain status: the dot pulses while new blocks keep arriving, turns amber when the RPC stops answering. */
function NetworkPill() {
  const [block, setBlock] = useState<bigint | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    let live = true;
    const tick = () =>
      publicClient
        .getBlockNumber()
        .then((b) => live && (setBlock(b), setDown(false)))
        .catch(() => live && setDown(true));
    void tick();
    const id = setInterval(tick, 15_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  const name = CHAIN.id === 10143 ? "Monad testnet" : "Local chain";
  return (
    <span
      title={block ? `Block ${block.toString()}` : undefined}
      className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-muted md:inline-flex"
    >
      <span className={`relative size-1.5 rounded-full ${down ? "bg-warn" : "pulse bg-accent text-accent"}`} />
      {name}
      {block ? <span className="hidden text-faint tabular xl:inline">#{block.toString()}</span> : null}
    </span>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const set = document.documentElement.dataset.theme;
    setTheme(set === "light" || set === "dark" ? set : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  }, []);
  const flip = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("plenum.theme", next);
    } catch {}
    setTheme(next);
  };
  return (
    <button onClick={flip} aria-label="Switch colour theme" className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-well hover:text-ink">
      {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}
