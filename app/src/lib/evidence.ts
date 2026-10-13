/** Real Monad testnet transactions from docs/deployments.md (Rehearsal, Showcase and Rules Demo Clubs, Oct 11–13 2026). */
export const EVIDENCE_EXPLORER = "https://testnet.monadvision.com";

export const EVIDENCE = [
  {
    title: "Qwen 3.8 Max rebalances inside the rules",
    body: "A real gold move pushed the group out of range. The live model sold exactly the 10% single-trade cap, simulated it against the contract, got OK and executed, committing a fingerprint of its reasoning and its model id.",
    hash: "0xf52978a4ce315959991b6a596a72477c37bc1a690ac4491fe27b4c6d94576662",
    verify: true,
    tone: "accent",
  },
  {
    title: "Real market data comes in through Chainlink",
    body: "The CRE workflow fetches the gold spot price on every node, agrees on the median and reports it onchain. The AI never writes a price.",
    hash: "0x9136ba2db32ff7cbfcc9df6bcf360f696594f2bc4becdb8fd8bebb80fc07cb66",
    tone: "info",
  },
  {
    title: "An independent administrator prices the fund",
    body: "The same workflow reads every holding at a finalized block, values gold at market and writes the fund's value.",
    hash: "0xfc925a89ea1abc2c85317633289a867dceba2bdcb99356a94d0a3b10b9f50f98",
    tone: "info",
  },
  {
    title: "Too big to do alone, so it asks",
    body: "A move of 15% of the fund is refused in-band (TRADE_TOO_LARGE) and becomes a proposal for members.",
    hash: "0x7026de791cb4f2da09ba21dc1f051ffefda3b9e914683d8c3221bf40d651722a",
    verify: true,
    tone: "warn",
  },
  {
    title: "A member approves",
    body: "Approval is one onchain transaction per member. No relayer, no custody backend. This rehearsal used a test key; in the app, members sign with their passkey.",
    hash: "0xeeb42e59597e335fc5510de7c454bfab08c742205a7f369a884ce6e178877961",
    tone: "accent",
  },
  {
    title: "The group's decision is carried out",
    body: "After quorum, the proposal executes and re-checks the allowlist and price freshness.",
    hash: "0x1e249b939612de9df9ba8019df7033fbe0427314c044863b4de2df24a9f7ce91",
    tone: "accent",
  },
  {
    title: "Two-thirds of members change the rules",
    body: "A rule change needs a supermajority, then waits out a delay before it applies. One approval of three was not enough; two passed it.",
    hash: "0x471adcfc4afebd34a1a91816aa9c13e7171a12d563adc1af15ced46ac86de0cf",
    tone: "accent",
  },
  {
    title: "A member who disagrees leaves free of charge",
    body: "While new rules wait to apply, anyone can withdraw everything and leave with no fee, so a majority can't trap a minority.",
    hash: "0xe1732b5aa735b7cdb2a081525b0cec12eac784d2b29310602d5586cd23bb87db",
    tone: "accent",
  },
  {
    title: "Leaving mid-period pays a fair fee",
    body: "Outside the free window after each period, leaving costs the group's fee (2% here): 7.50 stayed with the members who remain, 2.50 went to Plenum.",
    hash: "0xc4ff153bd53ac6c93bf957a04688fa1caf21c63ee59d4c54e812c3e6f5288c3f",
    tone: "warn",
  },
  {
    title: "Members replace the AI manager",
    body: "Two-thirds voted in a different manager key. It took over at once with exactly the same limits; the old key lost all access.",
    hash: "0x8e54bd4388037b1955cab30f55e9f14e43d7d8dafd86c3537eb14c9b0c3220e5",
    tone: "accent",
  },
  {
    title: "Even with the key, it cannot take the money",
    body: "A forced call with the manager's own key, sending 4,000 to an outside address, reverts with ADAPTER_NOT_ALLOWED.",
    hash: "0x732ef7c035971c5c249132b444ba05403c84f6c0f0a3d36915ad5ffb7ceec97d",
    tone: "bad",
  },
] as const;
