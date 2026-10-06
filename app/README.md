# app — member web app

Implements SPEC §10–12. Session 5 (Oct 11).

Next.js (App Router) + TypeScript + Tailwind + next-intl. Members sign in with Mera passkeys
(`@category-labs/mera`, `toViemAccount` from `@category-labs/mera/viem`) feeding viem directly. No
wallet-connector libraries. `PRF_UNAVAILABLE` gets a clear message (desktop Chrome local passkeys do not
return PRF; use iCloud Keychain or Google Password Manager). Every transaction sets an explicit gas limit.

Screens: Welcome, Get started, Create a group, Group home, Manager, Approvals, Data room, Members, Rules.
Encrypted documents are stored in Cloudflare R2 (ciphertext only) via a small server route.
