# @solos/factory

The solOS software factory: a Vercel [eve](https://eve.dev) agent that takes GitHub issues labelled `agent-ready` on `GuiBibeau/solos`, moves each through four stations (classifier, analyst, implementer, reviewer), and delivers a reviewed draft pull request whose body carries the implementer's Evidence. People keep the judgment calls: marking a PR ready waits for approval, merging is not in the tool surface at all.

It is a port of Vercel's [Foreman template](https://github.com/vercel-labs/eve-software-factory-template) to plain JavaScript with JSDoc types, with Linear removed and the stations rewritten for this repository.

## The hard rule

The factory never holds a Solana signer, RPC URL, wallet profile, or gateway key. No `SOLOS_*`, `SOLANA_*`, or `AI_GATEWAY_API_KEY` variable is set on the project or present in any sandbox; `agent/lib/github/sandbox-commands.js` asserts that at every sandbox bootstrap and session start and fails the run if one appears. Tests run on Surfpool, offline. The gateway and Blob authenticate with the deployment's OIDC token. A work item that needs live verification or real funds is routed back to a maintainer.

## How work arrives

- A maintainer (at least triage permission, verified against the API) labels an issue `agent-ready`. The run is unattended: it may apply labels, comment on its own intake issue, close or reopen issues, and open a draft PR; everything else is denied rather than parked.
- An owner, member, or collaborator @mentions the app on an issue or PR. The run is attended and trusted: reversible writes run without a card, shipping actions wait for approval.
- Red CI on a `factory/*` pull request dispatches a fix run, capped at two attempts counted from its own comments on the thread.
- Codex inline review findings on a current, open `factory/*` PR in this repository dispatch an unattended revision without an @mention. The signed sender and comment author must both be `chatgpt-codex-connector[bot]` (GitHub account ID `199175422`). The earliest finding for the reviewed head supplies all that review's findings to one turn; other bots, review replies, status summaries, forks, closed PRs and stale reviews are ignored. The run evaluates the findings, revises the existing branch, reruns verification and updates Evidence; merge remains manual.
- Automatic Codex revisions are capped at two attempts per PR. The factory records a `solos-factory:codex-review` marker before starting work. Intake rejects recorded attempts, and queued turns must recheck the marker and head before acting. A failed attempt consumes a slot; a maintainer can still request help with an @mention. These markers are agent-written safeguards, not an atomic distributed lock across different review or CI sessions.
- Every 15 minutes, a deterministic schedule finds open, same-repository `factory/*` PRs behind `main` and queues a PR-scoped rebase revision. Current branches never wake a model. The tool rechecks both SHAs and uses GitHub’s `updatePullRequestBranch` with `REBASE` and `expectedHeadOid`; it exposes no general force-push capability. The implementer verifies the rebased head with full scope, an independent reviewer checks it, and the root refreshes Evidence only while its SHA still matches the PR.
- Rebase attempts are recorded by the tool before mutation and limited to one per head/main pair. Conflicts or uncertain API outcomes stop with a human-visible blocker, preserving the draft/ready state and manual merge gate. Markers suppress repeat attempts but are not a cross-session lock: concurrent updates are refused by GitHub’s expected-head guard and ordinary non-fast-forward push protection. A failed verification needs maintainer follow-up; the sweep does not endlessly regenerate Evidence.
- Someone opens a pull request: the factory posts one orienting comment, never a review.
- The dev TUI (`bun run dev`): the local principal is untrusted, so every GitHub write parks on an approval card.

## The pipeline

| Station | Model (env, default) | Own sandbox | What it returns |
| --- | --- | --- | --- |
| classifier | `FACTORY_MODEL_CLASSIFIER`, `zai/glm-5.3-flash` | no | type, priority, complexity, slice, `needs_clarification` |
| analyst | `FACTORY_MODEL_ANALYST`, `zai/glm-5.3-flash` | clone of the repo | plan, slice, tool tier and `simulate` twin, constraining ADR, acceptance criteria copied from the issue form and only extended |
| implementer | `FACTORY_MODEL_IMPLEMENTER`, `zai/glm-5.3-flash` | clone of the repo | branch `factory/<type>-<slug>`, conventional commits, changeset when `packages/actions` changes, `evidence`: the JSON of `bun run solos dev verify --scope unit --json` verbatim |
| reviewer | `FACTORY_MODEL_REVIEWER`, `openai/gpt-5.6-luna` | clone of the repo | Evidence gate first (`--scope check` in its own clone, sha compared with the implementer's; missing, mismatched, or dirty Evidence is `request_changes` before reading the diff), then criteria table and verdict |
| researcher | `FACTORY_MODEL_RESEARCHER`, `zai/glm-5.3-flash` | no | cited findings and gaps, on demand |

The reviewer must run on a different vendor than the implementer; `agent/lib/models.js` throws at module load otherwise, so discovery fails instead of shipping self-review. The orchestrator (`FACTORY_MODEL_ORCHESTRATOR`) never edits code: it routes, relays artifact ids, and assembles the PR body: problem statement, `## Plan`, `## Acceptance criteria` (the reviewer's table), `## Evidence` (the implementer's JSON in a ```json fence, untouched), deviations, `Closes #N`. CI parses the Evidence section (`solos dev evidence check`).

Session token budgets follow the configured provider. Z.ai models set `maxInputTokensPerSession: false` and omit `maxOutputTokensPerSession`, so Eve does not pause newly created GLM sessions on a cumulative token budget. Non-Z.ai models retain a 40M cumulative input cap and the original output cap for their station (2M root, 40K classifier, 80K analyst/researcher, 200K implementer, 100K reviewer). Production therefore uncaps the five GLM-backed roles while the independent OpenAI reviewer keeps both safeguards. Model and provider limits on each response, the 1M-token GLM context window, and Eve's normal session lifetime still apply. Eve stores limits in each durable session, so a session parked before this configuration deploys retains its old window; approve that pending continuation once to resume it instead of redispatching the work.

Every station starts by reading `AGENTS.md` and `CONTEXT.md` in `/workspace/repo`. The implementer never edits `packages/actions/**`, `docs/adr/**`, `.github/**`, `eslint.config.js`, `biome.json`, `.dependency-cruiser.cjs`, `tsconfig.json`, `LICENSE`, or `CODEOWNERS`; a plan that needs one stops with `pushed: false` and the orchestrator reports which path a maintainer has to change.

## Layout

```text
apps/factory/
  agent/
    agent.js                 defineAgent: orchestrator model and compaction
    instructions.js          defineInstructions from agent/lib/prompt/*.js (FACTORY_REPO injected at build)
    sandbox.js               root Vercel Sandbox; marks /workspace safe for git
    channels/github.js       mention gate (trusted stamp), agent-ready intake (autonomous principal), red-CI loop, PR summary
    channels/eve.js          route auth: localDev user shim + vercelOidc
    extensions/github.js     @github-tools/eve-extension mount: explicit include list, approval policies
    tools/                   agent (disabled), glob, grep, read-artifact, get/save/clear-user-preferences, read/update-factory-brain
    schedules/rebase-pull-requests.js   15-minute scan; dispatch only when main is ahead
    skills/                  writing-quality, triaging-issues
    subagents/<station>/     agent.js (outputSchema, so every call is task mode) + instructions.md + sandbox.js + tools/
    lib/
      models.js              FACTORY_MODEL_* with defaults, vendor assertion
      constants.js           FACTORY_REPO, FACTORY_LABEL, FACTORY_BRANCH_PREFIX, FACTORY_SETUP_COMMAND
      trust.js               the single trust authority: stamps and predicates
      blob.js                reserved-namespace registry + document helpers
      user-preferences.js, factory-brain.js, artifacts/   Blob key derivation and the artifact tools
      prompt/                the orchestrator prompt in three fragments
      github/                approval policies, credentials, bot name, git remote safety, branch tools,
                             sandbox lifecycle (repo-sandbox, sandbox-commands), channel gates and tasks, diagnostics
  evals/                     eve eval suite: smoke, routing/, safety/, pipeline/ (opt-in real run)
  jsconfig.json              the type-check config eve also reads for path mapping
  vercel.json                ignoreCommand skips builds when apps/factory did not change
```

Identity comes from the filesystem: `agent/tools/read-artifact.js` is the tool `read-artifact`, `agent/subagents/analyst/` is the subagent `analyst`, `agent/extensions/github.js` mounts tools as `github__*`. File names are kebab-case like the rest of the repo, so tool names are hyphenated.

## Security properties kept from the template

- Trust is decided at dispatch on the signed webhook and stamped into session auth (`agent/lib/trust.js`); approval predicates in `agent/lib/github/approval.js` read the stamps. Nothing re-derives trust from model-readable content.
- Draft PRs are the unattended ceiling; anything that can ship parks for a person; merge tools are absent.
- Stations run in task mode and hold no approvable tools. `push-branch` and `checkout-branch` are inert by construction: `validateBranch` refuses `main`, `master`, `refs/*`, `HEAD`, and anything outside a conservative character set.
- Git credentials never enter a sandbox: every clone, fetch, and push targets the literal `https://github.com/<FACTORY_REPO>.git`, with the installation token injected at the sandbox firewall and dropped in a `finally`.
- Artifact ids are the one Blob address the model supplies and must match the anchored `ARTIFACT_ID_PATTERN`; saves never overwrite and are size-bounded. Preference keys derive from the principal, the brain key from `FACTORY_REPO`.

## Configuration

See `.env.example`. Set `ZAI_CODING_API_KEY` as a Vercel Secret for Production and Preview. The default stations use `glm-5.3-flash` directly at `https://api.z.ai/api/coding/paas/v4`, so their requests use the Coding Plan endpoint. There is no automatic fallback to the separately billed Model API or Gateway. The reviewer remains on `openai/gpt-5.6-luna` through Gateway for review by a different vendor. The Z.ai key is read at request time and never forwarded to sandboxes.

 `GITHUB_CONNECTOR` (Vercel Connect connector UID) and `FACTORY_REPO` are the two values a deployment sets; everything else has a default. `FACTORY_SETUP_COMMAND` defaults to `bash scripts/factory-setup.sh` (at the repo root), which installs Bun at the version in `.bun-version`, runs `bun install --frozen-lockfile`, and runs `bun run solos dev verify --scope check --json` inside the sandbox clone at template build.

## Commands

```sh
bun install                                   # from the repo root (Bun workspaces)
cd apps/factory
bun run info                                  # eve info: discovered surface and diagnostics (0 errors, 0 warnings)
bun run dev                                   # eve dev TUI; needs a linked Vercel project for sandboxes and Connect
bun run typecheck                             # tsc -p jsconfig.json (also covered by the root `bun run typecheck`)
bun run eval -- --tag fast                    # cheap eval loop; costs model tokens
bun run eval -- pipeline/full-pipeline        # pushes a real branch to FACTORY_REPO; run against a scratch repo
bun run build                                 # eve build (clones FACTORY_REPO to prewarm the station sandboxes)
```

`eve info` needs `FACTORY_REPO` (defaults to `GuiBibeau/solos`) and `GITHUB_CONNECTOR` (defaults to `github/solos-factory`); no network call is made until a run. From the repo root, `bun run check` (format, lint, dependency rules, types) covers this app.

Deploy with `eve deploy` from `apps/factory` (it wraps `vercel deploy --prod`); the Vercel project's root directory is `apps/factory`, and `vercel.json`'s `ignoreCommand` skips builds when nothing under it changed. The GitHub connector needs the `issues`, `issue_comment`, `pull_request`, `pull_request_review_comment`, and `check_suite` events, and the app needs write access to contents, issues, and pull requests on `FACTORY_REPO`.

Eve 0.56.0 filters every bot comment before its custom `onComment` hook. `patches/eve@0.56.0.patch` lets custom hooks decide which bots to accept; Eve's default mention handler, own-comment filter and webhook verification stay intact. Bun applies this pinned patch during install. The signed-webhook integration tests exercise the installed package through a loopback GitHub API and must pass when upgrading Eve. No new webhook subscriptions or credentials are needed. The rebase schedule is generated as a Vercel Cron Job by Eve; confirm `rebase-pull-requests` under Settings → Cron Jobs after deployment. GitHub branch rules still apply, and any rejected rebase stops for a maintainer. GitHub must still run Codex review first (usually on a ready PR or after a maintainer requests `@codex review`); the factory does not purchase or request reviews itself.

## Repo integration

- ESLint: element `factory` (`apps/factory/**`) in `eslint-plugin-boundaries`, allowed to import only itself; dependency-cruiser rule `factory-is-a-leaf` says the same. The factory imports nothing from `packages/*` or the other apps.
- Type checking: the root `tsconfig.json` includes `apps/factory/agent/**/*.js` and `apps/factory/evals/**/*.js`, so `bun run typecheck` covers the app with the repo's strict settings. The app's own `jsconfig.json` (which eve reads for resolution) is equivalent with `types: ["node"]`, since the factory runs on Node 24 on Vercel, plus a `paths` entry mapping `punycode` to `@types/node`'s declaration: `@types/node@24` imports `punycode`, Bun hoists the untyped `punycode` package, and without the mapping tsc type-checks that JavaScript file.
- Bun is the package manager (workspace member); eve requires Node ≥ 24 at runtime, so `engines.node` is `24.x` and the `eve` CLI is run with Node.

## Lint exceptions

Rules that are switched off or relaxed for `apps/factory/**` in the root `eslint.config.js`. Every size rule (production `max-lines` 150 logical and 225 physical, test `max-lines` 300 logical and physical, `max-lines-per-function` 40, `complexity` 8, `max-params` 3, `max-statements` 20) applies unchanged.

| Rule | Scope | Why |
| --- | --- | --- |
| `import-x/no-default-export` | `agent/agent.js`, `agent/instructions.js`, `agent/sandbox.js`, `agent/{tools,channels,extensions,schedules}/*.js`, `agent/subagents/*/{agent,sandbox}.js`, `agent/subagents/*/tools/*.js`, `evals/evals.config.js`, `evals/**/*.eval.js` | eve discovers these slots by their default export. Everything under `agent/lib/` and `evals/helpers.js` uses named exports. |
| `import-x/no-cycle` with `ignoreExternal: true` | `apps/factory/**` | Cycles inside the factory are still checked. Following imports into eve's bundled `dist` (thousands of modules) from a whole-repo `eslint .` that already sits near the default heap ceiling ran out of memory. |

The ESLint `ignores` list and the dependency-cruiser `exclude` also skip `**/.eve/**` and `**/.output/**`, eve's compiled artifacts.
