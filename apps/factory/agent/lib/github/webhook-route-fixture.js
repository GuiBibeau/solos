// @ts-check
import { createHmac } from "node:crypto";

export const WEBHOOK_SECRET = "offline-webhook-test-secret";

/** @typedef {{message: unknown, options: import("eve/channels").ChannelSendOptions<import("eve/channels/github").GitHubChannelState>, address: string}} Delivery */
/** @typedef {import("eve/channels/github").GitHubChannelState} GitHubState */
/** @typedef {{message: unknown, options: import("eve/channels").ChannelSendOptions<GitHubState>, deliveryId: string}} QueuedItem */
/** @typedef {{active: boolean, items: Map<string, QueuedItem>, writerStarts: number}} OwnerState */
const unexpected = () => {
  throw new Error("Unexpected Eve operation");
};

/** Durable state stands in for Eve's persisted address/session registry across runtime reconnects. */
export const revisionQueueStore = () => /** @type {Map<string, OwnerState>} */ (new Map());

/** A deterministic model of Eve's durable queued turn at one canonical channel address.
 * @param {ReturnType<typeof revisionQueueStore>} store
 */
export const revisionQueueFixture = (store) => {
  /** @param {string} address */
  const state = (address) => {
    const found = store.get(address);
    if (found) return found;
    const created = { active: false, items: new Map(), writerStarts: 0 };
    store.set(address, created);
    return created;
  };
  /** @param {string} address @param {unknown} message
   * @param {import("eve/channels").ChannelSendOptions<GitHubState>} options
   */
  const send = async (address, message, options) => {
    const owner = state(address);
    const text = [String(message), ...(options.context ?? [])].join("\n");
    const id = /delivery_id: ([^\n]+)/u.exec(text)?.[1]?.trim() ?? text;
    if (!owner.items.has(id)) owner.items.set(id, { deliveryId: id, message, options });
    if (!owner.active) {
      owner.active = true;
      owner.writerStarts += 1;
    }
    return /** @type {import("eve/channels").Session} */ ({ id: `session:${address}` });
  };
  /** @type {import("eve/channels").ChannelFrom<GitHubState>} */
  const from = (address) => ({
    send: (message, options) => send(address, message, options),
    respond: unexpected,
    cancel: unexpected,
    compact: unexpected,
    clear: unexpected,
    reset: unexpected,
  });
  return { from, send, state };
};

/** @param {Delivery[]} deliveries @param {Promise<unknown>[]} pending
 * @param {import("eve/channels").ChannelFrom<import("eve/channels/github").GitHubChannelState> | undefined} sharedFrom
 * @returns {import("eve/channels").RouteHandlerArgs<import("eve/channels/github").GitHubChannelState>}
 */
const routeArgs = (deliveries, pending, sharedFrom) => ({
  from:
    sharedFrom ??
    ((address) => ({
      send: async (message, options) => {
        deliveries.push({ message, options, address });
        return /** @type {import("eve/channels").Session} */ ({ id: "offline-session" });
      },
      respond: unexpected,
      cancel: unexpected,
      compact: unexpected,
      clear: unexpected,
      reset: unexpected,
    })),
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
 * @param {{event?: string, validSignature?: boolean, deliveryId?: string,
 * from?: import("eve/channels").ChannelFrom<import("eve/channels/github").GitHubChannelState>}} options
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
      "x-github-delivery": options.deliveryId ?? "offline-delivery",
      "x-hub-signature-256": `sha256=${options.validSignature === false ? "0".repeat(64) : digest}`,
    },
  });
  const route = channel.routes[0];
  if (!route || route.transport === "websocket") throw new Error("Missing GitHub HTTP route");
  const deliveries = /** @type {Delivery[]} */ ([]);
  const pending = /** @type {Promise<unknown>[]} */ ([]);
  const response = await route.handler(request, routeArgs(deliveries, pending, options.from));
  await Promise.all(pending);
  return { response, deliveries };
};
