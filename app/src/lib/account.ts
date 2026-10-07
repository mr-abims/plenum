"use client";

import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { deriveEncryptionKey, type EncryptionKeyPair } from "@plenum/crypto";
import type { LocalAccount } from "viem";

const CREDENTIAL_KEY = "plenum.credential";

/** Mera's standard derivation: PRF output → BIP-39 entropy → BIP-44 EVM key (portable to any wallet). */
function deriveEvmKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (!node.privateKey) throw new Error("derivation produced no key");
  return node.privateKey;
}

export interface MemberSession {
  account: LocalAccount;
  /** Data-room key pair: HKDF(PRF, "plenum", "plenum/x25519/v1") → X25519. A second, non-wallet key from one passkey. */
  encryption: EncryptionKeyPair;
  end: () => void;
}

function open(prfOutput: Uint8Array): MemberSession {
  const session: Secp256k1SigningSession = createSecp256k1SigningSession({ privateKey: deriveEvmKey(prfOutput) });
  const encryption = deriveEncryptionKey(prfOutput);
  prfOutput.fill(0); // never kept
  return {
    account: toViemAccount(session),
    encryption,
    end: () => {
      session.end();
      encryption.privateKey.fill(0);
    },
  };
}

function storedCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    return raw ? (JSON.parse(raw) as PasskeyCredentialMetadata) : undefined;
  } catch {
    return undefined;
  }
}

export async function createAccount(displayName: string): Promise<MemberSession> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: location.hostname, name: "Plenum" },
    user: { name: displayName, displayName },
  });
  try {
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ credentialId: created.credentialId, transports: created.transports }));
  } catch {}
  return open(created.prfOutput);
}

export async function signIn(): Promise<MemberSession> {
  const known = storedCredential();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({ rpId: location.hostname, credential: known });
  try {
    // Remember which passkey was used (a fresh device picks it in discoverable mode).
    const transports = known?.credentialId === credentialId ? known.transports : undefined;
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify({ credentialId, transports }));
  } catch {}
  return open(prfOutput);
}

/** Step-up check before sensitive actions (approve, pause, consent): the member confirms with their passkey again. */
export async function confirmWithPasskey(expected: string): Promise<void> {
  const { prfOutput } = await getPasskeyPrfOutput({ rpId: location.hostname, credential: storedCredential() });
  const again = open(prfOutput);
  const same = again.account.address.toLowerCase() === expected.toLowerCase();
  again.end();
  if (!same) throw new Error("That passkey belongs to a different account.");
}

export function hasStoredPasskey(): boolean {
  return storedCredential() !== undefined;
}

export function explainMeraError(err: unknown): string {
  if (isMeraError(err)) {
    switch (err.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey can't create a Plenum account. Use iCloud Keychain, Google Password Manager or 1Password. Passkeys saved only in desktop Chrome don't support it.";
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey prompt was cancelled or isn't available in this browser.";
      case "CRYPTO_UNAVAILABLE":
        return "This browser can't do the cryptography Plenum needs. Try a current Safari, Chrome or Firefox.";
      case "SESSION_ENDED":
        return "Your session ended. Sign in again.";
    }
  }
  return err instanceof Error ? err.message : String(err);
}
