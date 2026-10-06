# cre — Chainlink CRE NAV workflow

Implements SPEC §9 (and amendment A10). Session 3 (Oct 9).

The fund administrator: on a cron (1 min in the demo) plus an HTTP trigger, read each mandate
adapter's `valueOf(plenum)`, the plenum's A-Token cash and the MockGold price; compute NAV and drift;
write `(plenum, nav, driftBps[], timestamp)` to the shared `NavOracle` through the CRE forwarder.

- CLI v1.30+ required for Monad testnet simulation (latest checked: v1.36). SDK: `@chainlink/cre-sdk`.
- Forwarders (chain name `monad-testnet`): mock `0xB9F79d863261869B234c481D1f9A7af84AeAd192`
  (`cre workflow simulate --broadcast`), production `0xF8344CFd5c43616a4366C34E3EEE75af79a74482`.
- Take exact CLI flags from the CRE docs.

Planned layout: `project.yaml`, `plenum-nav/{workflow.yaml, main.ts, config.json}`.
