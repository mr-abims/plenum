# app — member web app

Implements SPEC §10–12. Next.js 16 (App Router) + React 19 + Tailwind 4 + next-intl.

- **Accounts**: Mera passkeys are the entire account layer. One passkey PRF output yields the EVM signing key
  (Mera's BIP-39/BIP-44 derivation) and, separately, the data-room X25519 key via `@plenum/crypto`. Nothing secret is
  stored; only the credential id is kept in `localStorage`. Contribute, join and preferences sign prompt-free with
  the in-memory signing session; approve, pause and consent ask for the passkey again. Sessions end on reload,
  sign-out or 30 minutes without activity.
- **Testnet onboarding (MOCK)**: right after the passkey prompt, `/api/testnet/onboard` (server-only faucet key) mints
  10,000 MOCK test dollars and drips 1 MON for gas (creating a group costs ~0.29 MON on Monad) to new accounts; idempotent, signed by the account.
- **Reads**: contract state via viem (membership and consent from `Plenum.members()` / `ConsentRegistry.grantIdsOf`).
  The activity feed uses Envio (`NEXT_PUBLIC_INDEXER_URL`) and falls back to recent chain logs in 100-block chunks.
- **Writes**: explicit gas limits on every transaction (Monad bills the declared limit).
- **Data room**: `/api/blobs/[id]` stores only encrypted envelopes; writes are signed by the owner, whose address ends
  the id. Storage: Cloudflare R2 if `R2_*` is set, else Vercel Blob (private) if `BLOB_READ_WRITE_TOKEN` is set, else a
  local `.blobs/` folder (DEV FALLBACK, never on Vercel).
- **Screens**: Landing (live rule console against Showcase Club), Start (passkey, automatic setup, your groups and
  portfolios), Create (group or personal portfolio), Join, Group home, Manager (decrypted, hash-checked memos;
  ERC-8004 identity and member ratings), Approvals, Data room, Members / Controls (pause), Rules, and `/verify`.
- Amounts show in the member's currency at an indicative rate (open.er-api.com), with USD alongside.

```sh
pnpm --filter @plenum/app dev      # copies contracts/deployments/$NEXT_PUBLIC_CHAIN_ID.json (default 31337) first
pnpm --filter @plenum/app build
```

TypeScript 5.9 is pinned here because Next.js's build-time typecheck uses the TypeScript JS API.

## Deploying on Vercel

Verified with a fresh-clone build (`VERCEL=1`, frozen lockfile). Project settings:

| Setting | Value |
| --- | --- |
| Root Directory | `app` (keep "Include files outside the root directory" on: the build reads `contracts/deployments/10143.json` and the workspace packages) |
| Framework | Next.js (auto-detected) |
| Node.js | 22.x |
| Install / build commands | defaults (pnpm is detected from the root lockfile) |

Environment variables:

| Variable | Value |
| --- | --- |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`, so Vercel uses the repo's `packageManager` (pnpm 11.22.0) that wrote the lockfile |
| `NEXT_PUBLIC_CHAIN_ID` | `10143` (the default if unset) |
| `NEXT_PUBLIC_RPC_URL` | `https://testnet-rpc.monad.xyz` |
| `NEXT_PUBLIC_INDEXER_URL` | the **hosted** Envio GraphQL URL (must be HTTPS; `localhost` won't work) |
| `NEXT_PUBLIC_MANAGER_ADDRESS` | the manager operator address |
| `NEXT_PUBLIC_MANAGER_ENC_PUBKEY` | output of `pnpm --filter @plenum/agent manager-key` |
| `FAUCET_PRIVATE_KEY` | Server-only key with `MINTER_ROLE` on the MOCK test dollar and some MON: powers testnet onboarding. Without it `/api/testnet/onboard` returns 503 |
| `BLOB_READ_WRITE_TOKEN` | Added automatically (or `BLOB_STORE_ID` via OIDC) when you connect a **Vercel Blob** store to the project (Storage → Create → Blob). **Required on Vercel** unless R2 is set: without storage the data-room API returns 503 (the local `.blobs/` fallback only runs off Vercel) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Optional: Cloudflare R2 instead of Vercel Blob (takes priority when set) |

**Passkeys are bound to the domain.** Accounts created on `localhost` or a preview URL don't work on the production
domain. Pick the final domain (e.g. `plenum.vercel.app` or a custom one) **before** creating the demo members' passkeys.
