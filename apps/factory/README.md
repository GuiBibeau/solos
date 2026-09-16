# @solos/factory

The solOS software factory: a Vercel [eve](https://eve.dev) agent that takes GitHub issues labelled `agent-ready` on `GuiBibeau/solos`, moves each through four stations (classifier, analyst, implementer, reviewer), and delivers a reviewed draft pull request whose body carries the implementer's Evidence. People keep the judgment calls: marking a PR ready waits for approval, merging is not in the tool surface at all.

It is a port of Vercel's [Foreman template](https://github.com/vercel-labs/eve-software-factory-template) to plain JavaScript with JSDoc types, with Linear removed and the stations rewritten for this repository.

## The hard rule

The factory never holds a Solana signer, RPC URL, wallet profile, or gateway key. No `SOLOS_*`, `SOLANA_*`, or `AI_GATEWAY_API_KEY` variable is set on the project or present in any sandbox; `agent/lib/github/sandbox-commands.js` asserts that at every sandbox bootstrap and session start and fails the run if one appears. Tests run on Surfpool, offline. The gateway and Blob authenticate with the deployment's OIDC token. A work item that needs live verification or real funds is routed back to a maintainer.

## How work arrives

- A maintainer (at least triage permission, verified against the API) labels an issue `agent-ready`. The run is unattended: it may apply labels, comment on its own intake issue, close or reopen issues, and open a draft PR; everything else is denied rather than parked.
- An owner, member, or collaborator @mentions the app on an issue or PR. The run is attended and trusted: reversible writes run without a card, shipping actions wait for approval.
- Red CI on a `factory/*` pull request dispatches a fix run, capped at two attempts counted from its own comments on the thread.
- Someone opens a pull request: the factory posts one orienting comment, never a review.
- The dev TUI (`bun run dev`): the local principal is untrusted, so every GitHub write parks on an approval card.

## The pipeline

| Station | Model (env, default) | Own sandbox | What it returns |
| --- | --- | --- | --- |
| classifier | `FACTORY_MODEL_CLASSIFIER`, `deepseek/deepseek-v4.1-flash` | no | type, priority, complexity, slice, `needs_clarification` |
| analyst | `FACTORY_MODEL_ANALYST`, `deepseek/deepseek-v4.1-flash` | clone of the repo | plan, slice, tool tier and `simulate` twin, constraining ADR, acceptance criteria copied from the issue form and only extended |
| implementer | `FACTORY_MODEL_IMPLEMENTER`, `deepseek/deepseek-v4.1-flash` | clone of the repo | branch `factory/<type>-<slug>`, conventional commits, changeset when `packages/actions` changes, `evidence`: the JSON of `bun run solos dev verify --scope unit --json` verbatim |
| reviewer | `FACTORY_MODEL_REVIEWER`, `openai/gpt-5.6-luna` | clone of the repo | Evidence gate first (`--scope check` in its own clone, sha compared with the implementer's; missing, mismatched, or dirty Evidence is `request_changes` before reading the diff), then criteria table and verdict |
| researcher | `FACTORY_MODEL_RESEARCHER`, `deepseek/deepseek-v4.1-flash` | no | cited findings and gaps, on demand |

The reviewer must run on a different vendor than the implementer; `agent/lib/models.js` throws at module load otherwise, so discovery fails instead of shipping self-review. The orchestrator (`FACTORY_MODEL_ORCHESTRATOR`) never edits code: it routes, relays artifact ids, and assembles the PR body: problem statement, `## Plan`, `## Acceptance criteria` (the reviewer's table), `## Evidence` (the implementer's JSON in a ```json fence, untouched), deviations, `Closes #N`. CI parses the Evidence section (`solos dev evidence check`).

Every station starts by reading `AGENTS.md` and `CONTEXT.md` in `/workspace/repo`. The implementer never edits `packages/actions/**`, `docs/adr/**`, `.github/**`, `eslint.config.js`, `biome.json`, `.dependency-cruiser.cjs`, `tsconfig.json`, `LICENSE`, or `CODEOWNERS`; a plan that needs one stops with `pushed: false` and the orchestrator reports which path a maintainer has to change.

## Layout

```text
apps/factory/
  agent/
    agent.js                 defineAgent: orchestrator model, compaction, session budget
    instructions.js          defineInstructions from agent/lib/prompt/*.js (FACTORY_REPO injected at build)
    sandbox.js               root Vercel Sandbox; marks /workspace safe for git
    channels/github.js       mention gate (trusted stamp), agent-ready intake (autonomous principal), red-CI loop, PR summary
    channels/eve.js          route auth: localDev user shim + vercelOidc
    extensions/github.js     @github-tools/eve-extension mount: explicit include list, approval policies
    tools/                   agent (disabled), glob, grep, read-artifact, get/save/clear-user-preferences, read/update-factory-brain
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

See `.env.example`. `GITHUB_CONNECTOR` (Vercel Connect connector UID) and `FACTORY_REPO` are the two values a deployment sets; everything else has a default. `FACTORY_SETUP_COMMAND` defaults to `bash scripts/factory-setup.sh` (at the repo root), which installs Bun at the version in `.bun-version`, runs `bun install --frozen-lockfile`, and runs `bun run solos dev verify --scope check --json` inside the sandbox clone at template build.

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

## Repo integration

- ESLint: element `factory` (`apps/factory/**`) in `eslint-plugin-boundaries`, allowed to import only itself; dependency-cruiser rule `factory-is-a-leaf` says the same. The factory imports nothing from `packages/*` or the other apps.
- Type checking: the root `tsconfig.json` includes `apps/factory/agent/**/*.js` and `apps/factory/evals/**/*.js`, so `bun run typecheck` covers the app with the repo's strict settings. The app's own `jsconfig.json` (which eve reads for resolution) is equivalent with `types: ["node"]`, since the factory runs on Node 24 on Vercel, plus a `paths` entry mapping `punycode` to `@types/node`'s declaration: `@types/node@24` imports `punycode`, Bun hoists the untyped `punycode` package, and without the mapping tsc type-checks that JavaScript file.
- Bun is the package manager (workspace member); eve requires Node ≥ 24 at runtime, so `engines.node` is `24.x` and the `eve` CLI is run with Node.

## Lint exceptions

Rules that are switched off or relaxed for `apps/factory/**` in the root `eslint.config.js`. Every size rule (`max-lines` 150, `max-lines-per-function` 40, `complexity` 8, `max-params` 3, `max-statements` 15) applies unchanged.

| Rule | Scope | Why |
| --- | --- | --- |
| `import-x/no-default-export` | `agent/agent.js`, `agent/instructions.js`, `agent/sandbox.js`, `agent/{tools,channels,extensions}/*.js`, `agent/subagents/*/{agent,sandbox}.js`, `agent/subagents/*/tools/*.js`, `evals/evals.config.js`, `evals/**/*.eval.js` | eve discovers these slots by their default export. Everything under `agent/lib/` and `evals/helpers.js` uses named exports. |
| `import-x/no-cycle` with `ignoreExternal: true` | `apps/factory/**` | Cycles inside the factory are still checked. Following imports into eve's bundled `dist` (thousands of modules) from a whole-repo `eslint .` that already sits near the default heap ceiling ran out of memory. |

The ESLint `ignores` list and the dependency-cruiser `exclude` also skip `**/.eve/**` and `**/.output/**`, eve's compiled artifacts.
