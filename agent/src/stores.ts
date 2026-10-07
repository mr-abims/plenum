import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Address, Hex } from "viem";
import { plenumAbi } from "@plenum/abis";
import {
  blobMessage,
  bytes32ToPublicKey,
  decryptDocument,
  encryptDocument,
  memoDocId,
  riskDocId,
  type EncryptionKeyPair,
  type Envelope,
} from "@plenum/crypto";
import type { Clients } from "./chain.ts";
import type { Memo } from "./schema.ts";

/** Where full memos go. Only keccak256(memo) is onchain. */
export interface MemoStore {
  save(hash: string, memo: Memo): Promise<void>;
}

/**
 * TODO(data room): memos must be encrypted to every member's X25519 key and stored in R2 (SPEC §10).
 * Until @plenum/crypto lands this writes plaintext JSON to a local, gitignored directory.
 */
export class FileMemoStore implements MemoStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
  }

  async save(hash: string, memo: Memo): Promise<void> {
    writeFileSync(join(this.dir, `${hash}.json`), JSON.stringify(memo, null, 2));
  }
}

/** Decrypted member risk summaries, available only behind an active onchain consent grant. */
export interface MemberContextSource {
  get(member: string): Promise<string | undefined>;
}

/**
 * TODO(data room): replace with HPKE unwrap of the member's consent-wrapped document key (SPEC §10).
 * Until then, reads `<dir>/<member>.txt` as the already-decrypted summary.
 */
export class FileMemberContext implements MemberContextSource {
  constructor(private readonly dir: string) {}

  async get(member: string): Promise<string | undefined> {
    const path = join(this.dir, `${member.toLowerCase()}.txt`);
    return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  }
}

export class InMemoryMemberContext implements MemberContextSource {
  constructor(private readonly docs: Record<string, string>) {}

  async get(member: string): Promise<string | undefined> {
    return this.docs[member.toLowerCase()];
  }
}

// ------------------------------------------------------------------ data room



async function putBlob(clients: Clients, apiUrl: string, id: string, env: Envelope) {
  const body = JSON.stringify(env);
  const at = Math.floor(Date.now() / 1000);
  const hash = createHash("sha256").update(body).digest("hex");
  const signature = await clients.account.signMessage({ message: blobMessage(id, "PUT", hash, at) });
  const res = await fetch(`${apiUrl}/${id}`, {
    method: "PUT",
    headers: { "x-plenum-signer": clients.account.address, "x-plenum-signature": signature, "x-plenum-at": String(at) },
    body,
  });
  if (!res.ok) throw new Error(`memo upload failed: ${res.status} ${await res.text()}`);
}

/**
 * SPEC §8 "Explain": the full memo is encrypted to every member's published X25519 key (and the manager's own) and
 * stored under its committed rationale hash; only keccak256(memo) is onchain.
 */
export class BlobMemoStore implements MemoStore {
  constructor(
    private readonly clients: Clients,
    private readonly plenum: Address,
    private readonly apiUrl: string,
    private readonly encryption: EncryptionKeyPair,
  ) {}

  async save(hash: string, memo: Memo): Promise<void> {
    const pc = this.clients.publicClient;
    const members = (await pc.readContract({ address: this.plenum, abi: plenumAbi, functionName: "members" })) as Address[];
    const keys = await Promise.all(
      members.map((m) => pc.readContract({ address: this.plenum, abi: plenumAbi, functionName: "encPubKeyOf", args: [m] }) as Promise<Hex>),
    );
    const readers = [this.encryption.publicKey, ...keys.filter((k) => /[1-9a-f]/.test(k.slice(2))).map(bytes32ToPublicKey)];
    const id = memoDocId(hash, this.clients.account.address);
    await putBlob(this.clients, this.apiUrl, id, await encryptDocument(id, new TextEncoder().encode(JSON.stringify(memo)), readers));
  }
}

/** Reads a member's risk questionnaire from the data room with the manager's key (only after a consent check). */
export class BlobMemberContext implements MemberContextSource {
  constructor(
    private readonly plenum: Address,
    private readonly apiUrl: string,
    private readonly encryption: EncryptionKeyPair,
  ) {}

  async get(member: string): Promise<string | undefined> {
    const res = await fetch(`${this.apiUrl}/${riskDocId(this.plenum, member)}`);
    if (!res.ok) return undefined;
    try {
      return new TextDecoder().decode(await decryptDocument((await res.json()) as Envelope, this.encryption));
    } catch {
      return undefined; // not shared with the manager (no wrapped key for us)
    }
  }
}
