// @ts-check
import { derivedAta } from "./jupiter-swap-build-setup.js";
import { swapRouteLayout } from "./jupiter-swap-build-swapdata.js";
import { JUP6_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./jupiter-swap-build-validate.js";

export const JUPITER_EVENT_AUTHORITY = "D8cy77BBepLMngZx6ZukaTff5hCt1HrWyKk3Hnd9oitf";
const SOURCE_REASON = "swap instruction did not spend the taker's source token account";
const DESTINATION_REASON = "swap instruction did not credit the taker's destination token account";
const INPUT_MINT_REASON = "swap instruction did not carry the input mint's market account";
const OUTPUT_MINT_REASON = "swap instruction did not carry the output mint's market account";
const AUTHORITY_REASON = "swap instruction did not bind the configured taker at its fixed account";
const PROGRAM_REASON = "swap instruction carried an invalid fixed token or Jupiter program account";
const ROLE_REASON = "swap instruction fixed accounts carried invalid signer or writable roles";

/** @typedef {import("./jupiter-swap-build-response.js").RawInstruction["accounts"][number]} Meta */
/** @typedef {{pubkey: string, writable: boolean, signer: boolean}} ExpectedMeta */
/** @param {string} pubkey @param {boolean} writable @param {boolean} signer */
const expected = (pubkey, writable, signer) => ({ pubkey, writable, signer });

/** @param {Meta | undefined} meta @param {ExpectedMeta} wanted */
const isMeta = (meta, wanted) =>
  meta?.pubkey === wanted.pubkey &&
  meta.isWritable === wanted.writable &&
  meta.isSigner === wanted.signer;

/** @param {Meta | undefined} meta */
const isTokenProgram = (meta) =>
  (meta?.pubkey === TOKEN_PROGRAM || meta?.pubkey === TOKEN_2022_PROGRAM) &&
  meta.isWritable === false &&
  meta.isSigner === false;

/** @param {{meta: Meta | undefined, wanted: ExpectedMeta, reason: string}[]} checks */
const fixedRejection = (checks) =>
  checks.find((check) => !isMeta(check.meta, check.wanted))?.reason;

/** @param {Meta | undefined} meta @param {boolean} writable */
const selfExpected = (meta, writable) => expected(meta?.pubkey || "", writable, false);

/** Anchor may omit the optional direct destination account or encode its program placeholder.
 * @param {Meta[]} accounts */
const directProgramRejection = (accounts) => {
  const event = expected(JUPITER_EVENT_AUTHORITY, false, false);
  const eventIndex = isMeta(accounts[7], event) ? 7 : 8;
  return fixedRejection([
    { meta: accounts[eventIndex], wanted: event, reason: PROGRAM_REASON },
    {
      meta: accounts[eventIndex + 1],
      wanted: expected(JUP6_PROGRAM, false, false),
      reason: PROGRAM_REASON,
    },
  ]);
};

/** @param {Meta[]} accounts @param {import("@solos/actions").SwapAction} action @param {string} taker */
const directRejection = async (accounts, action, taker) => {
  const sourceProgram = accounts[5];
  const destinationProgram = accounts[6];
  if (!sourceProgram || !destinationProgram) return PROGRAM_REASON;
  if (!isTokenProgram(sourceProgram) || !isTokenProgram(destinationProgram)) return PROGRAM_REASON;
  const source = await derivedAta(taker, action.inputMint, sourceProgram.pubkey);
  const destination = await derivedAta(taker, action.outputMint, destinationProgram.pubkey);
  return (
    fixedRejection([
      { meta: accounts[0], wanted: expected(taker, false, true), reason: AUTHORITY_REASON },
      { meta: accounts[1], wanted: expected(source, true, false), reason: SOURCE_REASON },
      { meta: accounts[2], wanted: expected(destination, true, false), reason: DESTINATION_REASON },
      {
        meta: accounts[3],
        wanted: expected(action.inputMint, false, false),
        reason: INPUT_MINT_REASON,
      },
      {
        meta: accounts[4],
        wanted: expected(action.outputMint, false, false),
        reason: OUTPUT_MINT_REASON,
      },
    ]) ?? directProgramRejection(accounts)
  );
};

/** @param {Meta[]} accounts @param {import("@solos/actions").SwapAction} action
 * @param {{taker: string, source: string, destination: string}} bound */
const sharedBoundRejection = (accounts, action, bound) =>
  fixedRejection([
    { meta: accounts[1], wanted: expected(bound.taker, false, true), reason: AUTHORITY_REASON },
    { meta: accounts[2], wanted: expected(bound.source, true, false), reason: SOURCE_REASON },
    {
      meta: accounts[5],
      wanted: expected(bound.destination, true, false),
      reason: DESTINATION_REASON,
    },
    {
      meta: accounts[6],
      wanted: expected(action.inputMint, false, false),
      reason: INPUT_MINT_REASON,
    },
    {
      meta: accounts[7],
      wanted: expected(action.outputMint, false, false),
      reason: OUTPUT_MINT_REASON,
    },
    {
      meta: accounts[10],
      wanted: expected(JUPITER_EVENT_AUTHORITY, false, false),
      reason: PROGRAM_REASON,
    },
    { meta: accounts[11], wanted: expected(JUP6_PROGRAM, false, false), reason: PROGRAM_REASON },
  ]);

/** @param {Meta[]} accounts */
const sharedRoleRejection = (accounts) =>
  fixedRejection([
    { meta: accounts[0], wanted: selfExpected(accounts[0], false), reason: ROLE_REASON },
    { meta: accounts[3], wanted: selfExpected(accounts[3], true), reason: ROLE_REASON },
    { meta: accounts[4], wanted: selfExpected(accounts[4], true), reason: ROLE_REASON },
  ]);

/** @param {Meta[]} accounts @param {import("@solos/actions").SwapAction} action @param {string} taker */
const sharedRejection = async (accounts, action, taker) => {
  const sourceProgram = accounts[8];
  const destinationProgram = accounts[9];
  if (!sourceProgram || !destinationProgram) return PROGRAM_REASON;
  if (!isTokenProgram(sourceProgram) || !isTokenProgram(destinationProgram)) return PROGRAM_REASON;
  const source = await derivedAta(taker, action.inputMint, sourceProgram.pubkey);
  const destination = await derivedAta(taker, action.outputMint, destinationProgram.pubkey);
  return (
    sharedBoundRejection(accounts, action, { taker, source, destination }) ??
    sharedRoleRejection(accounts)
  );
};

/** Validate the fixed V2 account prefix selected by the instruction discriminator.
 * @param {import("./jupiter-swap-build-response.js").RawInstruction} swap
 * @param {import("@solos/actions").SwapAction} action @param {string} taker */
export const routeAccountsRejection = async (swap, action, taker) => {
  const layout = swapRouteLayout(swap);
  if (layout === "route-v2") return directRejection(swap.accounts, action, taker);
  if (layout === "shared-accounts-route-v2") return sharedRejection(swap.accounts, action, taker);
  return "swap instruction accounts used an unsupported Jupiter route layout";
};
