// @ts-check
/**
 * The vocabulary a v1 policy refusal speaks: the bounds, the clause for each way of breaching
 * one, and the two sentences those clauses hang off.
 *
 * Kept apart from the boundary functions because it is the part with a contract of its own. Only
 * solOS's own words travel — a library error caught at the boundary is translated here rather
 * than forwarded (#117) — and each clause says what it observed against what it allows, without
 * which a bound cannot be tuned deliberately (#110, #124).
 */
import { BuildRejected } from "@solos/core";

export const MAX_TRANSACTION_BYTES = 4096;
export const MAX_TRANSACTION_ACCOUNTS = 64;
export const MAX_PRIORITY_FEE_LAMPORTS = 100_000n;
export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
export const PRESIGN_REASON = "transaction failed v1 policy before signing; nothing was signed";
export const PRESUBMIT_REASON = "transaction failed v1 policy before RPC; nothing was sent";

/**
 * The clause for a breach that is not one of ours — a library throwing inside the boundary.
 *
 * It exists so that no refusal comes back anonymous. Before it, such a failure fell through to
 * the bare sentence, which named nothing; that bare sentence was about 1% of swap attempts in
 * #116 and its cause stayed unknown for exactly that reason. This says where it happened and
 * admits we cannot say more, which is different from saying nothing.
 */
export const V1_UNKNOWN_CLAUSE = "an unexpected failure inside the v1 boundary";

/**
 * What a failure that no v1 clause refused is called.
 *
 * Several build paths reported it as `transaction failed v1 policy before signing`, which sent an
 * operator looking for a bound to relax when every bound was fine.
 *
 * It says what is actually known and no more. The call sites wrap instruction assembly and the
 * signer in one `try`, so a throw could come from either; claiming "the signer failed after the
 * policy passed" would be a second false attribution in place of the first. What *is* certain is
 * that no clause refused it — a clause would have arrived as a `BuildRejected` and passed
 * straight through.
 *
 * The text is fixed because signer exceptions can embed raw provider response bodies, the same
 * reason `SignerUnavailable` keeps a fixed reason on the swap path.
 */
export const V1_SIGNING_FAILED =
  "assembling or signing the transaction failed; no v1 policy clause refused it and nothing was signed";

/**
 * Translate whatever a `signV1Message` call threw. A policy breach already carries its clause and
 * passes through untouched; anything else reached the signer, so it is named as such.
 *
 * The passthrough is the point. Several call sites used `catch: () => new BuildRejected(...)`,
 * discarding the argument, so a message over the account or byte ceiling was reported with a
 * fixed venue sentence and its clause was thrown away at the last step.
 * @param {unknown} error
 * @param {string} [label] venue context for the signer case, where there is no clause to keep
 * @returns {BuildRejected}
 */
export const rejectionAfterV1Policy = (error, label) =>
  error instanceof BuildRejected
    ? error
    : new BuildRejected({
        reason: label === undefined ? V1_SIGNING_FAILED : `${label}: ${V1_SIGNING_FAILED}`,
      });

/**
 * Mark a breach as one of ours, so the boundary knows its text may travel.
 * @param {string} text
 */
export const clause = (text) => Object.assign(new Error(text), { solosClause: true });

/**
 * Hang a caught breach off a boundary's sentence. Anything that is not one of our clauses is
 * still named, never left as the bare sentence.
 * @param {string} base @param {unknown} error
 */
export const withClause = (base, error) =>
  /** @type {{ solosClause?: boolean }} */ (error)?.solosClause === true
    ? `${base} (${/** @type {Error} */ (error).message})`
    : `${base} (${V1_UNKNOWN_CLAUSE})`;

/** How a value that failed a clause is reported: absent is its own case, not a silent zero. */
/** @param {unknown} value */
export const seen = (value) => (value === undefined ? "absent" : String(value));

/** @param {number | undefined} value */
const isPositiveSafeInteger = (value) => Number.isSafeInteger(value) && (value ?? 0) > 0;

/**
 * Each clause reports what it observed against what it allows.
 *
 * `base` is the boundary's own sentence because this runs at both of them. Refusing an
 * already-signed wire with "nothing was signed" tells the operator the opposite of what happened.
 * @param {import("@solana/kit").V1TransactionConfig} config
 * @param {string} base
 * @returns {void}
 */
export const assertConfig = (config, base) => {
  /** @param {string} text @returns {never} */
  const reject = (text) => {
    throw new BuildRejected({ reason: `${base} (${text})` });
  };
  if (!isPositiveSafeInteger(config.computeUnitLimit)) {
    reject(`compute unit limit ${seen(config.computeUnitLimit)} is not a positive integer`);
  }
  if (!isPositiveSafeInteger(config.loadedAccountsDataSizeLimit)) {
    reject(
      `loaded accounts data size limit ${seen(config.loadedAccountsDataSizeLimit)} is not a positive integer`,
    );
  }
  const fee = config.priorityFeeLamports;
  if (fee === undefined || fee < 0n || fee > MAX_PRIORITY_FEE_LAMPORTS) {
    reject(
      `priority fee ${seen(fee)} lamports is outside the 0..${MAX_PRIORITY_FEE_LAMPORTS} this boundary allows`,
    );
  }
};

/**
 * The version check has two arms — the decoded field and the leading prefix byte — and saying
 * "version 1 is not the v1 this boundary handles" when only the byte is wrong reads like a bug
 * in the checker rather than a fact about the message. Each arm names itself.
 * @param {unknown} version @param {unknown} prefix
 */
export const notV1 = (version, prefix) =>
  clause(
    version === 1
      ? `v1 version byte ${seen(prefix)}, not the 0x81 a v1 message carries`
      : `message version ${seen(version)} is not the v1 this boundary handles`,
  );

/**
 * Kit refuses an over-large message before our own count runs, so both paths answer with one
 * clause of ours.
 *
 * The number still travels. Kit's error carries `context.actualCount` as structured data, and a
 * number is not prose: taking it keeps #117's boundary — none of Kit's wording escapes — while
 * still telling the operator what was observed. The account ceiling is the case #116 named, so
 * it is the last clause that should have had to say "more than" instead of how many.
 * @param {number} [observed]
 */
export const tooManyAccounts = (observed) =>
  clause(
    observed === undefined
      ? `more unique accounts than the ${MAX_TRANSACTION_ACCOUNTS} a v1 message allows`
      : `${observed} unique accounts, over the ${MAX_TRANSACTION_ACCOUNTS} a v1 message allows`,
  );

/**
 * The count Kit observed, when its error carries one. Structured data only; the message is not
 * read and never travels.
 * @param {unknown} error
 */
export const kitAccountCount = (error) => {
  const count = /** @type {{ context?: { actualCount?: unknown } }} */ (error)?.context
    ?.actualCount;
  return typeof count === "number" ? count : undefined;
};

/** @param {number} observed */
export const overByteCeiling = (observed) =>
  clause(`serialized size ${observed} bytes, over the ${MAX_TRANSACTION_BYTES}-byte v1 ceiling`);
