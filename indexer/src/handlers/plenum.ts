import { indexer } from "envio";

/** Reason enum order from contracts/src/interfaces/Types.sol. */
const REASONS = [
  "OK", "ADAPTER_NOT_ALLOWED", "WEIGHT_OUT_OF_BAND", "LIQUIDITY_FLOOR", "TRADE_TOO_LARGE", "TURNOVER_CAP",
  "NAV_STALE", "COOLDOWN", "PAUSED", "MEMBER_CAP",
] as const;
const OPS = ["Deposit", "Withdraw", "RequestRedeem", "Claim"] as const;
const NAV_SOURCES = ["CRE", "FALLBACK"] as const;

const reason = (r: bigint) => REASONS[Number(r)] ?? `UNKNOWN_${r}`;
const lc = (a: string) => a.toLowerCase();
const eid = (e: { chainId: number; transaction: { hash: string }; logIndex: number }) =>
  `${e.chainId}-${e.transaction.hash}-${e.logIndex}`;

type ActivityKind =
  | "CONTRIBUTED" | "REDEEMED" | "JOINED" | "LEFT" | "EXIT_FEE" | "MANAGER_ACTION" | "ESCALATED" | "APPROVED"
  | "EXECUTED" | "PAUSED" | "UNPAUSED" | "NAV" | "ADAPTER" | "RULE_PROPOSED" | "RULE_SCHEDULED" | "RULE_APPLIED"
  | "MANAGER_PROPOSED" | "MANAGER_REPLACED";

function activity(
  context: { Activity: { set: (a: any) => void } },
  e: { chainId: number; transaction: { hash: string }; logIndex: number; block: { timestamp: number } },
  plenum: string,
  kind: ActivityKind,
  actor: string,
  detail: string,
  amount?: bigint,
) {
  context.Activity.set({
    id: eid(e),
    plenum_id: plenum,
    kind,
    actor: lc(actor),
    amount,
    detail,
    txHash: e.transaction.hash,
    timestamp: BigInt(e.block.timestamp),
  });
}

/** Per-group clones (gateway, governance, mandate) map back to their plenum through ContractLink. */
async function plenumOf(context: { ContractLink: { get: (id: string) => Promise<{ plenum_id: string } | undefined> } }, src: string) {
  return (await context.ContractLink.get(lc(src)))?.plenum_id;
}

// ------------------------------------------------------------------ factory

indexer.contractRegister({ contract: "PlenumFactory", event: "PlenumCreated" }, async ({ event, context }) => {
  context.chain.Plenum.add(event.params.plenum);
  context.chain.Mandate.add(event.params.mandate);
  context.chain.Governance.add(event.params.governance);
  context.chain.ManagerGateway.add(event.params.gateway);
});

indexer.onEvent({ contract: "PlenumFactory", event: "PlenumCreated" }, async ({ event, context }) => {
  const p = event.params;
  const id = lc(p.plenum);
  context.Plenum.set({
    id,
    name: p.name,
    templateId: Number(p.templateId),
    mandate: lc(p.mandate),
    governance: lc(p.governance),
    gateway: lc(p.gateway),
    createdAt: BigInt(event.block.timestamp),
    memberCount: 0,
    totalUnits: 0n,
    paused: false,
    feesToGroup: 0n,
    feesToTreasury: 0n,
    pendingRuleChangeEta: undefined,
  });
  context.ContractLink.set({ id: lc(p.mandate), plenum_id: id, kind: "MANDATE" });
  context.ContractLink.set({ id: lc(p.gateway), plenum_id: id, kind: "GATEWAY" });
  context.ContractLink.set({ id: lc(p.governance), plenum_id: id, kind: "GOVERNANCE" });
});

// ------------------------------------------------------------------- plenum

indexer.onEvent({ contract: "Plenum", event: "MemberJoined" }, async ({ event, context }) => {
  const plenum = lc(event.srcAddress);
  const address = lc(event.params.member);
  const id = `${plenum}-${address}`;
  const before = await context.Member.get(id); // a former member rejoining keeps their history
  context.Member.set({
    id,
    plenum_id: plenum,
    address,
    encPubKey: event.params.encPubKey,
    units: 0n,
    contributed: before?.contributed ?? 0n,
    redeemed: before?.redeemed ?? 0n,
    feesPaid: before?.feesPaid ?? 0n,
    active: true,
    joinedAt: BigInt(event.block.timestamp),
  });
  const p = await context.Plenum.get(plenum);
  if (p) context.Plenum.set({ ...p, memberCount: p.memberCount + 1 });
  activity(context, event, plenum, "JOINED", address, "joined");
});

indexer.onEvent({ contract: "Plenum", event: "Contributed" }, async ({ event, context }) => {
  const plenum = lc(event.srcAddress);
  const { member, assets, units, navPerUnit } = event.params;
  const id = `${plenum}-${lc(member)}`;
  const m = await context.Member.get(id);
  if (m) context.Member.set({ ...m, units: m.units + units, contributed: m.contributed + assets });
  const p = await context.Plenum.get(plenum);
  if (p) context.Plenum.set({ ...p, totalUnits: p.totalUnits + units });
  activity(context, event, plenum, "CONTRIBUTED", member, `navPerUnit=${navPerUnit}`, assets);
});

indexer.onEvent({ contract: "Plenum", event: "Redeemed" }, async ({ event, context }) => {
  const plenum = lc(event.srcAddress);
  const { member, units, assets, to } = event.params;
  const id = `${plenum}-${lc(member)}`;
  const m = await context.Member.get(id);
  if (m) context.Member.set({ ...m, units: m.units - units, redeemed: m.redeemed + assets });
  const p = await context.Plenum.get(plenum);
  if (p) context.Plenum.set({ ...p, totalUnits: p.totalUnits - units });
  activity(context, event, plenum, "REDEEMED", member, `paid to ${lc(to)}`, assets);
});

indexer.onEvent({ contract: "Plenum", event: "ExitFeeCharged" }, async ({ event, context }) => {
  const plenum = lc(event.srcAddress);
  const { member, fee, toTreasury } = event.params;
  const id = `${plenum}-${lc(member)}`;
  const m = await context.Member.get(id);
  if (m) context.Member.set({ ...m, feesPaid: m.feesPaid + fee });
  const p = await context.Plenum.get(plenum);
  if (p) context.Plenum.set({ ...p, feesToGroup: p.feesToGroup + fee - toTreasury, feesToTreasury: p.feesToTreasury + toTreasury });
  activity(context, event, plenum, "EXIT_FEE", member, `toGroup=${fee - toTreasury} toTreasury=${toTreasury}`, fee);
});

indexer.onEvent({ contract: "Plenum", event: "MemberLeft" }, async ({ event, context }) => {
  const plenum = lc(event.srcAddress);
  const id = `${plenum}-${lc(event.params.member)}`;
  const m = await context.Member.get(id);
  if (m) context.Member.set({ ...m, active: false, units: 0n });
  const p = await context.Plenum.get(plenum);
  if (p) context.Plenum.set({ ...p, memberCount: Math.max(0, p.memberCount - 1) });
  activity(context, event, plenum, "LEFT", event.params.member, "left");
});

indexer.onEvent({ contract: "Plenum", event: "ActionExecuted" }, async ({ event, context }) => {
  const { adapter, op, assets, result } = event.params;
  activity(context, event, lc(event.srcAddress), "ADAPTER", adapter, `${OPS[Number(op)]} result=${result}`, assets);
});

// ------------------------------------------------------------------ manager

indexer.onEvent({ contract: "ManagerGateway", event: "ManagerAction" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  const r = reason(event.params.reason);
  context.ManagerAction.set({
    id: eid(event),
    plenum_id: plenum,
    actionsHash: event.params.actionsHash,
    rationaleHash: event.params.rationaleHash,
    modelId: event.params.modelId,
    reason: r,
    refused: r !== "OK",
    txHash: event.transaction.hash,
    timestamp: BigInt(event.block.timestamp),
  });
  activity(context, event, plenum, "MANAGER_ACTION", event.srcAddress, r);
});

// --------------------------------------------------------------- governance

indexer.onEvent({ contract: "Governance", event: "Escalated" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  context.Proposal.set({
    id: `${lc(event.srcAddress)}-${event.params.proposalId}`,
    plenum_id: plenum,
    proposalId: event.params.proposalId,
    kind: "ACTIONS",
    newManager: undefined,
    actionsHash: event.params.actionsHash,
    rationaleHash: event.params.rationaleHash,
    approvals: 0,
    executed: false,
    createdAt: BigInt(event.block.timestamp),
    executedAt: undefined,
  });
  activity(context, event, plenum, "ESCALATED", event.srcAddress, `proposal ${event.params.proposalId}`);
});

indexer.onEvent({ contract: "Governance", event: "MandateChangeProposed" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  const { proposalId, configHash, rationaleHash } = event.params;
  context.Proposal.set({
    id: `${lc(event.srcAddress)}-${proposalId}`,
    plenum_id: plenum,
    proposalId,
    kind: "RULE_CHANGE",
    newManager: undefined,
    actionsHash: configHash,
    rationaleHash,
    approvals: 0,
    executed: false,
    createdAt: BigInt(event.block.timestamp),
    executedAt: undefined,
  });
  activity(context, event, plenum, "RULE_PROPOSED", event.transaction.hash, `proposal ${proposalId}`);
});

indexer.onEvent({ contract: "Governance", event: "ManagerReplacementProposed" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  const { proposalId, newManager, rationaleHash } = event.params;
  context.Proposal.set({
    id: `${lc(event.srcAddress)}-${proposalId}`,
    plenum_id: plenum,
    proposalId,
    kind: "REPLACE_MANAGER",
    newManager: lc(newManager),
    actionsHash: "",
    rationaleHash,
    approvals: 0,
    executed: false,
    createdAt: BigInt(event.block.timestamp),
    executedAt: undefined,
  });
  activity(context, event, plenum, "MANAGER_PROPOSED", newManager, `proposal ${proposalId}`);
});

indexer.onEvent({ contract: "Governance", event: "Approved" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  const pid = `${lc(event.srcAddress)}-${event.params.proposalId}`;
  context.Approval.set({
    id: eid(event),
    proposal_id: pid,
    member: lc(event.params.member),
    timestamp: BigInt(event.block.timestamp),
  });
  const p = await context.Proposal.get(pid);
  if (p) context.Proposal.set({ ...p, approvals: p.approvals + 1 });
  activity(context, event, plenum, "APPROVED", event.params.member, `proposal ${event.params.proposalId}`);
});

indexer.onEvent({ contract: "Governance", event: "ProposalExecuted" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  const pid = `${lc(event.srcAddress)}-${event.params.proposalId}`;
  const p = await context.Proposal.get(pid);
  if (p) context.Proposal.set({ ...p, executed: true, executedAt: BigInt(event.block.timestamp) });
  activity(context, event, plenum, "EXECUTED", event.srcAddress, `proposal ${event.params.proposalId}`);
});

for (const [name, paused] of [["Paused", true], ["Unpaused", false]] as const) {
  indexer.onEvent({ contract: "Governance", event: name }, async ({ event, context }) => {
    const plenum = await plenumOf(context, event.srcAddress);
    if (!plenum) return;
    const p = await context.Plenum.get(plenum);
    if (p) context.Plenum.set({ ...p, paused });
    activity(context, event, plenum, paused ? "PAUSED" : "UNPAUSED", event.params.by, paused ? "manager paused" : "manager unpaused");
  });
}

indexer.onEvent({ contract: "Governance", event: "ManagerReplaced" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  activity(context, event, plenum, "MANAGER_REPLACED", event.params.newManager, `was ${lc(event.params.oldManager)}`);
});

// ------------------------------------------------------------------ mandate

indexer.onEvent({ contract: "Mandate", event: "MandateChangeScheduled" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  const p = await context.Plenum.get(plenum);
  if (p) context.Plenum.set({ ...p, pendingRuleChangeEta: event.params.eta });
  activity(context, event, plenum, "RULE_SCHEDULED", event.srcAddress, `applies at ${event.params.eta}`);
});

indexer.onEvent({ contract: "Mandate", event: "MandateChangeApplied" }, async ({ event, context }) => {
  const plenum = await plenumOf(context, event.srcAddress);
  if (!plenum) return;
  const p = await context.Plenum.get(plenum);
  if (p) context.Plenum.set({ ...p, pendingRuleChangeEta: undefined });
  activity(context, event, plenum, "RULE_APPLIED", event.srcAddress, event.params.configHash);
});

// ---------------------------------------------------------- shared singletons

indexer.onEvent({ contract: "NavOracle", event: "NavReported" }, async ({ event, context }) => {
  const plenum = lc(event.params.plenum);
  if (!(await context.Plenum.get(plenum))) return;
  const source = NAV_SOURCES[Number(event.params.source)] ?? "UNKNOWN";
  context.NavReport.set({
    id: eid(event),
    plenum_id: plenum,
    nav: event.params.nav,
    reportTimestamp: event.params.timestamp,
    source,
    txHash: event.transaction.hash,
  });
  activity(context, event, plenum, "NAV", event.srcAddress, source, event.params.nav);
});

indexer.onEvent({ contract: "ConsentRegistry", event: "ConsentGranted" }, async ({ event, context }) => {
  const { id, member, grantee, scopeHash, expiry } = event.params;
  context.ConsentGrant.set({
    id: id.toString(),
    member: lc(member),
    grantee: lc(grantee),
    scopeHash,
    expiry,
    revoked: false,
    grantedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "ConsentRegistry", event: "ConsentRevoked" }, async ({ event, context }) => {
  const g = await context.ConsentGrant.get(event.params.id.toString());
  if (g) context.ConsentGrant.set({ ...g, revoked: true });
});
