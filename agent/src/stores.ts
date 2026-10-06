import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
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
