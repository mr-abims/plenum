import { createPublicClient, createWalletClient, http, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Chain } from "viem";
import { cleanverseAttestationRegistrarAbi } from "@plenum/abis";

/** Anvil key 4: the MOCK Cleanverse attester used by Deploy.s.sol on local chains. */
export const LOCAL_ATTESTER_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as const;

/**
 * Verifies `subject` the way Cleanverse would (SPEC A22): the attester signs an EIP-712 Attestation and anyone relays
 * it to the registrar, the identity store's only writer.
 */
export async function attest(opts: {
  rpcUrl: string;
  chain: Chain;
  registrar: Address;
  attesterKey: Hex;
  relayerKey: Hex;
  subject: Address;
  verified?: boolean;
  country?: Hex;
  validForSeconds?: number;
}) {
  const transport = http(opts.rpcUrl);
  const pc = createPublicClient({ chain: opts.chain, transport });
  const block = await pc.getBlock();
  const now = Number(block.timestamp);
  const message = {
    subject: opts.subject,
    verified: opts.verified ?? true,
    tier: 1,
    country: opts.country ?? "0x0000",
    issuedAt: BigInt(now - 1),
    expiresAt: BigInt(now + (opts.validForSeconds ?? 365 * 86_400)),
    nonce: BigInt(keccak256(toHex(`${opts.subject}:${now}:${Math.random()}`))),
  } as const;
  const attester = privateKeyToAccount(opts.attesterKey);
  const signature = await attester.signTypedData({
    domain: { name: "Cleanverse Attestation Registrar", version: "1", chainId: opts.chain.id, verifyingContract: opts.registrar },
    types: {
      Attestation: [
        { name: "subject", type: "address" },
        { name: "verified", type: "bool" },
        { name: "tier", type: "uint8" },
        { name: "country", type: "bytes2" },
        { name: "issuedAt", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "Attestation",
    message,
  });
  const relayer = createWalletClient({ chain: opts.chain, transport, account: privateKeyToAccount(opts.relayerKey) });
  const hash = await relayer.writeContract({
    address: opts.registrar,
    abi: cleanverseAttestationRegistrarAbi,
    functionName: "submit",
    args: [message, signature],
  });
  return pc.waitForTransactionReceipt({ hash });
}
