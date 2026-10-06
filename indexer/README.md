# indexer — Envio HyperIndex

Implements SPEC §11 (plus amendment A3). Envio HyperIndex v3 on Monad testnet (HyperSync
`https://10143.hypersync.xyz`, RPC fallback).

- `config.yaml` is generated from `contracts/deployments/<chainId>.json` by `scripts/config.mjs`
  (`pnpm --filter @plenum/indexer config 10143` after the testnet deploy; `31337` for a local anvil chain).
- Per-group clones (Plenum, ManagerGateway, Governance) are registered dynamically from `PlenumCreated`;
  `ContractLink` maps each gateway/governance clone back to its plenum.
- Entities (`schema.graphql`): Plenum, Member, ManagerAction, Proposal, Approval, ComplianceRefusal, NavReport,
  ConsentGrant, and an Activity feed row for every member-facing event (RP-1).
- Handlers: `src/handlers/plenum.ts`. ABIs come from `@plenum/abis` (generated from the Foundry build).

## Run

```sh
pnpm --filter @plenum/indexer config 10143   # or 31337 for local
pnpm --filter @plenum/indexer codegen
pnpm --filter @plenum/indexer dev            # needs Docker running (Postgres + Hasura GraphQL)
```

Fallback if Envio is unavailable: the app reads the same events with direct viem log queries.
