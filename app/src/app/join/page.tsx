"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { plenumAbi } from "@plenum/abis";
import { publicKeyToBytes32 } from "@plenum/crypto";
import { zeroAddress } from "viem";
import { Button, Card, Eyebrow, H1, Notice } from "@/components/ui";
import { publicClient, send } from "@/lib/chain";
import { encodeInvite, parseInvite } from "@/lib/invite";
import { isVerified } from "@/lib/plenum";
import { useSession } from "@/lib/session";

function Join() {
  const q = useSearchParams();
  const invite = parseInvite(q);
  const { session } = useSession();
  const router = useRouter();
  const [groupName, setGroupName] = useState<string>("");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invite) void publicClient.readContract({ address: invite.plenum, abi: plenumAbi, functionName: "name" }).then(setGroupName).catch(() => {});
  }, [invite?.plenum]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (session) void isVerified(session.account.address).then(setVerified);
  }, [session]);

  if (!invite) {
    return (
      <div className="mx-auto max-w-lg pt-10">
        <H1>Join a group</H1>
        <p className="mt-4 text-muted">Open the invite link a member sent you. It contains everything needed to join.</p>
      </div>
    );
  }
  const expired = Number(invite.expiry) < Date.now() / 1000;
  const forSomeoneElse =
    session && invite.invitee !== zeroAddress && invite.invitee.toLowerCase() !== session.account.address.toLowerCase();

  async function join() {
    if (!session || !invite) return;
    setBusy(true);
    setError(null);
    try {
      await send(session.account, {
        address: invite.plenum,
        abi: plenumAbi,
        functionName: "join",
        args: [encodeInvite(invite), publicKeyToBytes32(session.encryption.publicKey)],
      });
      const member = await publicClient.readContract({ address: invite.plenum, abi: plenumAbi, functionName: "isMember", args: [session.account.address] });
      if (!member) throw new Error("Not joined: your identity isn't verified yet. Ask the organizer to verify your account ID.");
      router.push(`/g/${invite.plenum}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 pt-10">
      <div>
        <Eyebrow>Invitation</Eyebrow>
        <H1>{groupName ? `Join ${groupName}` : "Join a group"}</H1>
      </div>
      <Card className="space-y-4">
        {expired ? <Notice tone="bad">This invite has expired. Ask for a new one.</Notice> : null}
        {forSomeoneElse ? <Notice tone="bad">This invite was made for a different account.</Notice> : null}
        {!session ? (
          <>
            <p className="text-sm text-muted">Set up your passkey account first. It takes a few seconds.</p>
            <Link className="text-accent" href={`/start?next=${encodeURIComponent(`/join?${q.toString()}`)}`}>
              Get started →
            </Link>
          </>
        ) : (
          <>
            {verified === false ? (
              <Notice tone="warn">
                Only verified people can join. <Link className="text-accent" href="/start">Get verified</Link> first.
              </Notice>
            ) : null}
            <p className="text-sm text-muted">
              Joining publishes a public key for your private documents. Your documents themselves stay encrypted.
            </p>
            <Button busy={busy} disabled={expired || !!forSomeoneElse || verified !== true} onClick={join} className="w-full">
              Join with passkey
            </Button>
          </>
        )}
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </Card>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}
