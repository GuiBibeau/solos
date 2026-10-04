// @ts-check
/**
 * The slice-local request becomes the shared contract's action. Amounts cross as decimal strings.
 * @param {import("../domain/types.js").TransferSolRequest} request
 * @returns {import("@solos-sh/actions").TransferSolAction}
 */
export const toTransferAction = (request) => ({
  type: "transfer_sol",
  to: request.to,
  lamports: request.lamports.toString(),
});
