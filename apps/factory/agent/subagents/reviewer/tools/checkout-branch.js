// @ts-check
import { checkoutBranchTool } from "../../../lib/github/branch-tools.js";
import { REPO_DIR } from "../../../lib/github/git-remote.js";

export default checkoutBranchTool({
  description: `Fetch the branch under review from the factory repository and check it out in ${REPO_DIR}. Run this first, then run the verification lever and read the real diff against the base branch.`,
  branchDescription: "The pushed branch to fetch and check out for review.",
});
