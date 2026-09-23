// @ts-check
import { createHash } from "node:crypto";
import {
  getOnboardTraderDelegatedEncoder,
  getRegisterTraderInstructionDecoder,
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_LOG_AUTHORITY_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
} from "@ellipsis-labs/rise";
import { BuildRejected } from "@solos/core";
import { PHOENIX_PERPS_PROGRAM } from "./phoenix-api.js";

/** @typedef {import("zod").infer<typeof import("./phoenix-onboard-api.js").RegisterBuild>} Build */
/** @typedef {Build["instructions"][number]} Instruction */
/** @typedef {{ build: Build; owner: string; trader: string }} Context */
/** @param {string} name */
const selector = (name) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const REGISTER = selector("register_trader");
const CAPABILITIES = selector("set_trader_capabilities_delegated");
const ONBOARD = getOnboardTraderDelegatedEncoder().encode(undefined);
const decoder = getRegisterTraderInstructionDecoder();
const reject = () => {
  throw new BuildRejected({
    reason: "Phoenix enrollment build does not match the current wallet; nothing was signed",
  });
};

/** @param {Build} build @param {string} owner @param {string} trader */
const assertHeader = (build, owner, trader) => {
  if (
    build.txFeePayer !== owner ||
    build.traderPda !== trader ||
    build.traderOnboarder === owner ||
    build.maxPositions !== 128
  )
    reject();
};

/** @param {Instruction} ix @param {Uint8Array} bytes @param {Context} ctx */
const assertRegister = (ix, bytes, ctx) => {
  if (bytes.length !== 18 || ix.keys.length < 7) reject();
  const params = decoder.decode(bytes);
  const payer = /** @type {Instruction["keys"][number]} */ (ix.keys[3]);
  const owner = /** @type {Instruction["keys"][number]} */ (ix.keys[4]);
  const trader = /** @type {Instruction["keys"][number]} */ (ix.keys[5]);
  if (
    [
      params.traderPdaIndex === 0,
      params.subaccountIndex === 0,
      params.maxPositions === 128n,
      payer.pubkey === ctx.owner,
      payer.isSigner,
      payer.isWritable,
      owner.pubkey === ctx.owner,
      trader.pubkey === ctx.trader,
      trader.isWritable,
      ix.keys[6]?.pubkey === SYSTEM_PROGRAM_ADDRESS,
    ].some((value) => !value)
  )
    reject();
};

/** @param {Instruction} ix @param {Uint8Array} bytes @param {Context} ctx */
const assertCapabilities = (ix, bytes, ctx) => {
  if (bytes.length !== ONBOARD.length || bytes.some((value, i) => value !== ONBOARD[i])) reject();
  if (ix.keys.length < 6) reject();
  const signer = /** @type {Instruction["keys"][number]} */ (ix.keys[3]);
  const trader = /** @type {Instruction["keys"][number]} */ (ix.keys[5]);
  if (
    [
      signer.pubkey === ctx.build.traderOnboarder,
      signer.isSigner,
      trader.pubkey === ctx.trader,
      trader.isWritable,
    ].some((value) => !value)
  )
    reject();
};

/** @param {Instruction["keys"][number]} key @param {string} owner */
const isInvalidOwner = (key, owner) => key.pubkey === owner && key.isWritable && !key.isSigner;
/** @param {Instruction["keys"][number]} key @param {string} trader */
const isWritableTrader = (key, trader) => key.pubkey === trader && key.isWritable;

/** @param {Instruction} ix @param {Context} ctx */
const assertAccounts = (ix, ctx) => {
  if (ix.programId !== PHOENIX_PERPS_PROGRAM || ix.keys.length < 3) reject();
  const [program, log, config] =
    /** @type {[Instruction["keys"][number], Instruction["keys"][number], Instruction["keys"][number]]} */ (
      ix.keys
    );
  if (
    [
      program.pubkey === PHOENIX_PERPS_PROGRAM,
      log.pubkey === PHOENIX_LOG_AUTHORITY_ADDRESS,
      config.pubkey === PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
    ].some((value) => !value)
  )
    reject();
  if (ix.keys.every((key) => !isWritableTrader(key, ctx.trader))) reject();
  const signers = new Set([ctx.owner, ctx.build.traderOnboarder]);
  if (ix.keys.filter((key) => key.isSigner).some((key) => !signers.has(key.pubkey))) reject();
  if (ix.keys.some((key) => isInvalidOwner(key, ctx.owner))) reject();
};

/** Reject provider-owned instructions before wallet signing, including arbitrary spend.
 * @param {Build} build @param {string} owner @param {string} trader
 */
export const assertEnrollmentBuild = (build, owner, trader) => {
  assertHeader(build, owner, trader);
  const ctx = { build, owner, trader };
  let registerCount = 0;
  let capabilitiesCount = 0;
  for (const ix of build.instructions) {
    assertAccounts(ix, ctx);
    const bytes = Uint8Array.from(ix.data);
    const isRegister = bytes.subarray(0, 8).every((value, i) => value === REGISTER[i]);
    const isCapability = bytes.subarray(0, 8).every((value, i) => value === CAPABILITIES[i]);
    if (!isRegister && !isCapability) reject();
    if (isRegister) {
      assertRegister(ix, bytes, ctx);
      registerCount += 1;
    }
    if (isCapability) {
      assertCapabilities(ix, bytes, ctx);
      capabilitiesCount += 1;
    }
  }
  if (capabilitiesCount !== 1 || registerCount !== Number(build.includeRegisterTrader)) reject();
  return build;
};
