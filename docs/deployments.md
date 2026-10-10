# Deployments — Monad testnet (chain 10143)

Deployed 2026-10-10 from `contracts/script/Deploy.s.sol` (start block 69734135). All contracts are source-verified on MonadVision (Sourcify).
Contracts labelled MOCK are testnet stand-ins (identity, settlement asset, asset adapters).

## Shared contracts

| Contract | Address |
| --- | --- |
| PlenumFactory | [`0xac8EB65C78cB34FdEb1E3e122e6aA6807419F5a4`](https://testnet.monadvision.com/address/0xac8EB65C78cB34FdEb1E3e122e6aA6807419F5a4) |
| NavOracle | [`0xC45Fa55564BF4B53729c139D4613BfA295f3ad4a`](https://testnet.monadvision.com/address/0xC45Fa55564BF4B53729c139D4613BfA295f3ad4a) |
| ComplianceGate | [`0x37c4Ee488d4B8bD529D6D8a0dF2e74CbDAaf1E5B`](https://testnet.monadvision.com/address/0x37c4Ee488d4B8bD529D6D8a0dF2e74CbDAaf1E5B) |
| ConsentRegistry | [`0xa86c0d0fC110827c0ac40728D60e2987f4d5B1f2`](https://testnet.monadvision.com/address/0xa86c0d0fC110827c0ac40728D60e2987f4d5B1f2) |
| MockIdentityProvider (MOCK) | [`0x6a831Be9424d496a776BE88C9f3Cdf1F50718b0f`](https://testnet.monadvision.com/address/0x6a831Be9424d496a776BE88C9f3Cdf1F50718b0f) |
| CleanverseAttestationRegistrar (only writer of identities; signer is the MOCK Cleanverse attester `0x77B3d364521B10aE6a6B91a6Dd1081Bf140EE0B5`) | [`0xD08819268ACf957F479cdDdBa3b47B008c6041cE`](https://testnet.monadvision.com/address/0xD08819268ACf957F479cdDdBa3b47B008c6041cE) |
| MockAToken mvUSD (MOCK) | [`0x0f7bcF010d76Ca9f5159f9A66c82fBAaA9520D83`](https://testnet.monadvision.com/address/0x0f7bcF010d76Ca9f5159f9A66c82fBAaA9520D83) |
| MockTBillVault (MOCK) | [`0x6b075Ea481D5aCd181103EaF0E8A7FD66C9cAF5C`](https://testnet.monadvision.com/address/0x6b075Ea481D5aCd181103EaF0E8A7FD66C9cAF5C) |
| MockCreditVault (MOCK) | [`0x9a62126a6F6A44A6e59F7B8e18494Bf4972C661c`](https://testnet.monadvision.com/address/0x9a62126a6F6A44A6e59F7B8e18494Bf4972C661c) |
| MockGold (MOCK) | [`0x55e930008cB8d3f7A545edB99a8C8B16faca17c4`](https://testnet.monadvision.com/address/0x55e930008cB8d3f7A545edB99a8C8B16faca17c4) |

Bundle implementations (cloned per group):

| Contract | Address |
| --- | --- |
| Plenum (implementation) | [`0xdc34891af8154be35a3e5607aa637cb6f3cda713`](https://testnet.monadvision.com/address/0xdc34891af8154be35a3e5607aa637cb6f3cda713) |
| Mandate (implementation) | [`0x8b3cba3e8c81854a35b6c9d02be299d2131ce465`](https://testnet.monadvision.com/address/0x8b3cba3e8c81854a35b6c9d02be299d2131ce465) |
| Governance (implementation) | [`0x66e37d72632dffcb9a9e05c61fbf87b3ca8d7584`](https://testnet.monadvision.com/address/0x66e37d72632dffcb9a9e05c61fbf87b3ca8d7584) |
| ManagerGateway (implementation) | [`0x6eb138d235ff16357843b8f9ca188282a2d04f83`](https://testnet.monadvision.com/address/0x6eb138d235ff16357843b8f9ca188282a2d04f83) |

CRE forwarder configured on NavOracle: `0xB9F79d863261869B234c481D1f9A7af84AeAd192` (CRE mock forwarder for `cre workflow simulate --broadcast`).

## Rehearsal plenum (Balanced, demo timing)

| Plenum | [`0xB064930973b05060CD0972b66847eCD27171aea4`](https://testnet.monadvision.com/address/0xB064930973b05060CD0972b66847eCD27171aea4) |

## Showcase plenum (Balanced, 30-day price window)

Asked live by the landing page's "Try to break the rules" console through `ManagerGateway.simulate`. Priced by the CRE workflow.

| Contract | Address |
| --- | --- |
| Plenum | [`0x856c63bBD03F051fCf7291fA1ae578b146153f24`](https://testnet.monadvision.com/address/0x856c63bBD03F051fCf7291fA1ae578b146153f24) |
| ManagerGateway | [`0x925a25B824b5880Ab3B7598f0653d56bB401721a`](https://testnet.monadvision.com/address/0x925a25B824b5880Ab3B7598f0653d56bB401721a) |

## AI manager identity (ERC-8004)

| What | Where |
| --- | --- |
| IdentityRegistry (canonical, Monad testnet) | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadvision.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| ReputationRegistry (canonical, Monad testnet) | [`0x8004B663056A597Dffe9eCcC1965A193B7388713`](https://testnet.monadvision.com/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |
| Plenum Manager: agent **#2128**, owned by the operator `0x6B050A5Acc5A693916614C2fb365Dc60cc9db8D8` | agent card: https://plenumx.vercel.app/agents/plenum-manager.json |

## Evidence

| What | Transaction |
| --- | --- |
| Manager executes an in-band rebalance (withdraw 300 from the T-bill sleeve) with rationale hash and model ID | [0xbf0a8c87…](https://testnet.monadvision.com/tx/0xbf0a8c8750fb5baa0a0859d0b17134c0b322d4329b1146a7a40e6019f26316ea) |
| Chainlink CRE workflow (simulated with `--broadcast`) reads holdings at the finalized block and writes `NavReported(…, CRE)` through the mock forwarder | [0x3c0dcc7b…](https://testnet.monadvision.com/tx/0x3c0dcc7b2cd7b6ab02bade2bead41905440831511db57345ae32d6551f8e2ff8) |
| Agent runtime (scripted plan) executes an in-band rebalance; encrypted memo published, hash matches onchain | [0x8ad9effd…](https://testnet.monadvision.com/tx/0x8ad9effd34c515fe2cb88be5fe95f99986f0097f95c5ebfa4db4e67595c066aa) |
| Agent runtime refuses an oversized trade in-band (`TRADE_TOO_LARGE`) and escalates it to a proposal | [0x693cd26c…](https://testnet.monadvision.com/tx/0x693cd26ce14e04a3bb6eb2c1b9119ff536039641460bd69ee15ed11eaa011c91) |
| Member approves proposal 2 | [0x28c7f1fd…](https://testnet.monadvision.com/tx/0x28c7f1fd423c9d303215f9a0e553e56ae42bd9f2fad8a5623a076911a113a615) |
| Proposal 2 executed after quorum (re-checks allowlist and NAV freshness) | [0x5dc4255f…](https://testnet.monadvision.com/tx/0x5dc4255f9a1dc9a0f17681ba5bb86d01bad534e446d57546e9c3a7ce9b3a1447) |
| A signed Cleanverse attestation (MOCK signer) verifies a new person: `checkMember` goes from `MEMBER_NOT_VERIFIED` to `OK`; the deployer can no longer set identities directly | [0xc9d9acad…](https://testnet.monadvision.com/tx/0xc9d9acad40b268366d2352b7457fef8e98e3f3013394372f38fd8a52c18251ba) |
| The manager registers its ERC-8004 identity (agent #2128, `tokenURI` = agent card) | [0xbb2a824b…](https://testnet.monadvision.com/tx/0xbb2a824bfa8aeb9e8d10b090aba87c205985aa580e9d3e835ea00c4778920503) |
| A group member rates the in-band action 100/100 (`plenum`/`rebalance`, `feedbackHash` = its rationale hash); `getSummary` over the group's members returns count 1, and over a non-member returns 0 | [0xf69991fb…](https://testnet.monadvision.com/tx/0xf69991fb4ffd4df27da9d90a7b469740dbc16141b15f2f44adcc0b0805a46113) |
| Forced call with the manager key to move 4,000 to 0xABC… reverts `PolicyViolation(ADAPTER_NOT_ALLOWED)` | [0x42254307…](https://testnet.monadvision.com/tx/0x42254307eb4048176a04c67bf922b97168c8dfdd05775cdc5d1455758dbc3c3f) |

## Notes

- **Model provenance on the rehearsal transactions:** the in-band rebalances (`0xbf0a8c87…`, `0x8ad9effd…`), the escalation
  (`0x693cd26c…`) and the forced call (`0x42254307…`) record model id `qwen3.8-max`, but no model ran: the plan was scripted
  (rehearsal tooling) or sent with `cast`. The scripted stand-in now records `scripted-plan`. Transactions written by a live
  model will be listed separately.

- Monad's public RPC allows about 15 requests/second: the app and agent batch reads through Multicall3 and retry with backoff.
- `agent/scripts/testnet-rehearsal.ts` reproduces the evidence above end to end (CRE pricing, in-band, escalation, approval, execution, memo check).

- Monad prices some operations (cold storage, account access) above Ethereum, so Forge's local gas estimates are too low.
  Run Forge scripts with `--gas-estimate-multiplier 250`. The app and agent use the Monad RPC's own `eth_estimateGas` + 20%.
- An earlier rehearsal attempt (`0x02Ad76c0…`) ran out of gas mid-script and was abandoned; it holds no funds.
