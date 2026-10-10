# cre — Chainlink CRE NAV workflow

Implements SPEC §9 (amendments A10, A17). The fund administrator: the manager never writes NAV.

`plenum-nav/main.ts` runs on a cron (`config.json` → `schedule`, every minute for the demo) and on an HTTP
trigger. For each configured plenum it reads, at the **last finalized block** on Monad testnet:
`Plenum.mandate()`, `Plenum.cash()`, `Mandate.config()` and every adapter's `valueOf` / `pendingOf`; computes
NAV = cash + Σ(value + pending) and signed per-sleeve drift in bps (`plenum-nav/nav.ts`); and writes
`abi.encode(plenum, nav, int256[] driftBps, uint64 timestamp)` through the forwarder to the shared `NavOracle`.
The timestamp is the finalized block's, so it is never ahead of chain time (NavOracle rejects future reports).

- SDK `@chainlink/cre-sdk` 1.23.0 (chain selector `monad-testnet`). The CRE compiler needs **TypeScript 5**
  (it uses the TS JS API, which TypeScript 7 does not ship) and Bun.
- Forwarders (`monad-testnet`): mock `0xB9F79d863261869B234c481D1f9A7af84AeAd192` for
  `cre workflow simulate --broadcast` (the default in `contracts/script/Deploy.s.sol`), production
  `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`.
- ABIs are copied into `plenum-nav/abis.ts` by `scripts/abis.mjs` so the workflow bundles standalone.

## Run

```sh
pnpm --filter @plenum/cre test       # NAV math + report encoding round-trip
pnpm --filter @plenum/cre compile    # bun x cre-compile → dist/plenum-nav.wasm (verified locally)
```

Simulation (CRE CLI v1.38, after `cre login`). `project.yaml` / `plenum-nav/workflow.yaml` follow the format
`cre init` generates. `cre/.env` (gitignored) holds `CRE_ETH_PRIVATE_KEY`, the gas payer for broadcasts; onchain
authority comes from the forwarder address NavOracle trusts, not from this key.

```sh
cd cre
cre workflow simulate plenum-nav --target staging-settings --trigger-index 0 --non-interactive            # dry run
cre workflow simulate plenum-nav --target staging-settings --trigger-index 0 --non-interactive --broadcast
```

Verified on Monad testnet: the broadcast run wrote `NavReported(plenum, 10000000000, …, CRE)` (see
`docs/deployments.md`). `pnpm-workspace.yaml` pins TypeScript 5.9.3 for `@chainlink/cre-sdk` via
`packageExtensions`: its compiler imports `typescript` at runtime but only lists it as a devDependency.

If simulation is blocked, the labelled FALLBACK writer (`NavOracle.fallbackWrite`) keeps the demo running.
