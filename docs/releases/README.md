# Releases

How a stable version of solos ships (ADR-0036). Every merge to `main` is already a canary
(`@solos-sh/cli@canary`, `SOLOS_CHANNEL=canary`); a stable release is a reviewed release PR, and
merging it is the approval. Nothing here is typed by hand that a lever can derive.

## Prepare

From a clean checkout of `main`:

```sh
bun run solos dev release prepare --bump patch      # or minor, major
```

`prepare` derives the next version from the newest `solos@` tag, checks out `release/x.y.z`,
moves both version fields of `server.json`, writes `docs/releases/x.y.z.md` from the merges since
that tag and the tool reference diff, commits those two files and opens the PR. Edit the notes
in the PR when the generated text needs a human sentence; a major must fill `## Migration` and
name the ADR that decided the break. `--dry-run` prints the version and the files without
touching anything; `--no-pr` stops after the commit.

## Review

CI runs `solos dev release check` on every `release/*` PR; it is a required status. A reviewer
checks what the lever cannot:

- **Patch.** The notes list only fixes. No tool's name, arguments, result keys or tier changed
  (the Tools section of the notes is empty).
- **Minor.** New tools and new optional arguments only. Every tool labelled `beta` that changed
  is named in the notes; no `stable` tool changed.
- **Major.** The Migration section says what breaks and how a user moves; the ADR it names
  exists and decided that break; the stability-label diff is deliberate (a `stable` tool that
  changed is a major, a tool promoted to `stable` has its live-validated row).

## Merge, and what happens next

Merging the release PR is the approval. No human gate follows:

1. `tag-release.yml` sees that the merge added `docs/releases/x.y.z.md`, tags `solos@x.y.z` at
   the merge commit and dispatches `release-cli.yml` on that tag.
2. `release-cli.yml` builds and smoke-tests the four binaries, creates the GitHub Release as a
   pre-release, and publishes the launcher and the platform packages under the npm dist-tag
   `staged`. `latest` has not moved.
3. The `smoke` job installs `@solos-sh/cli@x.y.z` from npm on each platform runner and runs
   `solos dev release smoke x.y.z`: `--version`, `doctor` (the release identity) and `mcp list`
   through a real stdio server.
4. The `promote` job runs `solos dev release promote x.y.z`: it validates the tag's
   `server.json`, points `latest` at the version on all five packages, marks the GitHub Release
   latest and no longer a pre-release, and publishes the version to the MCP Registry with
   `mcp-publisher` over GitHub OIDC.

## When the smoke fails

The version stays on `staged`: installable by exact version, invisible to `latest`. Read the
failing runner's `solos dev release smoke` JSON in the job summary. Then either fix forward
(`prepare --bump patch` with the fix) or, when the smoke failure was environmental, re-run the
`promote` job after re-running the smoke, or run `bun run solos dev release promote x.y.z` from a
machine with npm and GitHub credentials. `promote` is idempotent: a version already on `latest`
or already in the registry is skipped, not refused.

## Rollback

```sh
bun run solos dev release rollback --to a.b.c --from x.y.z --reason "why"
```

`latest` and the GitHub Release go back to `a.b.c`; `x.y.z` is deprecated on npm with the
reason, so `npm install` warns. Nothing is rebuilt. The MCP Registry is left alone: its versions
are immutable, so the registry still lists `x.y.z` until a fix-forward patch is promoted, and
`promote` refuses a version the registry has deprecated or deleted. Mark the bad version
`deprecated` in the registry by hand when needed:

```sh
mcp-publisher login github
# PATCH /v0.1/servers/{name}/versions/{version}/status with {"status":"deprecated","statusMessage":"..."}
```

The nightly workflow never touches stable releases; it prunes canary pre-releases only.
