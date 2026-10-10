// @ts-check
import { describe, expect, test } from "bun:test";
// Importing the package index loads every slice's `domain/errors.js`, which registers each type.
import "./index.js";
import { domainErrors, errorEnvelope } from "./shared/index.js";

const REASON = "what is wrong";
const REMEDY = "what to do about it";

/** No error type is reasonless any more: #161 added the field, #162 and #163 drained every slice. */
const REASONLESS = new Set();

/** The reason-bearing types, so the registry is exhaustively classified. */
const REASONFUL = new Set([
  "BoundsExceeded",
  "BuildRejected",
  "BuildUnavailable",
  "EngineConfigMissing",
  "EngineUnauthorized",
  "EngineUnavailable",
  "CurveComplete",
  "CurveConfigUnavailable",
  "CurveCorrupt",
  "CurveInputInvalid",
  "CurveUnavailable",
  "InsufficientFunds",
  "IntentInFlight",
  "IntentNotFound",
  "KillSwitchEngaged",
  "InternalError",
  "IrisAuthFailed",
  "IrisConfigMissing",
  "IrisHttpError",
  "IrisInputInvalid",
  "IrisNetworkError",
  "IrisQuestionInvalid",
  "IrisRateLimited",
  "IrisResponseInvalid",
  "IrisTimeout",
  "LendingEnumerationIncomplete",
  "LendingInputInvalid",
  "LendingLayoutUnsupported",
  "LendingMarketUnavailable",
  "LendingObligationInvalid",
  "LendingResponseInvalid",
  "LendingTimeout",
  "LiquidityEnumerationIncomplete",
  "LiquidityInputInvalid",
  "LiquidityPositionUnavailable",
  "LiquidityUnsupportedProtocol",
  "NoPositionToClose",
  "NoRouteFound",
  "PerpAccountCorrupt",
  "PerpAuthFailed",
  "PerpEnumerationIncomplete",
  "PerpHttpError",
  "PerpInputInvalid",
  "PerpMarketUnknown",
  "PerpNetworkError",
  "PerpRateLimited",
  "PerpResponseInvalid",
  "PerpStateIncomplete",
  "PerpTimeout",
  "PortfolioInputInvalid",
  "PriceAuthFailed",
  "PriceConfigMissing",
  "PriceHttpError",
  "PriceInputInvalid",
  "PriceNetworkError",
  "PriceRateLimited",
  "PriceResponseInvalid",
  "PriceTimeout",
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
  "SelectionInputInvalid",
  "SignerConfigMissing",
  "SignerUnavailable",
  "StrategyInvalid",
  "StrategyNotFound",
  "StrategyTransitionRefused",
  "SimulationFailed",
  "SurfpoolUnavailable",
  "TierWithheld",
  "TokenMetadataUnavailable",
  "ToolSelectorUnavailable",
  "TransactionExpired",
  "TransactionFailed",
  "UnknownToken",
  "UnsupportedAction",
  "UnsupportedQuoteAsset",
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
