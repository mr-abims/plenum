"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zeroAddress } from "viem";
import { ArrowRight, EnvelopeOpen, LinkBreak } from "@phosphor-icons/react";
import { plenumAbi } from "@plenum/abis";
import { publicKeyToBytes32 } from "@plenum/crypto";
import { ChamberDial, rowsFromPlenum } from "@/components/ChamberDial";
import { Seal } from "@/components/Seal";
import { Skeleton } from "@/components/Skeleton";
import { TxSteps } from "@/components/TxSteps";
import { Button, Card, Chip, Notice } from "@/components/ui";
import { publicClient, send } from "@/lib/chain";
import { inTimeZone, pct } from "@/lib/format";
import { encodeInvite, parseInvite } from "@/lib/invite";
import { isVerified, loadPlenum, type PlenumState } from "@/lib/plenum";
import { useSession } from "@/lib/session";
import { useTx } from "@/lib/useTx";

function Join() {
  const q = useSearchParams();
  const invite = parseInvite(q);
  const { session, profile } = useSession();
  const router = useRouter();
  const [group, setGroup] = useState<PlenumState | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const tx = useTx();

  useEffect(() => {
    if (invite) void loadPlenum(invite.plenum).then(setGroup).catch(() => {});
  }, [invite?.plenum]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (session) void isVerified(session.account.address).then(setVerified);
  }, [session]);

  if (!invite) {
    return (
      <div className="mx-auto max-w-lg pt-16 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full border border-line-strong bg-raised text-muted">
          <LinkBreak size={28} />
        </span>
        <h1 className="mt-6 font-display text-4xl font-semibold tracking-[-0.035em]">Join a group</h1>
        <p className="mt-4 leading-relaxed text-muted">Open the invite link a member sent you. It carries everything needed to join, signed by that member.</p>
      </div>
    );
  }
  const expired = Number(invite.expiry) < Date.now() / 1000;
  const forSomeoneElse = session && invite.invitee !== zeroAddress && invite.invitee.toLowerCase() !== session.account.address.toLowerCase();

  async function join() {
    if (!session || !invite) return;
    const ok = await tx.run([
      {
        label: "Join and publish your document key",
        run: async (sent) => {
          await send(session.account, { address: invite.plenum, abi: plenumAbi, functionName: "join", args: [encodeInvite(invite), publicKeyToBytes32(session.encryption.publicKey)] }, sent);
          const member = await publicClient.readContract({ address: invite.plenum, abi: plenumAbi, functionName: "isMember", args: [session.account.address] });
          if (!member) throw new Error("Not joined: your identity isn't verified yet. Ask the organizer to verify your account ID.");
        },
      },
    ]);
    if (ok) router.push(`/g/${invite.plenum}`);
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 pt-10 lg:grid-cols-[1fr_1fr] lg:items-center lg:pt-16">
      <div>
        <Chip tone="accent" icon={<EnvelopeOpen size={13} />}>
          You're invited
        </Chip>
        <div className="mt-6 flex items-center gap-4">
          <Seal address={invite.plenum} size={52} />
          {group ? <h1 className="font-display text-4xl font-semibold leading-[1.02] tracking-[-0.035em] sm:text-5xl">{group.name}</h1> : <Skeleton className="h-12 w-64" />}
        </div>
        {group ? (
          <ul className="mt-8 space-y-3 text-sm text-muted">
            <li>
              {group.memberCount} member{group.memberCount === 1 ? "" : "s"}, each verified
            </li>
            <li>
              An AI manager bound by {group.sleeves.length} approved assets, trades of at most {pct(group.maxTradeBps, 0)} and a {pct(group.minLiquidityBps, 0)} cash floor
            </li>
            <li>Bigger moves need {pct(group.escalateQuorumBps, 0)} of members to approve</li>
          </ul>
        ) : null}
        {group ? (
          <div className="mt-8 max-w-[280px]">
            <ChamberDial rows={rowsFromPlenum(group)} seats={group.memberCount} labels={false} />
          </div>
        ) : null}
      </div>

      <Card className="space-y-5 p-6 sm:p-8">
        <p className="text-sm text-muted">Invite expires {inTimeZone(Number(invite.expiry), profile.timeZone)}</p>
        {expired ? <Notice tone="bad">This invite has expired. Ask for a new one.</Notice> : null}
        {forSomeoneElse ? <Notice tone="bad">This invite was made for a different account.</Notice> : null}
        {!session ? (
          <>
            <p className="leading-relaxed">Set up your passkey account first. It takes a few seconds, and you'll come straight back here.</p>
            <Link
              href={`/start?next=${encodeURIComponent(`/join?${q.toString()}`)}`}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[15px] font-medium text-accent-ink"
            >
              Get started <ArrowRight size={17} />
            </Link>
          </>
        ) : (
          <>
            {verified === false ? (
              <Notice tone="warn">
                Only verified people can join.{" "}
                <Link className="text-accent underline-offset-4 hover:underline" href="/start">
                  Get verified
                </Link>{" "}
                first.
              </Notice>
            ) : null}
            <p className="text-sm leading-relaxed text-muted">Joining publishes a public key so members can share encrypted documents with you. The documents themselves stay encrypted.</p>
            <Button size="lg" busy={tx.busy} disabled={expired || !!forSomeoneElse || verified !== true || tx.busy} onClick={join} className="w-full">
              Join with passkey
            </Button>
            <TxSteps steps={tx.steps} error={tx.error} />
          </>
        )}
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
