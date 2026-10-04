// @ts-check
/**
 * The pure deposit plan: resolve identities, re-check every claim the action makes, then
 * assemble the pinned instruction sequence and the evidence quote. Everything runs over
 * the reader seam — no RPC instance, no signer instance — so rejections are plain values
 * and the only Effects are the seam reads.
 */
import { Effect } from "effect";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "../wallet/parse-token-accounts.js";
import {
  associatedTokenAccount,
  userMetadataAddress,
  vanillaObligationAddress,
} from "./kamino-deposit-addresses.js";
import { kaminoDepositSdk } from "./kamino-deposit-facts.js";
import { guardMintRow, guardObligationRow, guardSourceRow } from "./kamino-deposit-guards.js";
import { depositInstructions } from "./kamino-deposit-instructions.js";
import { farmRent, readCollateralFarm } from "./kamino-farm-instructions.js";

/** Pinned account sizes (8-byte discriminator + the SDK's layout span) for rent evidence. */
export const OBLIGATION_ACCOUNT_SIZE = 3344;
export const USER_METADATA_ACCOUNT_SIZE = 1032;
/** v0/v1 flat per-signature base fee; priority fees are executor policy, not a venue quote. */
const TRANSACTION_FEE_LAMPORTS = 5000n;

/** @typedef {{ readonly owner: string; readonly bytes: Uint8Array; readonly state?: import("./kamino-deposit-guards.js").ObligationState }} FetchedRow */
/** @typedef {{ readonly rows: (accounts: readonly string[]) => import("effect").Effect.Effect<ReadonlyArray<FetchedRow | null>, import("@solos/core").RpcError>; readonly rent: (sizes: readonly number[]) => import("effect").Effect.Effect<ReadonlyArray<bigint>, import("@solos/core").RpcError> }} DepositReader */
/** @typedef {{ readonly market: string; readonly mint: string; readonly amount: bigint; readonly owner: string }} DepositIntent */
/** @typedef {{ readonly reserve: string; readonly liquidityMint: string; readonly liquiditySupplyVault: string; readonly liquidityTokenProgram: string; readonly collateralMint: string; readonly collateralSupplyVault: string; readonly lendingMarketAuthority: string; readonly estimatedCollateral: string; readonly exchangeRate: string; readonly availableLiquidity: string; readonly farmCollateral?: string | null; readonly oracles: import("./kamino-refresh-reserve.js").ReserveOracles }} ReserveFacts */
/** @typedef {{ readonly status: "ok"; readonly instructions: readonly { programAddress: string }[]; readonly quote: import("@solos-sh/actions").LendDepositQuote }} DepositPlanOk */
/** @typedef {{ readonly status: "reject"; readonly reason: string }} DepositPlanReject */
/** @typedef {DepositPlanOk | DepositPlanReject} DepositPlan */
/** @typedef {import("./kamino-deposit-guards.js").ObligationState} ObligationState */

/** @param {string} reason @returns {DepositPlanReject} */
const reject = (reason) => ({ status: "reject", reason });

/** @param {string} program */
const isSupportedProgram = (program) => program === TOKEN_PROGRAM || program === TOKEN_2022_PROGRAM;

/**
 * The derived addresses one deposit touches: the signer's vanilla obligation PDA, the
 * user-metadata PDA, and the signer's associated source account for the mint.
 * @param {DepositIntent} intent @param {ReserveFacts} facts
 * @returns {import("effect").Effect.Effect<{ obligation: string; metadata: string; sourceAta: string }, never>}
 */
const deriveAddresses = (intent, facts) =>
  Effect.promise(() =>
    Promise.all([
      vanillaObligationAddress(intent.owner, intent.market),
      userMetadataAddress(intent.owner),
      associatedTokenAccount(intent.owner, intent.mint, facts.liquidityTokenProgram),
    ]).then(([obligation, metadata, sourceAta]) => ({ obligation, metadata, sourceAta })),
  );

/**
 * Kamino's obligation refresh requires every listed reserve refreshed in the same transaction,
 * and the deposit refreshes only its own. Until a per-reserve refresh plan exists, a plain
 * obligation that already holds another reserve is refused, as withdraw refuses it.
 * @param {ObligationState} state @param {string} reserve
 * @returns {DepositPlanReject | null}
 */
const otherActiveReserves = (state, reserve) =>
  (state?.deposits ?? []).some(
    (d) => d.depositReserve !== reserve && BigInt(d.depositedAmount.toString()) > 0n,
  )
    ? {
        status: /** @type {const} */ ("reject"),
        reason: "the obligation has other active reserves requiring a separate refresh plan",
      }
    : null;

/**
 * Fetch the plan's five rows and apply every guard, or reject. The success value carries
 * what assembly needs: the collateral mint's program, the decoded obligation state, and
 * which accounts are missing.
 * @param {{ readonly reader: DepositReader; readonly intent: DepositIntent; readonly facts: ReserveFacts; readonly obligation: string; readonly metadata: string; readonly sourceAta: string }} parts
 * @returns {import("effect").Effect.Effect<{ collateralTokenProgram: string; obligationState: ObligationState; metadataMissing: boolean; shouldInitializeObligation: boolean } | DepositPlanReject, import("@solos/core").RpcError>}
 */
const guardPlanRows = ({ reader, intent, facts, obligation, metadata, sourceAta }) =>
  Effect.gen(function* () {
    const rows = yield* reader.rows([
      obligation,
      metadata,
      sourceAta,
      facts.liquidityMint,
      facts.collateralMint,
    ]);
    const [obligationRow, metadataRow, sourceRow, liquidityMintRow, collateralMintRow] = rows;
    for (const bad of [
      guardMintRow(liquidityMintRow, "liquidity", facts.liquidityTokenProgram),
      guardMintRow(collateralMintRow, "collateral"),
    ]) {
      if (bad !== null) return bad;
    }
    const guarded = guardObligationRow(obligationRow, intent);
    if ("reason" in guarded) return guarded;
    const otherReserves = otherActiveReserves(guarded.state, facts.reserve);
    if (otherReserves) return otherReserves;
    const guardedSource = guardSourceRow(sourceRow, sourceAta, intent);
    if ("reason" in guardedSource) return guardedSource;
    return {
      collateralTokenProgram: /** @type {FetchedRow} */ (collateralMintRow).owner,
      obligationState: guarded.state,
      metadataMissing: /** @type {FetchedRow | null} */ (metadataRow) === null,
      shouldInitializeObligation: /** @type {FetchedRow | null} */ (obligationRow) === null,
    };
  });

/**
 * The venueQuote evidence for one planned deposit: the exact encoded amount, the
 * pinned-math collateral estimate at the read rate, and the rent/fee lamports.
 * @param {{ readonly facts: ReserveFacts; readonly obligation: string; readonly amount: bigint; readonly shouldInitializeObligation: boolean; readonly rentLamports: bigint }} parts
 * @returns {import("@solos-sh/actions").LendDepositQuote}
 */
const quoteFor = ({ facts, obligation, amount, shouldInitializeObligation, rentLamports }) => ({
  kind: /** @type {const} */ ("lend_deposit"),
  reserve: facts.reserve,
  obligation,
  liquidityAmount: amount.toString(),
  estimatedCollateral: facts.estimatedCollateral,
  exchangeRate: facts.exchangeRate,
  initializeObligation: shouldInitializeObligation,
  rentLamports: rentLamports.toString(),
  feeLamports: TRANSACTION_FEE_LAMPORTS.toString(),
});

/** @param {{ reader: DepositReader; metadataMissing: boolean; obligationMissing: boolean; farmMissing: boolean }} input */
const depositRent = ({ reader, metadataMissing, obligationMissing, farmMissing }) =>
  Effect.gen(function* () {
    const sizes = [
      ...(metadataMissing ? [USER_METADATA_ACCOUNT_SIZE] : []),
      ...(obligationMissing ? [OBLIGATION_ACCOUNT_SIZE] : []),
    ];
    const accountRent =
      sizes.length > 0 ? (yield* reader.rent(sizes)).reduce((sum, n) => sum + n, 0n) : 0n;
    return accountRent + (yield* farmRent(reader, farmMissing));
  });

/** @typedef {{ readonly reader: DepositReader; readonly intent: DepositIntent; readonly facts: ReserveFacts; readonly signer: import("../signer/kit-signer.js").KitCompatibleSigner; readonly obligation: string; readonly metadata: string; readonly sourceAta: string; readonly collateralTokenProgram: string; readonly obligationState: ObligationState; readonly metadataMissing: boolean; readonly shouldInitializeObligation: boolean }} PlanParts */
/** @param {any} sdk @param {PlanParts} parts @param {{ farmUser: string | null; initializeFarm: boolean }} farm */
const planInstructions = (sdk, parts, farm) => {
  const existingDeposits = (parts.obligationState?.deposits ?? [])
    .filter((d) => BigInt(d.depositedAmount.toString()) > 0n)
    .map((d) => d.depositReserve);
  return depositInstructions(sdk, {
    ...farm,
    intent: parts.intent,
    signer: parts.signer,
    reserve: parts.facts,
    obligation: parts.obligation,
    metadata: parts.metadata,
    sourceAta: parts.sourceAta,
    collateralTokenProgram: parts.collateralTokenProgram,
    existingDeposits,
    initializeMetadata: parts.metadataMissing,
    initializeObligation: parts.shouldInitializeObligation,
  });
};

/**
 * The rent evidence, the refresh set and the signed-ready instruction sequence for one
 * planned deposit, from already-guarded rows.
 * @param {PlanParts} parts
 * @returns {import("effect").Effect.Effect<DepositPlan, import("@solos/core").RpcError>}
 */
const assemblePlan = (parts) =>
  Effect.gen(function* () {
    const { reader, intent, facts, metadataMissing, shouldInitializeObligation } = parts;
    const sdk = yield* Effect.promise(() => kaminoDepositSdk());
    const farm = yield* readCollateralFarm({
      reader,
      sdk,
      farm: facts.farmCollateral,
      obligation: parts.obligation,
    });
    if (farm.status === "reject") return farm;
    const rentLamports = yield* depositRent({
      reader,
      metadataMissing,
      obligationMissing: shouldInitializeObligation,
      farmMissing: farm.initializeFarm,
    });
    const instructions = planInstructions(sdk, parts, farm);
    return {
      status: /** @type {const} */ ("ok"),
      instructions,
      quote: quoteFor({
        facts,
        obligation: parts.obligation,
        amount: intent.amount,
        shouldInitializeObligation,
        rentLamports,
      }),
    };
  });

/**
 * Plan the whole deposit offline over the reader seam.
 * @param {{ readonly reader: DepositReader; readonly intent: DepositIntent; readonly facts: ReserveFacts; readonly signer: import("../signer/kit-signer.js").KitCompatibleSigner }} input
 * @returns {import("effect").Effect.Effect<DepositPlan, import("@solos/core").RpcError>}
 */
export const depositPlan = ({ reader, intent, facts, signer }) =>
  Effect.gen(function* () {
    if (!isSupportedProgram(facts.liquidityTokenProgram)) {
      return reject("the reserve's liquidity token program is not supported");
    }
    const addresses = yield* deriveAddresses(intent, facts);
    const rows = yield* guardPlanRows({ reader, intent, facts, ...addresses });
    if ("reason" in rows) return rows;
    return yield* assemblePlan({ reader, intent, facts, signer, ...addresses, ...rows });
  }).pipe(Effect.withSpan("lend.depositPlan"));
