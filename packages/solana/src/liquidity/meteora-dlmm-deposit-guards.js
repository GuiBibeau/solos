// @ts-check
/**
 * Refusals that happen before a Meteora deposit is quoted: ownership, the pair the position
 * already names, fee-bearing mints, and an active bin that moved past the pre-send tolerance.
 * Position identity is the PositionV2 account. There is no NFT.
 */
import { Effect } from "effect";
import { readMintLayout } from "../market/mint-account.js";
import { hasTransferFee } from "../market/token-2022-layout.js";
import { activeBinMoved, activeBinTolerance } from "./meteora-dlmm-allocate.js";
import { decodeLbPair, decodePositionV2 } from "./meteora-dlmm-decode.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

/** @typedef {import("./meteora-dlmm-deposit-accounts.js").Reader} Reader */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} MeteoraPositionLayout */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPairLayout} MeteoraPairLayout */
/** @typedef {{ readonly status: "reject"; readonly reason: string }} Rejected */
/** @typedef {{ readonly status: "ok"; readonly layout: MeteoraPositionLayout }} PositionHeld */
/** @typedef {{ readonly status: "ok"; readonly layout: MeteoraPairLayout }} PairHeld */
/** @typedef {{ readonly status: "ok"; readonly tokenX: string; readonly tokenY: string }} MintPrograms */

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** @param {string} reason @returns {Rejected} */
const reject = (reason) => ({ status: "reject", reason });

/**
 * @param {{ owner: string; bytes: Uint8Array } | null | undefined} row
 * @param {string} absent
 * @param {string} foreign
 */
const programRow = (row, absent, foreign) => {
  if (row === null || row === undefined) return reject(absent);
  if (row.owner !== METEORA_DLMM_PROGRAM) return reject(foreign);
  return { status: /** @type {const} */ ("ok"), bytes: row.bytes };
};

/**
 * The signer must own the position account, and the position must already name `pool`.
 * @param {{ reader: Reader; position: string; owner: string; pool: string }} input
 * @returns {import("effect").Effect.Effect<PositionHeld | Rejected, import("@solos/core").RpcError>}
 */
export const positionOf = ({ reader, position, owner, pool }) =>
  Effect.gen(function* () {
    const [row] = yield* reader.rows([position]);
    const held = programRow(
      row,
      "no account at the position address",
      "position account is not owned by the pinned Meteora DLMM program",
    );
    if (held.status === "reject") return held;
    return ownedPosition(held.bytes, owner, pool);
  });

/** @param {Uint8Array} bytes @param {string} owner @param {string} pool */
const ownedPosition = (bytes, owner, pool) => {
  const decoded = decodePositionV2(bytes);
  if (decoded.status !== "decoded") return reject(decoded.reason);
  if (decoded.layout.owner !== owner) return reject("the signer does not own this position");
  if (decoded.layout.lbPair !== pool) {
    return reject("the position belongs to a different pool than the one given");
  }
  return { status: /** @type {const} */ ("ok"), layout: decoded.layout };
};

/**
 * @param {Reader} reader
 * @param {string} lbPair
 * @returns {import("effect").Effect.Effect<PairHeld | Rejected, import("@solos/core").RpcError>}
 */
export const pairOf = (reader, lbPair) =>
  Effect.gen(function* () {
    const [row] = yield* reader.rows([lbPair]);
    const held = programRow(
      row,
      "referenced pair is missing",
      "the position's pair is not owned by the pinned Meteora DLMM program",
    );
    if (held.status === "reject") return held;
    const decoded = decodeLbPair(held.bytes);
    if (decoded.status !== "decoded") return reject(decoded.reason);
    return usablePair(decoded.layout);
  });

/** @param {MeteoraPairLayout} layout @returns {PairHeld | Rejected} */
const usablePair = (layout) => {
  if (layout.binStep <= 0) return reject("the pair bin step is zero");
  if (layout.reserveX === SYSTEM_PROGRAM || layout.reserveY === SYSTEM_PROGRAM) {
    return reject("the pair reserves are missing");
  }
  return { status: "ok", layout };
};

/**
 * Token program of one pool mint. A transfer fee changes what the signed amounts mean, so a
 * fee-bearing mint is refused. The `*2` instruction still carries an empty remaining-accounts
 * list so a later hook can be appended without a new builder.
 * @param {string} mint
 * @param {{ owner: string; bytes: Uint8Array } | null | undefined} row
 */
const guardedMint = (mint, row) => {
  if (row === null || row === undefined) return reject(`the pool's mint ${mint} is missing`);
  const layout = readMintLayout({ owner: row.owner, data: row.bytes });
  if (layout.verdict !== "mint") return reject(`the pool's mint ${mint} is not a usable mint`);
  if (hasTransferFee(layout.extensions)) {
    return reject(
      `the pool's mint ${mint} charges a token-2022 transfer fee, which these quotes do not account for`,
    );
  }
  return { program: row.owner };
};

/**
 * @param {Reader} reader
 * @param {MeteoraPairLayout} pair
 * @returns {import("effect").Effect.Effect<MintPrograms | Rejected, import("@solos/core").RpcError>}
 */
export const mintsOf = (reader, pair) =>
  Effect.gen(function* () {
    const [rowX, rowY] = yield* reader.rows([pair.tokenMintX, pair.tokenMintY]);
    const first = guardedMint(pair.tokenMintX, rowX);
    if ("status" in first) return first;
    const second = guardedMint(pair.tokenMintY, rowY);
    if ("status" in second) return second;
    return { status: /** @type {const} */ ("ok"), tokenX: first.program, tokenY: second.program };
  });

/**
 * Re-read the pair and refuse when the active bin moved past `ceil(maxSlippageBps / binStep)`.
 * Zero slippage allows zero bins. This is not an on-chain bound.
 * @param {{ reader: Reader; lbPair: string; activeId: number; binStep: number; maxSlippageBps: number }} input
 * @returns {import("effect").Effect.Effect<{ status: "ok" } | Rejected, import("@solos/core").RpcError>}
 */
export const driftOf = (input) =>
  Effect.gen(function* () {
    const tolerance = activeBinTolerance(input.maxSlippageBps, input.binStep);
    if (tolerance === null) return reject("the pair bin step is zero");
    const [row] = yield* input.reader.rows([input.lbPair]);
    const held = programRow(
      row,
      "referenced pair is missing",
      "the position's pair is not owned by the pinned Meteora DLMM program",
    );
    if (held.status === "reject") return held;
    return driftAgainst(held.bytes, input.activeId, tolerance);
  });

/** @param {Uint8Array} bytes @param {number} activeId @param {number} tolerance */
const driftAgainst = (bytes, activeId, tolerance) => {
  const decoded = decodeLbPair(bytes);
  if (decoded.status !== "decoded") return reject(decoded.reason);
  if (activeBinMoved(activeId, decoded.layout.activeId, tolerance)) {
    return reject("the active bin moved past the slippage tolerance before send");
  }
  return { status: /** @type {const} */ ("ok") };
};
