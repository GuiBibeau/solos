// @ts-check
import { BuildRejected, PerpStateIncomplete } from "@solos/core";
import { z } from "zod";

const Integer = z.string().regex(/^(0|[1-9]\d*)$/);
const Signed = z.string().regex(/^-?(0|[1-9]\d*)$/);
const Access = z.object({
  capabilities: z.object({ withdrawCollateral: z.object({ immediate: z.boolean() }) }),
});
const Subaccount = z.object({
  capabilities: Access.optional(),
  subaccountIndex: z.number().int(),
  collateral: Integer,
  // Rise 0.5.26 TraderStateSubaccountSnapshotSchema defaults omitted arrays to [].
  // The caller independently checks on-chain positions, conditional bits and spline count.
  positions: z
    .array(
      z.object({
        basePositionLots: Signed,
        virtualQuotePositionLots: Signed,
        unsettledFundingQuoteLots: Signed,
      }),
    )
    .default([]),
  orders: z.array(z.object({ orders: z.array(z.unknown()) })).default([]),
  splines: z.array(z.unknown()).default([]),
  triggers: z.array(z.unknown()).default([]),
});
const Snapshot = z.object({
  authority: z.string(),
  traderPdaIndex: z.literal(0),
  slot: z.number().int().nonnegative(),
  snapshot: z.object({ capabilities: Access, subaccounts: z.array(Subaccount).min(1) }),
});

/** @param {unknown} body @param {string} owner */
const readSnapshot = (body, owner) => {
  const parsed = Snapshot.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".").slice(0, 80) || "unknown";
    throw new PerpStateIncomplete({
      reason: `Phoenix withdrawal risk snapshot is incomplete at ${field}`,
    });
  }
  if (parsed.data.authority !== owner)
    throw new PerpStateIncomplete({
      reason: "Phoenix withdrawal risk snapshot authority is inconsistent",
    });
  return parsed.data;
};

/** @param {number} observed @param {number} current */
const assertFresh = (observed, current) => {
  if (!Number.isSafeInteger(current) || observed > current || current - observed > 12)
    throw new PerpStateIncomplete({ reason: "Phoenix withdrawal risk snapshot is stale" });
};

/** @param {z.infer<typeof Subaccount>} sub */
const hasRisk = (sub) =>
  sub.orders.length > 0 ||
  sub.splines.length > 0 ||
  sub.triggers.length > 0 ||
  sub.positions.some(
    (position) =>
      BigInt(position.basePositionLots) !== 0n ||
      BigInt(position.virtualQuotePositionLots) !== 0n ||
      BigInt(position.unsettledFundingQuoteLots) !== 0n,
  );

/**
 * One necessary (not sufficient) withdrawal gate over the Phoenix API snapshot. A caller
 * must also validate on-chain ownership, account state, balances and instruction accounts
 * before any signing. The on-chain queue node must be independently read; `undefined` means
 * it was not checked.
 * @param {unknown} body
 * @param {{ owner: string; currentSlot: number; withdrawQueueNode: number | null | undefined }} facts
 */
export const validateWithdrawalState = (body, { owner, currentSlot, withdrawQueueNode }) => {
  const { slot, snapshot } = readSnapshot(body, owner);
  assertFresh(slot, currentSlot);
  assertPermission(snapshot);
  assertQueue(withdrawQueueNode);
  const indices = snapshot.subaccounts.map((sub) => sub.subaccountIndex);
  if (
    indices.filter((index) => index === 0).length !== 1 ||
    new Set(indices).size !== indices.length
  )
    throw new PerpStateIncomplete({
      reason: "Phoenix trader subaccounts are incomplete or repeated",
    });
  if (snapshot.subaccounts.some(hasRisk))
    throw new BuildRejected({ reason: "Phoenix trader has open or unsettled risk" });
  const collateral = snapshot.subaccounts.find((sub) => sub.subaccountIndex === 0)?.collateral;
  if (collateral === undefined)
    throw new PerpStateIncomplete({ reason: "Phoenix trader subaccount zero is absent" });
  return collateral;
};

/** @param {z.infer<typeof Snapshot>["snapshot"]} snapshot */
function assertPermission(snapshot) {
  if (
    !snapshot.capabilities.capabilities.withdrawCollateral.immediate ||
    snapshot.subaccounts.some(
      (sub) => sub.capabilities?.capabilities.withdrawCollateral.immediate === false,
    )
  )
    throw new BuildRejected({ reason: "Phoenix withdrawal permission is not enabled" });
}

/** @param {number | null | undefined} node */
function assertQueue(node) {
  if (node === undefined)
    throw new PerpStateIncomplete({ reason: "Phoenix withdrawal queue status is unknown" });
  if (node !== null) throw new BuildRejected({ reason: "Phoenix trader has a pending withdrawal" });
}
