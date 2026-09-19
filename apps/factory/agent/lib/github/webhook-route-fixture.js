// @ts-check
import { createHmac } from "node:crypto";

export const WEBHOOK_SECRET = "offline-webhook-test-secret";

/** @typedef {{message: unknown, options: import("eve/channels").ChannelSendOptions<import("eve/channels/github").GitHubChannelState>, address: string}} Delivery */
const unexpected = () => {
  throw new Error("Unexpected Eve operation");
};

/** @param {Delivery[]} deliveries @param {Promise<unknown>[]} pending
 * @returns {import("eve/channels").RouteHandlerArgs<import("eve/channels/github").GitHubChannelState>}
 */
const routeArgs = (deliveries, pending) => ({
  from: (address) => ({
    send: async (message, options) => {
      deliveries.push({ message, options, address });
      return /** @type {import("eve/channels").Session} */ ({ id: "offline-session" });
    },
    respond: unexpected,
    cancel: unexpected,
    compact: unexpected,
    clear: unexpected,
    reset: unexpected,
  }),
  resolveSession: async () => undefined,
  attachSession: unexpected,
  to: unexpected,
  params: {},
  requestIp: null,
  waitUntil: (task) => {
    pending.push(task);
  },
});

/** @param {import("eve/channels/github").GitHubChannel} channel
 * @param {Readonly<Record<string, unknown>>} payload
 * @param {{event?: string, validSignature?: boolean}} options
 */
export const invokeWebhook = async (channel, payload, options) => {
  const body = JSON.stringify(payload);
  const digest = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  const request = new Request("http://localhost/github", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-github-event": options.event ?? "pull_request_review_comment",
      "x-github-delivery": "offline-delivery",
      "x-hub-signature-256": `sha256=${options.validSignature === false ? "0".repeat(64) : digest}`,
    },
  });
  const route = channel.routes[0];
  if (!route || route.transport === "websocket") throw new Error("Missing GitHub HTTP route");
  const deliveries = /** @type {Delivery[]} */ ([]);
  const pending = /** @type {Promise<unknown>[]} */ ([]);
  const response = await route.handler(request, routeArgs(deliveries, pending));
  await Promise.all(pending);
  return { response, deliveries };
};
