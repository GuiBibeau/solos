// @ts-check
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  ATA_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  WSOL_MINT,
  dataBytes,
} from "./jupiter-swap-build-validate.js";

/** @typedef {import("./jupiter-swap-build-response.js").RawInstruction} RawInstruction */

/**
 * Derive the taker's associated account under the instruction's token program.
 * @param {string} owner @param {string} mint @param {string} [tokenProgram]
 */
export const derivedAta = async (owner, mint, tokenProgram = TOKEN_PROGRAM) => {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(tokenProgram),
  });
  return ata;
};

/** @param {RawInstruction} ix */
const ataProgramRejection = (ix) => {
  if (ix.programId !== ATA_PROGRAM || ix.accounts.length !== 6) {
    return "setup ATA create did not carry the exact associated-token account shape";
  }
  if (ix.accounts[4]?.pubkey !== SYSTEM_PROGRAM) {
    return "setup ATA create did not bind the System program";
  }
  const tokenProgram = ix.accounts[5]?.pubkey;
  if (tokenProgram !== TOKEN_PROGRAM && tokenProgram !== TOKEN_2022_PROGRAM) {
    return "setup ATA create did not bind a supported token program";
  }
  return undefined;
};

/** @param {RawInstruction} ix */
const ataRoleRejection = (ix) => {
  const roles = [
    [true, true],
    [true, false],
    [false, false],
    [false, false],
    [false, false],
    [false, false],
  ];
  return ix.accounts.some(
    (meta, index) => meta.isWritable !== roles[index]?.[0] || meta.isSigner !== roles[index]?.[1],
  )
    ? "setup ATA create accounts carried invalid signer or writable roles"
    : undefined;
};

/**
 * Bind an idempotent ATA create to the taker.
 *
 * The mint is deliberately not restricted to the requested pair. A multi-hop route settles
 * through an intermediate token and needs the taker's account for it — a SOL to USDC route
 * hopping via USD1 opens a USD1 ATA — so requiring the pair refused real routes before signing.
 *
 * What an unrequested mint can actually cost is rent, and three checks already bound that: the
 * taker both pays and owns, the account must be the canonical ATA derived for that mint and
 * token program so it can never be an attacker's account, and the build may touch at most 64
 * unique addresses. The cost itself is measured rather than proxied — `spendBoundProbe`
 * refuses a build whose lamport debit exceeds the swap's input plus the overhead allowance
 * (ADR-0024), which is roughly nine ATAs' worth of rent.
 * @param {RawInstruction} ix
 * @param {import("@solos-sh/actions").SwapAction} _action
 * @param {string} taker
 */
export const ataCreateRejection = async (ix, _action, taker) => {
  const programRejection = ataProgramRejection(ix);
  if (programRejection) return programRejection;
  const [payer, account, owner, mint, , tokenProgram] = ix.accounts.map((a) => a.pubkey);
  if (payer !== taker) return "setup ATA create payer was not the taker";
  if (owner !== taker) return "setup ATA create owner was not the taker";
  // The pair check used to narrow this; without it a malformed create must be refused outright
  // rather than derived against an absent mint.
  if (mint === undefined) return "setup ATA create named no mint";
  const expected = await derivedAta(taker, mint, tokenProgram);
  if (account !== expected) {
    return "setup ATA create did not target the taker's derived associated token account";
  }
  return ataRoleRejection(ix);
};

/** @param {RawInstruction} cleanup */
const cleanupRoleRejection = (cleanup) => {
  const roles = [
    [true, false],
    [true, false],
    [false, true],
  ];
  return cleanup.accounts.some(
    (meta, index) => meta.isWritable !== roles[index]?.[0] || meta.isSigner !== roles[index]?.[1],
  )
    ? "cleanup accounts carried invalid signer or writable roles"
    : undefined;
};

/** @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope */
const hasWrapPair = (envelope) => {
  const transfers = envelope.setupInstructions.filter((ix) => ix.programId === SYSTEM_PROGRAM);
  const syncs = envelope.setupInstructions.filter(
    (ix) => ix.programId === TOKEN_PROGRAM && dataBytes(ix.data)[0] === 17,
  );
  return transfers.length === 1 && syncs.length === 1;
};

/** @param {{ envelope: import("./jupiter-swap-build-response.js").JupiterBuildEnvelope;
 * action: import("@solos-sh/actions").SwapAction; taker: string; tempWsol: string }} bound */
const cleanupCreateRejection = async ({ envelope, action, taker, tempWsol }) => {
  const creates = envelope.setupInstructions.filter((ix) => isTargetAccount(ix, tempWsol));
  if (creates.length !== 1) {
    return "cleanup required this build to create the taker's temporary wSOL account exactly once";
  }
  const [create] = creates;
  if (!create)
    return "cleanup required this build to create the taker's temporary wSOL account exactly once";
  const binding = await ataCreateRejection(create, action, taker);
  if (binding) return binding;
  return isCanonicalWsolCreate(create)
    ? undefined
    : "cleanup's temporary wSOL create was not a canonical single-instruction ATA create";
};

/** @param {RawInstruction} ix @param {string} account */
const isTargetAccount = (ix, account) =>
  ix.programId === ATA_PROGRAM && ix.accounts[1]?.pubkey === account;

/**
 * The temp wSOL create must be a canonical single-instruction ATA create (opcode 0 create or
 * opcode 1 createIdempotent) under the classic token program for the wSOL mint. Jupiter's
 * current live builds emit createIdempotent here. Safety does not depend on the opcode: the
 * pre-sign preflight proves the account is absent, and Token closeAccount fails on a non-zero
 * balance, so a raced pre-existing account aborts the whole transaction atomically.
 * @param {RawInstruction} ix
 */
const isCanonicalWsolCreate = (ix) => {
  const bytes = dataBytes(ix.data);
  if (ix.accounts[3]?.pubkey !== WSOL_MINT) return false;
  if (ix.accounts[5]?.pubkey !== TOKEN_PROGRAM) return false;
  if (bytes.length !== 1) return false;
  return bytes[0] === 0 || bytes[0] === 1;
};

/** @param {import("@solos-sh/actions").SwapAction} action */
const nativeDirection = (action) => {
  const isInput = action.inputMint === WSOL_MINT;
  const isOutput = action.outputMint === WSOL_MINT;
  if (isInput === isOutput) return "invalid";
  return isInput ? "input" : "output";
};

/** @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos-sh/actions").SwapAction} action */
const cleanupDirectionRejection = (envelope, action) => {
  const direction = nativeDirection(action);
  if (direction === "invalid") return "cleanup was not bound to one native-SOL swap direction";
  if (direction === "input" && !hasWrapPair(envelope)) {
    return "cleanup of wrapped input required this build's exact native-SOL wrap";
  }
  if (direction === "output" && hasWrapPair(envelope)) {
    return "cleanup of wrapped output carried an unsafe native-SOL wrap";
  }
  return undefined;
};

/** @param {RawInstruction} cleanup @param {string} taker @param {string} tempWsol */
const cleanupIdentityRejection = (cleanup, taker, tempWsol) => {
  if (cleanup.accounts[0]?.pubkey !== tempWsol) {
    return "cleanup did not close the taker's temporary wSOL account";
  }
  if (cleanup.accounts[1]?.pubkey !== taker) {
    return "cleanup rent destination was not the taker";
  }
  return cleanup.accounts[2]?.pubkey === taker ? undefined : "cleanup authority was not the taker";
};

/**
 * Bind cleanup to one complete build-owned wSOL ATA lifecycle.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos-sh/actions").SwapAction} action @param {string} taker
 */
export const cleanupBindingRejection = async (envelope, action, taker) => {
  const cleanup = envelope.cleanupInstruction;
  if (!cleanup) return undefined;
  const directionRejection = cleanupDirectionRejection(envelope, action);
  if (directionRejection) return directionRejection;
  const roleRejection = cleanupRoleRejection(cleanup);
  if (roleRejection) return roleRejection;
  const tempWsol = await derivedAta(taker, WSOL_MINT);
  return (
    cleanupIdentityRejection(cleanup, taker, tempWsol) ??
    (await cleanupCreateRejection({ envelope, action, taker, tempWsol }))
  );
};
