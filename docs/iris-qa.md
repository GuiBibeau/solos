# Iris live QA

Offline tests exercise real CLI and MCP processes against an Elfa fixture. They cannot establish
whether the current Elfa account, plan, endpoint, and response work together. Live QA exercises
both public surfaces against `https://api.elfa.ai/v2/chat` and records the observed answers.

```sh
bun run solos dev verify --scope full --qa iris --json
```

Run from a clean, committed checkout with Bun, Surfpool, and `ELFA_API_KEY` in the environment.
The key's account must have access to non-streaming Chat (Grow or higher, or PAYG according to
[Elfa's Chat documentation](https://docs.elfa.ai/market-intelligence/chat/)). The command always
targets Elfa; `ELFA_BASE_URL` cannot redirect live QA to a fixture. It starts an offline Surfpool
and creates a disposable signer for CLI startup, without reading a wallet profile or spending SOL.

## Evidence and cost

The existing Evidence JSON gains an optional `qa` object. Its absence means live QA was not
assessed. Requested QA must pass for `ok: true` and exit zero. Dirty checkouts and failed offline
checks block paid calls. The final checkout is checked again before reporting success.

- Two cases: `cli` (`solos market ask`) and `mcp` (`solos mcp call solana_market_ask_iris`).
- Maximum two provider requests per invocation, no retries, stop on the first failure.
- `passed`: both processes returned valid, nonempty answers with current receipt timestamps.
- `blocked`: missing credentials, account access rejection, or unmet setup prerequisites.
- `failed`: an observed execution, transport, or response-contract failure.
- `reportedCredits` sums successful responses. `usageComplete: false` means a failed request may
  have consumed credits without reporting them; do not interpret the sum as the total bill.
- Answers and durations are retained for inspection. Errors retain only known codes and HTTP
  status; raw stderr and upstream failure bodies are discarded. The key is redacted from answers.
- `answerQuality: unassessed` is deliberate: transport success does not prove factual accuracy.
  Inspect source links, dates, relevance and speculation before accepting the content as useful.

The automated regression suite uses loopback fixtures, including missing keys, denied access,
malformed responses and redaction. Those reports say `mode: fixture` and cannot count as live PR
Evidence. Normal CI never opts in to live QA.

## GitHub runner

`ELFA_API_KEY` is stored only in the repository's `iris-qa` environment. Factory implementation
and review sandboxes do not receive it. The repository owner reviews the proposed head and adds
the `qa:iris` label to opt in. Only the label event runs QA; keeping the label on subsequent pushes
does not authorize more calls. Remove and re-add it after reviewing a new head. Fork PRs and
events triggered or rerun by someone other than the owner are skipped.

The workflow checks out the full PR head SHA and uploads offline and live Evidence to the run
summary and artifacts, including on failure. After the workflow is merged, the owner can also
run `iris-qa` from Actions or `gh workflow run iris-qa.yml --ref <reviewed-branch>`.

This is an explicit opt-in workflow, not a credential isolation boundary against malicious code.
The secret-bearing step executes the reviewed checkout; review it before authorizing a run.
GitHub's current repository plan does not support required environment reviewers. No branch
protection or automatic merge policy is changed. Human merge approval remains required.

## Next PR: credential intake

Add a pre-implementation credential preflight to the factory. Report missing credential names
and setup destinations on the originating issue before implementation starts; never ask for the
value in a comment. Resume when configured. Mirror unresolved blockers onto a draft PR only if
one already exists. Use GitHub notifications first; a separate email integration is unnecessary
for the first version. This PR supplies the live runner and evidence, not that orchestration.
