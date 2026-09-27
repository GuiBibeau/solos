// @ts-check
import { describe, expect, test } from "bun:test";
// Importing the package index loads every slice's `domain/errors.js`, which registers each type.
import "./index.js";
import { domainErrors, errorEnvelope } from "./shared/index.js";

const REASON = "what is wrong";
const REMEDY = "what to do about it";

/**
 * Registered tags with no `reason` sentence yet. #162 and #163 drain this set; the classification
 * test below fails the moment one of them starts carrying a reason, so it can only shrink, and a
 * new error type cannot be added without a deliberate classification.
 * @type {ReadonlySet<string>}
 */
const REASONLESS = new Set([
  "CurveComplete",
  "CurveUnavailable",
  "InsufficientFunds",
  "IrisAuthFailed",
  "IrisRateLimited",
  "IrisTimeout",
  "LendingTimeout",
  "NoPositionToClose",
  "PerpAuthFailed",
  "PerpMarketUnknown",
  "PerpRateLimited",
  "PerpTimeout",
  "PriceAuthFailed",
  "PriceRateLimited",
  "PriceTimeout",
  "UnknownToken",
  "UnsupportedAction",
  "UnsupportedQuoteAsset",
]);

/** The reason-bearing types, so the registry is exhaustively classified. */
const REASONFUL = new Set([
  "BuildRejected",
  "BuildUnavailable",
  "CurveConfigUnavailable",
  "CurveCorrupt",
  "CurveInputInvalid",
  "InternalError",
  "IrisConfigMissing",
  "IrisHttpError",
  "IrisInputInvalid",
  "IrisNetworkError",
  "IrisQuestionInvalid",
  "IrisResponseInvalid",
  "LendingEnumerationIncomplete",
  "LendingInputInvalid",
  "LendingLayoutUnsupported",
  "LendingMarketUnavailable",
  "LendingObligationInvalid",
  "LendingResponseInvalid",
  "LiquidityEnumerationIncomplete",
  "LiquidityInputInvalid",
  "LiquidityPositionUnavailable",
  "LiquidityUnsupportedProtocol",
  "NoRouteFound",
  "PerpAccountCorrupt",
  "PerpEnumerationIncomplete",
  "PerpHttpError",
  "PerpInputInvalid",
  "PerpNetworkError",
  "PerpResponseInvalid",
  "PerpStateIncomplete",
  "PortfolioInputInvalid",
  "PriceConfigMissing",
  "PriceHttpError",
  "PriceInputInvalid",
  "PriceNetworkError",
  "PriceResponseInvalid",
  "PriceUnavailable",
  "QuoteAuthFailed",
  "QuoteConfigMissing",
  "QuoteHttpError",
  "QuoteInputInvalid",
  "QuoteNetworkError",
  "QuoteRateLimited",
  "QuoteResponseInvalid",
  "QuoteTimeout",
  "ReserveUnavailable",
  "RpcConfigMissing",
  "RpcError",
  "SignerConfigMissing",
  "SignerUnavailable",
  "SimulationFailed",
  "TokenMetadataUnavailable",
  "TransactionExpired",
  "TransactionFailed",
  "ValidationError",
]);

describe("domain error registry", () => {
  test("registers every error type, each classified as reason-bearing or reasonless", () => {
    const registered = domainErrors()
      .map((entry) => entry.tag)
      .toSorted((a, b) => a.localeCompare(b));
    expect(registered).toEqual(
      [...REASONLESS, ...REASONFUL].toSorted((a, b) => a.localeCompare(b)),
    );
  });

  test("every error type serializes to a stack-free { code, ... } envelope", () => {
    for (const { tag, ErrorClass } of domainErrors()) {
      const envelope = errorEnvelope(new ErrorClass({}));
      expect(envelope?.code).toBe(tag);
      expect(JSON.stringify(envelope)).not.toContain("    at ");
      expect(JSON.stringify(envelope)).not.toContain("/Users/");
    }
  });

  test("every reason-bearing type preserves a non-empty reason", () => {
    for (const { tag, ErrorClass } of domainErrors()) {
      if (REASONLESS.has(tag)) continue;
      expect(errorEnvelope(new ErrorClass({ reason: REASON }))?.reason).toBe(REASON);
    }
  });

  test("every error type preserves a remedy when one is set", () => {
    for (const { tag, ErrorClass } of domainErrors()) {
      expect(errorEnvelope(new ErrorClass({ remedy: REMEDY }))).toMatchObject({
        code: tag,
        remedy: REMEDY,
      });
    }
  });
});
