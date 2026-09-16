// @ts-check
import { checkoutBranchTool } from "../../../lib/github/branch-tools.js";
import { REPO_DIR } from "../../../lib/github/git-remote.js";

export default checkoutBranchTool({
  description: `Fetch an existing branch of the factory repository and check it out in ${REPO_DIR}. Use this on a revision run, when the reviewer's findings name a branch that already exists; fresh work starts from the default branch with plain git instead.`,
  branchDescription: "The existing branch to fetch and check out.",
});
