// @ts-check
import { Effect } from "effect";
import { Signer } from "../../wallet/index.js";
import { LiquidityInputInvalid, LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityGetPositionInputSchema, isReadable } from "../domain/types.js";
import { LiquidityVenue } from "../ports/liquidity-venue.js";

/** @typedef {import("../domain/errors.js").LiquidityError | import("../../shared/index.js").SignerUnavailable | import("../../shared/index.js").RpcError} GetPositionError */
/** @typedef {import("../ports/liquidity-venue.js").LiquidityVenueShape | import("../../wallet/index.js").SignerShape} GetPositionContext */

/**
 * Read one Orca Whirlpool LP position. Input is re-validated so every entry point — tool,
 * CLI, harness — fails before any provider access, the protocol gate runs before the signer
 * or the venue port are touched (meteora/raydium never reach the network), and the owner
 * resolves from the wallet Signer only when omitted.
 * @param {import("../domain/types.js").LiquidityGetPositionInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/types.js").LpPosition, GetPositionError, GetPositionContext>}
 */
export const getLpPosition = (input) =>
  Effect.gen(function* () {
    const parsed = LiquidityGetPositionInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new LiquidityInputInvalid({
        reason:
          "protocol must be orca, meteora or raydium, position a base58 address and owner a base58 address when given",
      });
    }
    if (!isReadable(parsed.data.protocol)) {
      return yield* new LiquidityUnsupportedProtocol({ protocol: parsed.data.protocol });
    }
    const owner = parsed.data.owner ?? (yield* (yield* Signer).address());
    return yield* (yield* LiquidityVenue).getPosition({
      protocol: parsed.data.protocol,
      position: parsed.data.position,
      owner,
    });
  }).pipe(Effect.withSpan("liquidity.getPosition"));
