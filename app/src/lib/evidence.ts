/** Real Monad testnet transactions from docs/deployments.md (rehearsal plenum, Oct 10 2026). */
export const EVIDENCE_EXPLORER = "https://testnet.monadvision.com";

export const EVIDENCE = [
  {
    title: "The manager rebalances inside the rules",
    body: "An in-band trade through the manager's gateway, committed with a fingerprint of its plan. In this rehearsal the plan was scripted rather than written by the model.",
    hash: "0x8ad9effd34c515fe2cb88be5fe95f99986f0097f95c5ebfa4db4e67595c066aa",
    verify: true,
    tone: "accent",
  },
  {
    title: "An independent administrator prices the fund",
    body: "The Chainlink CRE workflow reads holdings at a finalized block and writes the valuation. The AI never does.",
    hash: "0x3c0dcc7b2cd7b6ab02bade2bead41905440831511db57345ae32d6551f8e2ff8",
    tone: "info",
  },
  {
    title: "Too big to do alone, so it asks",
    body: "An oversized trade is refused in-band (TRADE_TOO_LARGE) and becomes a proposal for members.",
    hash: "0x693cd26ce14e04a3bb6eb2c1b9119ff536039641460bd69ee15ed11eaa011c91",
    verify: true,
    tone: "warn",
  },
  {
    title: "A member approves",
    body: "Approval is one onchain transaction per member. No relayer, no custody backend. This rehearsal used a test key; in the app, members sign with their passkey.",
    hash: "0x28c7f1fd423c9d303215f9a0e553e56ae42bd9f2fad8a5623a076911a113a615",
    tone: "accent",
  },
  {
    title: "The group's decision is carried out",
    body: "After quorum, the proposal executes and re-checks the allowlist and price freshness.",
    hash: "0x5dc4255f9a1dc9a0f17681ba5bb86d01bad534e446d57546e9c3a7ce9b3a1447",
    tone: "accent",
  },
  {
    title: "Even with the key, it cannot take the money",
    body: "A forced call with the manager's own key, sending 4,000 to an outside address, reverts with ADAPTER_NOT_ALLOWED.",
    hash: "0x42254307eb4048176a04c67bf922b97168c8dfdd05775cdc5d1455758dbc3c3f",
    tone: "bad",
  },
] as const;
