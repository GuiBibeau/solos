# Operating the software factory

`apps/factory` is a Vercel eve app (a plain-JavaScript port of Vercel's Foreman template) that
turns GitHub issues into reviewed draft pull requests on this repository. Decisions are in
[ADR-0016](adr/0016-software-factory-and-evidence.md); vocabulary in `CONTEXT.md`.

## Flow

1. A human scopes work (grilling → ADR) and files an issue with one of the forms: **Bug**,
   **Change**, or **Slice**. Every form has an acceptance-criteria field.
2. Someone with triage permission adds the label `agent-ready`. That moves the card to *Ready*
   on the solOS Project board and starts the factory (`FACTORY_LABEL`).
3. Stations run in Vercel Sandboxes on a clone of the repo: classifier → analyst → implementer
   → reviewer (different model vendor), optional researcher. The implementer runs
   `bun run solos dev verify --scope unit --json` and reports the Evidence; the reviewer re-runs
   `--scope check` in its own clone and refuses stale or dirty Evidence.
4. On approval the orchestrator opens a **draft** PR (`factory/<type>-<slug>`) whose body holds
   the plan, the reviewer's criterion table, and the Evidence under `## Evidence`.
5. CI (`ci.yml`) validates the Evidence against the head sha, re-runs `verify` at scopes
   `check`, `unit`, `full` (Surfpool offline), and posts its own Evidence in the job summary.
   `protected-paths.yml` fails factory branches touching CODEOWNERS paths. Red CI on a
   `factory/*` branch feeds back to the factory, capped at two fix attempts.
6. A person marks the draft ready and squash-merges. The factory has no merge tools.

Outcomes other than a PR are normal: `needs-clarification` label when the classifier cannot act,
or a finding that the request is already satisfied.

## What is set up

| Thing | Where | State |
|---|---|---|
| Repository | `GuiBibeau/solos` (private) | created, `main` protected: checks `check`, `unit`, `integration`, `evidence`; code-owner reviews; squash only; linear history |
| Labels | GitHub | `agent-ready`, `needs-clarification`, `status:blocked`, `nightly-failure`, `bug`, `enhancement`, `deps`, `docs`, `slice` |
| Vercel project | `solos-factory` on team **guivercelpro** (`team_88r90J23WEH48T19DlGj8vHf`) | root `apps/factory`, Node 24, install `bun install --frozen-lockfile`, build `eve build` |
| Env | Vercel project | `FACTORY_REPO`, `FACTORY_LABEL=agent-ready`, `FACTORY_BRANCH_PREFIX`, `FACTORY_SETUP_COMMAND=bash scripts/factory-setup.sh`, `FACTORY_MODEL_IMPLEMENTER`, `FACTORY_MODEL_REVIEWER` |
| Blob store | `solos-factory-artifacts` (`store_fo4mEDYJlEJOBa9J`), iad1 | created and connected to the project (analyst memos, artifacts) |
| AI Gateway | team OIDC | no key stored anywhere; models route through the guivercelpro gateway |

## Human steps that remain

These need a browser session on the guivercelpro team or a GitHub token scope the CLI does not
have.

1. **GitHub connector (Vercel Connect).** Dashboard → Connect → create a GitHub connector named
   `solos-factory` (UID `github/solos-factory`). Install its managed GitHub App on
   `GuiBibeau/solos` with issues, pull requests, contents, and checks permissions. Then attach it
   to the project with webhook triggers:

   ```sh
   npx vercel@latest connect attach github/solos-factory --triggers --trigger-path /eve/v1/github --scope guivercelpro
   npx vercel@latest env add GITHUB_CONNECTOR production --scope guivercelpro   # value: github/solos-factory
   ```

2. **Connect the Git repository** to the Vercel project (Project → Settings → Git →
   `GuiBibeau/solos`). Production branch `main`. Pushes touching `apps/factory` deploy; other
   pushes are skipped by `apps/factory/vercel.json`'s ignore command.

3. **Project board.** The workflows `project-intake.yml` and `project-stage-sync.yml` skip until
   these exist. Create a user-level Project "solOS" with a single-select field
   `Execution stage` (Inbox, Ready, In progress, Review, Blocked, Done), then set repo
   variables `GH_PROJECT_OWNER=GuiBibeau`, `GH_PROJECT_NUMBER`, `GH_PROJECT_ID`,
   `GH_PROJECT_EXECUTION_STAGE_FIELD_ID`, `GH_PROJECT_STAGE_<STAGE>_OPTION_ID` for each stage,
   and the secret `GH_PROJECT_TOKEN` (fine-grained PAT with Projects read/write). With a `gh`
   token that has the `project` scope (`gh auth refresh -s project`), the ids come from:

   ```sh
   gh project create --owner GuiBibeau --title solOS --format json
   gh project field-create <number> --owner GuiBibeau --name "Execution stage" --data-type SINGLE_SELECT \
     --single-select-options "Inbox,Ready,In progress,Review,Blocked,Done"
   gh project field-list <number> --owner GuiBibeau --format json
   ```

4. **Nightly RPC.** Add the repo secret `SOLANA_RPC_URL` (a provider URL you pay for). Until
   then the nightly mainnet-fork run uses the public endpoint and may be flaky.

5. **Renovate.** Install the Renovate GitHub App on the repository; `renovate.json` is committed.

6. **npm publishing** stays off. Set repo variable `NPM_PUBLISH=true` and configure npm trusted
   publishing for `@solos/actions` when ready.

## Running the factory locally

```sh
cd apps/factory
npx vercel@latest link --project solos-factory --scope guivercelpro
npx vercel@latest env pull
bun install
node ./node_modules/.bin/eve info      # discovery: tools, skills, subagents, channel, extension
node ./node_modules/.bin/eve dev       # TUI; local runs are untrusted and ask before GitHub writes
```

Node 24 is required for the `eve` CLI only (ADR-0016). Everything else stays on Bun.

## Costs

Models default to `deepseek/deepseek-v4.1-flash` (stations) and `alibaba/qwen3.8-flash`
(reviewer), both about 15 cents per million input tokens. Raise one station with
`FACTORY_MODEL_<STATION>`; the implementer and reviewer must stay on different vendors (the app
asserts this at startup). Sandboxes bill per vCPU-second; the repo clone and `bun install` are
paid once per template build, each session pays a fetch.

<!-- webhook forwarding smoke test; this PR is closed without merging -->
