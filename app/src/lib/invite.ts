import { encodeAbiParameters, zeroAddress, type Address, type Hex, type LocalAccount } from "viem";
import { CHAIN } from "./config";

/** SPEC A16: EIP-712 Invite signed by the organizer or any member. invitee = 0x0 makes an open single-use link. */
export async function signInvite(account: LocalAccount, plenum: Address, invitee: Address = zeroAddress, days = 7) {
  const nonce = BigInt(`0x${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("")}`);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86_400);
  const signature = await account.signTypedData({
    domain: { name: "Plenum", version: "1", chainId: CHAIN.id, verifyingContract: plenum },
    types: { Invite: [{ name: "invitee", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint64" }] },
    primaryType: "Invite",
    message: { invitee, nonce, expiry },
  });
  return { plenum, invitee, nonce, expiry, signature };
}

export type Invite = Awaited<ReturnType<typeof signInvite>>;

export function inviteLink(origin: string, i: Invite): string {
  const q = new URLSearchParams({ p: i.plenum, i: i.invitee, n: i.nonce.toString(), e: i.expiry.toString(), s: i.signature });
  return `${origin}/join?${q}`;
}

export function parseInvite(q: URLSearchParams): Invite | undefined {
  const p = q.get("p"), i = q.get("i"), n = q.get("n"), e = q.get("e"), s = q.get("s");
  if (!p || !i || !n || !e || !s) return undefined;
  return { plenum: p as Address, invitee: i as Address, nonce: BigInt(n), expiry: BigInt(e), signature: s as Hex };
}

export function encodeInvite(i: Invite): Hex {
  return encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes" }],
    [i.invitee, i.nonce, i.expiry, i.signature],
  );
}
