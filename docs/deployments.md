# Deployments — Monad testnet (chain 10143)

Deployed 2026-10-11 from `contracts/script/Deploy.s.sol` (start block 70007847; the last two contracts and the role
grants were finished with `forge create` / `cast` after a Forge broadcast stalled). All contracts are source-verified
on Sourcify (MonadVision). Contracts labelled MOCK are testnet stand-ins (test dollar, asset adapters).

This deployment follows SPEC A25 (identity layer removed, CRE prices gold from real market data). The previous
deployment (start block 69734135) is superseded; its addresses and transactions remain in git history.

## Shared contracts

| Contract | Address |
| --- | --- |
| MockUSD (MOCK test dollar, mUSD) | [`0x4140C16B06ccEE9AD1968cd326dBC05712D3F7Dd`](https://testnet.monadvision.com/address/0x4140C16B06ccEE9AD1968cd326dBC05712D3F7Dd) |
| NavOracle | [`0x925ce04252f13c24544009294E0C296D7C357cf4`](https://testnet.monadvision.com/address/0x925ce04252f13c24544009294E0C296D7C357cf4) |
| ConsentRegistry | [`0xE0F8572E251eC25A3C884278Fd2669163245c900`](https://testnet.monadvision.com/address/0xE0F8572E251eC25A3C884278Fd2669163245c900) |
| MockTBillVault (MOCK) | [`0x8BAccF02b17e87F0d9DBfcF82FebC6a5C8d9c90A`](https://testnet.monadvision.com/address/0x8BAccF02b17e87F0d9DBfcF82FebC6a5C8d9c90A) |
| MockCreditVault (MOCK) | [`0xEC02e595cBb542B82C57C7f2431b71da09BCDA50`](https://testnet.monadvision.com/address/0xEC02e595cBb542B82C57C7f2431b71da09BCDA50) |
| MockGold (MOCK asset, priced at the real spot price by CRE) | [`0x688AFfb0CdF16146BadAFfffC2431F28b9E45E85`](https://testnet.monadvision.com/address/0x688AFfb0CdF16146BadAFfffC2431F28b9E45E85) |
| PlenumFactory | [`0xA84fcA0D819E6d1004fa2F2071E51C0fc4408649`](https://testnet.monadvision.com/address/0xA84fcA0D819E6d1004fa2F2071E51C0fc4408649) |

CRE forwarder configured on `NavOracle` and `MockGold`: `0xB9F79d863261869B234c481D1f9A7af84AeAd192` (CRE mock
forwarder for `cre workflow simulate --broadcast`). Testnet onboarding faucet (MOCK, mints test dollars, drips gas):
`0x3F85F6ECBE6ad83988f097575e47c3EB91dC6A3f`.

## Bundle implementations (cloned per group)

| Contract | Address |
| --- | --- |
| Plenum (implementation) | [`0xC6F9681EB45ae5e0279FAdEb2e6AA7739CC2a954`](https://testnet.monadvision.com/address/0xC6F9681EB45ae5e0279FAdEb2e6AA7739CC2a954) |
| Mandate (implementation) | [`0x1979a263292d87eFa38Be5745A7B661BDc103Ec6`](https://testnet.monadvision.com/address/0x1979a263292d87eFa38Be5745A7B661BDc103Ec6) |
| Governance (implementation) | [`0x852D4123ef200C851c0266831e84e8f160011fCb`](https://testnet.monadvision.com/address/0x852D4123ef200C851c0266831e84e8f160011fCb) |
| ManagerGateway (implementation) | [`0xb8e40D71FA763F8468Db10401c9F9dcED083DE38`](https://testnet.monadvision.com/address/0xb8e40D71FA763F8468Db10401c9F9dcED083DE38) |

## Groups

| Group | Plenum | ManagerGateway |
| --- | --- | --- |
| Rehearsal Club (Balanced, demo timing; used by the agent rehearsal) | [`0xE66A3b31097c733499029AaAcb84F23231B0aaDb`](https://testnet.monadvision.com/address/0xE66A3b31097c733499029AaAcb84F23231B0aaDb) | [`0x262d92BBccF6ee1cAeDC5f0062e5BDc95b162Bbb`](https://testnet.monadvision.com/address/0x262d92BBccF6ee1cAeDC5f0062e5BDc95b162Bbb) |
| Showcase Club (Balanced, 30-day price window; asked live by the landing page console) | [`0x92b7F27235622418B254C9B50b6B90aB330936BC`](https://testnet.monadvision.com/address/0x92b7F27235622418B254C9B50b6B90aB330936BC) | [`0x0138B705D683FC56481FBFD72d44a59c17FE1803`](https://testnet.monadvision.com/address/0x0138B705D683FC56481FBFD72d44a59c17FE1803) |

## AI manager identity (ERC-8004)

| What | Where |
| --- | --- |
| IdentityRegistry (canonical, Monad testnet) | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://testnet.monadvision.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| ReputationRegistry (canonical, Monad testnet) | [`0x8004B663056A597Dffe9eCcC1965A193B7388713`](https://testnet.monadvision.com/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |
| Plenum Manager: agent **#2128**, owned by the operator `0x6B050A5Acc5A693916614C2fb365Dc60cc9db8D8` | agent card: https://plenumx.vercel.app/agents/plenum-manager.json |

## Evidence

| What | Transaction |
| --- | --- |
| Chainlink CRE fetches the gold spot price from an external API (median across nodes) and reports it to `MockGold` through the forwarder: price 4195.600098 USD/oz | [0x9136ba2d…](https://testnet.monadvision.com/tx/0x9136ba2db32ff7cbfcc9df6bcf360f696594f2bc4becdb8fd8bebb80fc07cb66) |
| Chainlink CRE reads Showcase Club's holdings at the finalized block, values gold at that price and writes `NavReported(…, CRE)` | [0xfc925a89…](https://testnet.monadvision.com/tx/0xfc925a89ea1abc2c85317633289a867dceba2bdcb99356a94d0a3b10b9f50f98) |
| The manager trims the overweight gold sleeve in-band (sell 500), committing its memo hash and model id | [0x71e45168…](https://testnet.monadvision.com/tx/0x71e4516824d31c87ed77ddc60dc843f29fe8271f4c6b5268aca48fc78de87885) |
| An oversized move (15% of the fund, gold → T-bills) is refused in-band (`TRADE_TOO_LARGE`) and escalated to a proposal | [0x7026de79…](https://testnet.monadvision.com/tx/0x7026de791cb4f2da09ba21dc1f051ffefda3b9e914683d8c3221bf40d651722a) |
| A member approves proposal 4 | [0xeeb42e59…](https://testnet.monadvision.com/tx/0xeeb42e59597e335fc5510de7c454bfab08c742205a7f369a884ce6e178877961) |
| Proposal 4 executes after quorum (re-checks allowlist and NAV freshness) | [0x1e249b93…](https://testnet.monadvision.com/tx/0x1e249b939612de9df9ba8019df7033fbe0427314c044863b4de2df24a9f7ce91) |
| Forced call with the manager's own key to move 4,000 to `0xABC…` reverts `PolicyViolation(ADAPTER_NOT_ALLOWED)` | [0x732ef7c0…](https://testnet.monadvision.com/tx/0x732ef7c035971c5c249132b444ba05403c84f6c0f0a3d36915ad5ffb7ceec97d) |
| A group member rates the in-band action 100/100 in the ERC-8004 ReputationRegistry (`plenum`/`rebalance`, `feedbackHash` = its rationale hash) | [0x29cffa75…](https://testnet.monadvision.com/tx/0x29cffa7500ed38f7c9d421c35d28262853f695b278dfb0923f84b1b814ba97ac) |
| The manager registers its ERC-8004 identity (agent #2128, `tokenURI` = agent card) | [0xbb2a824b…](https://testnet.monadvision.com/tx/0xbb2a824bfa8aeb9e8d10b090aba87c205985aa580e9d3e835ea00c4778920503) |

Check any manager transaction above at https://plenumx.vercel.app/verify.

## Notes

- **Model provenance:** the rehearsal transactions above were written by the agent runtime with a scripted plan
  (`agent/scripts/testnet-rehearsal.ts`) and record model id `scripted-plan`; the forced call was sent with `cast` and
  records `forced-call (manual test)`. Transactions written by a live model are listed separately.
- The ERC-8004 summary over Rehearsal Club's members counts 2 ratings: the same member also rated an action on the
  previous deployment, because ratings attach to the agent, not to a group.
- Monad's public RPC allows about 15 requests/second: the app and agent batch reads through Multicall3 and retry with
  backoff. CRE allows 15 contract reads per workflow run, so the workflow batches each group's holdings in one
  Multicall3 call.
- Monad bills the declared gas limit and prices some operations (cold storage, account access) above Ethereum, so
  Forge's local estimates are too low: run Forge scripts with `--gas-estimate-multiplier 250`. The app and agent use the
  Monad RPC's `eth_estimateGas` + 20%.
