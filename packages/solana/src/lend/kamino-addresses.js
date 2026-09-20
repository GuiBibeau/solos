// @ts-check
/**
 * The two contract pins for the lend slice (ADR-0019): the default market is Kamino Main
 * Market and the lending program is fixed. `KAMINO_LENDING_MARKET` may point the venue at
 * one other supported market; the program never moves.
 */

/** Kamino Main Market — the default configured market. */
export const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

/** The Kamino lending program every market and reserve account must be owned by. */
export const KLEND_PROGRAM_ID = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
