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

## Evidence

| What | Transaction |
| --- | --- |
| Manager executes an in-band rebalance (withdraw 300 from the T-bill sleeve) with rationale hash and model ID | [0xbf0a8c87…](https://testnet.monadvision.com/tx/0xbf0a8c8750fb5baa0a0859d0b17134c0b322d4329b1146a7a40e6019f26316ea) |
| Chainlink CRE workflow (simulated with `--broadcast`) reads holdings at the finalized block and writes `NavReported(…, CRE)` through the mock forwarder | [0x3c0dcc7b…](https://testnet.monadvision.com/tx/0x3c0dcc7b2cd7b6ab02bade2bead41905440831511db57345ae32d6551f8e2ff8) |
| Agent runtime (scripted plan) executes an in-band rebalance; encrypted memo published, hash matches onchain | [0x8ad9effd…](https://testnet.monadvision.com/tx/0x8ad9effd34c515fe2cb88be5fe95f99986f0097f95c5ebfa4db4e67595c066aa) |
| Agent runtime refuses an oversized trade in-band (`TRADE_TOO_LARGE`) and escalates it to a proposal | [0x693cd26c…](https://testnet.monadvision.com/tx/0x693cd26ce14e04a3bb6eb2c1b9119ff536039641460bd69ee15ed11eaa011c91) |
| Member approves proposal 2 | [0x28c7f1fd…](https://testnet.monadvision.com/tx/0x28c7f1fd423c9d303215f9a0e553e56ae42bd9f2fad8a5623a076911a113a615) |
| Proposal 2 executed after quorum (re-checks allowlist and NAV freshness) | [0x5dc4255f…](https://testnet.monadvision.com/tx/0x5dc4255f9a1dc9a0f17681ba5bb86d01bad534e446d57546e9c3a7ce9b3a1447) |
| Forced call with the manager key to move 4,000 to 0xABC… reverts `PolicyViolation(ADAPTER_NOT_ALLOWED)` | [0x42254307…](https://testnet.monadvision.com/tx/0x42254307eb4048176a04c67bf922b97168c8dfdd05775cdc5d1455758dbc3c3f) |

## Notes

- Monad's public RPC allows about 15 requests/second: the app and agent batch reads through Multicall3 and retry with backoff.
- `agent/scripts/testnet-rehearsal.ts` reproduces the evidence above end to end (CRE pricing, in-band, escalation, approval, execution, memo check).

- Monad prices some operations (cold storage, account access) above Ethereum, so Forge's local gas estimates are too low.
  Run Forge scripts with `--gas-estimate-multiplier 250`. The app and agent use the Monad RPC's own `eth_estimateGas` + 20%.
- An earlier rehearsal attempt (`0x02Ad76c0…`) ran out of gas mid-script and was abandoned; it holds no funds.
