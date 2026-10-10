# Plenum

**Who guards the guardian? Your rules do.**

An AI money manager for groups that invest together. It is bound by rules the group writes,
by its members' verified identities and by an independent price, all enforced by contracts on
**Monad testnet** (chain 10143).

> Hackathon build for Monad Metropolis, Track 04 (Trust, Identity & AI Infrastructure). Software, not a
> fund or an adviser. Testnet only. Every mock and fallback is labelled **MOCK** or **FALLBACK**.

## Layout

| Folder | What |
| --- | --- |
| `contracts/` | Foundry: Plenum, Mandate, ComplianceGate, Governance, ManagerGateway, NavOracle, ConsentRegistry, factory, mock adapters |
| `agent/` | AI manager runtime (Qwen 3.8 Max), red-team suite |
| `cre/` | Chainlink CRE NAV workflow |
| `indexer/` | Envio HyperIndex |
| `app/` | Next.js member app (Mera passkeys) |
| `packages/crypto/` | Data-room cryptography |
| `docs/` | Spec, session prompts, AI disclosure, threat model, bounty adherence |

## Deployed (Monad testnet)

All contract addresses, source verification and evidence transactions: [docs/deployments.md](docs/deployments.md).

## Setup

```sh
pnpm install
cd contracts && forge build && forge test
```

More sections to come: architecture, deployed addresses, Why Monad, threat model and test results,
bounty adherence, AI-tool disclosure.

## Licence

MIT
