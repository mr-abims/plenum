# indexer — Envio HyperIndex

Implements SPEC §11 entities (plus `PlenumCreated` / `MemberJoined` from amendment A3). Session 3 (Oct 9).

Monad testnet (chain 10143), HyperSync `https://10143.hypersync.xyz`. Scaffold with `pnpx envio init`,
run with `pnpx envio dev`. Entities: Plenum, Member, ManagerAction, Proposal, Approval,
ComplianceRefusal, NavReport, ConsentGrant.

Fallback if Envio is blocked: direct viem log queries from the app.
