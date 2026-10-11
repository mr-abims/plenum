"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { decryptDocument, encryptDocument } from "@plenum/crypto";
import { createAccount, explainMeraError, signIn, type MemberSession } from "./account";
import { getBlob, profileDocId, putBlob } from "./blobs";
import { usdRates } from "./fx";

/** ON-3: display name, home currency, language and time zone — encrypted to the member's own key, stored offchain. */
export interface Profile {
  displayName: string;
  currency: string;
  language: string;
  timeZone: string;
}

const defaultProfile = (): Profile => ({
  displayName: "",
  currency: "USD",
  language: "en",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

interface SessionValue {
  session: MemberSession | null;
  profile: Profile;
  rate: number; // USD → profile.currency, indicative
  busy: boolean;
  error: string | null;
  create: (displayName: string) => Promise<void>;
  login: () => Promise<void>;
  logout: () => void;
  saveProfile: (p: Profile) => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);

/**
 * Session scope (Mera UX): while signed in, ordinary actions (contribute, join, save preferences) sign with the
 * in-memory Mera signing session without a prompt; approve, pause and consent ask for the passkey again. The signing
 * key lives only in memory: it ends on reload, on sign-out, or after this much inactivity.
 */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MemberSession | null>(null);
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [rate, setRate] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void usdRates().then((r) => setRate(r[profile.currency] ?? 1));
  }, [profile.currency]);

  // End the signing session after IDLE_LIMIT_MS without user activity, and say why.
  useEffect(() => {
    if (!session) return;
    let timer = setTimeout(expire, IDLE_LIMIT_MS);
    function expire() {
      session?.end();
      setSession(null);
      setProfile(defaultProfile());
      setError("Your session ended after 30 minutes without activity. Sign in with your passkey to continue.");
    }
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(expire, IDLE_LIMIT_MS);
    };
    const events = ["pointerdown", "keydown", "visibilitychange"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [session]);

  const loadProfile = useCallback(async (s: MemberSession) => {
    try {
      const env = await getBlob(profileDocId(s.account.address));
      if (env) setProfile({ ...defaultProfile(), ...JSON.parse(new TextDecoder().decode(await decryptDocument(env, s.encryption))) });
    } catch {
      // no profile yet, or unreadable: keep defaults
    }
  }, []);

  const run = useCallback(async (fn: () => Promise<MemberSession>, displayName?: string) => {
    setBusy(true);
    setError(null);
    try {
      const s = await fn();
      setSession((old) => {
        old?.end();
        return s;
      });
      if (displayName) setProfile((p) => ({ ...p, displayName }));
      else await loadProfile(s);
    } catch (err) {
      setError(explainMeraError(err));
    } finally {
      setBusy(false);
    }
  }, [loadProfile]);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      profile,
      rate,
      busy,
      error,
      create: (displayName) => run(() => createAccount(displayName), displayName),
      login: () => run(signIn),
      logout: () => {
        session?.end();
        setSession(null);
        setProfile(defaultProfile());
      },
      saveProfile: async (p) => {
        if (!session) throw new Error("Sign in first");
        const env = await encryptDocument(profileDocId(session.account.address), new TextEncoder().encode(JSON.stringify(p)), [
          session.encryption.publicKey,
        ]);
        await putBlob(session.account, profileDocId(session.account.address), env);
        setProfile(p);
      },
    }),
    [session, profile, rate, busy, error, run],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}
