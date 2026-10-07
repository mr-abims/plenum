# app — member web app

Implements SPEC §10–12. Next.js 16 (App Router) + React 19 + Tailwind 4 + next-intl.

- **Accounts**: Mera passkeys are the entire account layer. One passkey PRF output yields the EVM signing key
  (Mera's BIP-39/BIP-44 derivation) and, separately, the data-room X25519 key via `@plenum/crypto`. Nothing secret is
  stored; only the credential id is kept in `localStorage`. Approve, pause and consent ask for the passkey again.
- **Reads**: contract state via viem (membership and consent from `Plenum.members()` / `ConsentRegistry.grantIdsOf`).
  The activity feed uses Envio (`NEXT_PUBLIC_INDEXER_URL`) and falls back to recent chain logs in 100-block chunks.
- **Writes**: explicit gas limits on every transaction (Monad bills the declared limit).
- **Data room**: `/api/blobs/[id]` stores only encrypted envelopes; writes are signed by the owner, whose address ends
  the id. Cloudflare R2 when `R2_*` is set, otherwise a local `.blobs/` folder (DEV FALLBACK).
- **Screens**: Welcome, Get started, Create a group, Join, Group home, Manager (with decrypted, hash-checked memos),
  Approvals, Data room, Members (pause), Rules.
- Amounts show in the member's currency at an indicative rate (open.er-api.com), with USD alongside.

```sh
pnpm --filter @plenum/app dev      # copies contracts/deployments/$NEXT_PUBLIC_CHAIN_ID.json (default 31337) first
pnpm --filter @plenum/app build
```

TypeScript 5.9 is pinned here because Next.js's build-time typecheck uses the TypeScript JS API.
