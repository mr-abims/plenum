/** Real Monad testnet transactions from docs/deployments.md (Rehearsal and Showcase Clubs, Oct 11 2026). */
export const EVIDENCE_EXPLORER = "https://testnet.monadvision.com";

export const EVIDENCE = [
  {
    title: "The manager rebalances inside the rules",
    body: "It trims the overweight gold sleeve on its own, committing a fingerprint of its plan. In this rehearsal the plan was scripted rather than written by the model.",
    hash: "0x71e4516824d31c87ed77ddc60dc843f29fe8271f4c6b5268aca48fc78de87885",
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
    title: "Even with the key, it cannot take the money",
    body: "A forced call with the manager's own key, sending 4,000 to an outside address, reverts with ADAPTER_NOT_ALLOWED.",
    hash: "0x732ef7c035971c5c249132b444ba05403c84f6c0f0a3d36915ad5ffb7ceec97d",
    tone: "bad",
  },
] as const;
