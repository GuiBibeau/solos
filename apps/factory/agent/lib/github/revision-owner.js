// @ts-check
/**
 * One pull request owns one durable Eve conversation. GitHub gives inline review threads their
 * own address, so normalize those addresses before Eve admits the turn. Timeline comments, CI
 * failures and proactive rebase work already use the pull-request address.
 */

const REVIEW_ADDRESS = /^(repo:\d+:pull:\d+):review-comment:\d+$/u;

/** @param {string} address */
export const revisionOwnerAddress = (address) => address.replace(REVIEW_ADDRESS, "$1");

/**
 * Route every PR revision through the channel's canonical PR address while retaining the
 * original GitHub state, which keeps replies and source links on their native thread.
 * @param {import("eve/channels/github").GitHubChannel} channel
 */
export const withRevisionOwner = (channel) => ({
  ...channel,
  routes: channel.routes.map((route) => {
    if (route.transport === "websocket") return route;
    const handler = /** @type {typeof route.handler} */ (
      (request, args) =>
        route.handler(request, {
          ...args,
          from: (address) => args.from(revisionOwnerAddress(address)),
        })
    );
    return {
      ...route,
      handler,
    };
  }),
});

/** @param {{deliveryId: string, pullNumber: number, source: string}} input */
export const revisionOwnerReceipt = (input) =>
  [
    `<revision_owner repository="GuiBibeau/solos" pull_request="${input.pullNumber}">`,
    `source: ${input.source}`,
    `delivery_id: ${input.deliveryId}`,
    "Queue this amendment behind any active revision. Before delegating, fetch the current PR head, checks, review findings, and active station state. Drop only work proven stale or resolved against that head.",
    "There may be only one branch-writing station. Reconcile an existing or uncertain station before starting another. Record replacements as supersessions, preserve its work, and block when ownership cannot be established.",
    "Give the station the expected remote head. A stale station must not push or publish after the owner or head changes. Keep the source link in the progress receipt.",
    "</revision_owner>",
  ].join("\n");
