# Zyra Desktop Root Migration — Agent Handoff

Status: ready for a separate agent after the currently running Zyra desktop dev instance is closed.

## User-approved direction

Promote the real Electron desktop application from the experimental location:

```text
apps/zyra-ui/
```

to the root application location:

```text
desktop/
```

Zyra will be one source repository containing the CLI/TUI and desktop application. The two products keep independent package versions and release artifacts.

- CLI version: root `package.json`
- Desktop version: `desktop/package.json`
- Proposed future tags: `cli-vX.Y.Z` and `desktop-vX.Y.Z`

The user is currently chatting from the dev instance located under `apps/zyra-ui`. They will close this instance before the migration agent starts and restart it only after migration is complete.

## Required final result

```text
zyra/
├── desktop/       # tracked Electron application source
├── src/           # CLI and TUI runtime
├── bin/
├── prompts/
└── scripts/
```

The user must be able to restart the desktop app from the repository root with:

```bash
npm run ui:dev
```

## Important current-state facts

1. `desktop/` does not currently exist.
2. `apps/zyra-ui/` is ignored by root `.gitignore` and has never been tracked by this repository.
3. It is not a nested Git repository.
4. It currently contains approximately 559 non-generated files.
5. It contains local/private state:
   - `apps/zyra-ui/.zyra/preferences.json`
   - `apps/zyra-ui/.zyra/sessions/`
6. It contains generated dependencies/output:
   - `apps/zyra-ui/node_modules/`
   - `apps/zyra-ui/out/`
   - possible `dist/`, `release/`, and `.playwright-cli/` directories
7. It contains a zero-byte accidental-looking top-level file:
   - `apps/zyra-ui/console.log('assistant-store-import-ok'))`
8. The root working tree is heavily dirty with unrelated auth, model, onboarding, file-streaming, documentation, and test work. Preserve all of it. Do not reset, clean, stash, checkout, or overwrite unrelated changes.
9. The active file-change-streaming implementation has known blockers documented in the preceding review. This migration should not silently fix or declare that feature complete.

## Safety rules

- Confirm the desktop dev process has been closed before moving the directory.
- Do not kill all `node`, `bun`, or Electron processes indiscriminately.
- If the rename fails because files are locked, stop and ask for the specific process to be closed.
- Use a same-volume rename/move. Do not copy and then delete the source.
- Do not run `git clean`, `git reset`, destructive checkout commands, or history rewriting.
- Do not delete local `.zyra` state.
- Do not stage secrets, sessions, databases, logs, generated output, dependencies, or local memory.
- Do not run a production desktop build during this migration.

## Work package 00 — preflight and preservation

1. Run:

   ```bash
   git status --short
   git branch --show-current
   git diff --check
   ```

2. Confirm:

   ```bash
   test -d apps/zyra-ui
   test ! -e desktop
   test ! -e apps/zyra-ui/.git
   ```

3. Record the existing modified/untracked file list in the final report. Do not alter unrelated files merely to make the tree clean.

4. Verify the local private state exists, but do not read or print session contents:

   ```bash
   find apps/zyra-ui/.zyra -maxdepth 3 -printf '%y %p\n'
   ```

5. Preserve the zero-byte accidental artifact without staging it. Move it into ignored local quarantine before or after the directory rename:

   ```text
   desktop/.zyra/migration-quarantine/console.log('assistant-store-import-ok'))
   ```

   Do not delete it in this migration.

## Work package 01 — perform the atomic folder move

After the running dev app is closed:

```bash
mv apps/zyra-ui desktop
```

If `apps/` becomes empty, it may remain as an empty local directory. Do not delete non-empty content.

Immediately verify:

```bash
test -d desktop/src
test -f desktop/package.json
test -f desktop/electron.vite.config.ts
test ! -e apps/zyra-ui
```

The existing `desktop/node_modules/` may move with the folder so the user can restart quickly. It must remain ignored and untracked.

## Work package 02 — establish safe Git boundaries

### Root `.gitignore`

Remove the broad rule:

```gitignore
apps/zyra-ui/
```

Keep the generic app-generated rules if other experiments still use `apps/`.

Add explicit desktop local/generated rules:

```gitignore
desktop/node_modules/
desktop/out/
desktop/dist/
desktop/release/
desktop/.playwright-cli/
desktop/.zyra/
desktop/*.log
desktop/.env
desktop/.env.*
!desktop/.env.example
```

### Desktop `.gitignore`

Update `desktop/.gitignore` to include at least:

```gitignore
node_modules/
out/
dist/
release/
.playwright-cli/
.zyra/
*.log
.env
.env.*
!.env.example
```

### Release archive boundary

The root CLI release currently runs `git archive HEAD`, which would include tracked desktop source. Add a root `.gitattributes` entry:

```gitattributes
/desktop export-ignore
```

This keeps desktop source in Git while excluding it from the CLI release ZIP.

Do not exclude desktop from normal GitHub source archives; it is now a real tracked part of the repository.

## Work package 03 — update active runtime and command paths

Update root `package.json`:

```text
bun run --cwd apps/zyra-ui ...
```

becomes:

```text
bun run --cwd desktop ...
```

This applies to:

- `test:file-change-streaming`
- `ui:dev`
- `ui:build`
- `ui:typecheck`

Remove `apps/zyra-ui` from the root `files` array. The CLI package/release should not bundle the desktop application.

Because `package.json` already contains unrelated unstaged changes, stage only the migration-specific path and package-boundary hunks. Do not stage unrelated auth/model/test-script additions merely because they share the file.

Update the repository map in root `AGENTS.md` with:

```text
- Desktop application: `desktop/`
```

Preserve existing unrelated edits in that file and stage only the migration hunk.

### Documentation references

Classify references before editing:

1. **Active commands/current architecture docs** — update to `desktop/`.
2. **Historical research evidence** — may retain the old path if it describes the pre-migration state; add a short migration note rather than rewriting historical evidence.
3. **Untracked user planning documents** — preserve them. Do not stage them in the migration commit unless they are explicitly part of this migration.

At minimum, make sure executable commands no longer refer to `apps/zyra-ui`.

Search both path styles:

```bash
rg -n --hidden \
  --glob '!node_modules/**' \
  --glob '!desktop/node_modules/**' \
  --glob '!desktop/out/**' \
  --glob '!desktop/dist/**' \
  'apps/zyra-ui|apps\\zyra-ui' .
```

The final report must list any deliberately retained historical references.

## Work package 04 — public tracking/privacy gate

The desktop was previously outside public Git tracking. Audit it before staging.

### Confirm ignored private/generated state

```bash
git check-ignore -v \
  desktop/.zyra/preferences.json \
  desktop/.zyra/sessions \
  desktop/node_modules \
  desktop/out
```

All must be ignored.

### Inspect candidate files

```bash
git status --short --untracked-files=all -- desktop
```

Review the complete candidate list before `git add`. Expected tracked categories:

- `desktop/src/`
- `desktop/scripts/`
- `desktop/build/`
- required icons/assets under `desktop/resources/`
- package manifests and lockfile
- TypeScript/Vite/Electron/Tailwind/PostCSS configuration
- non-private design documentation intentionally belonging to the product

Expected exclusions:

- `.zyra/`
- sessions and preferences
- `node_modules/`
- `out/`, `dist/`, `release/`
- logs
- databases
- `.env*` except a scrubbed example
- local screenshots, recordings, temporary fixtures, or credentials

### Search for sensitive/local data

Run the project check after the ignore boundary changes so it can see desktop candidates:

```bash
npm run privacy-check
```

Also search desktop candidates for:

- absolute local user paths
- OAuth callback query parameters
- API keys/tokens
- local database paths
- session IDs or session exports
- private `.zyra` references that embed local data

Redact any OAuth `code` or `state` values in reporting. Never paste callback secrets into chat, logs, commits, or handoff notes.

### License metadata

`desktop/package.json` currently declares `MIT`, while the root package declares `UNLICENSED`. Do not silently make a legal-policy decision. For this migration, use `UNLICENSED` for the desktop package unless the repository already contains an explicit license granting MIT terms or the user explicitly directs otherwise. Mention the chosen value in the final report.

## Work package 05 — CLI installer and release separation

The Windows installer downloads GitHub’s repository source archive, which will include tracked `desktop/`. Keep the installed CLI lightweight by updating `install.ps1` so `Download-ZyraSource` copies root CLI content while excluding the top-level `desktop` directory.

Requirements:

- Local Git checkouts keep `desktop/`.
- Remote CLI installation under `%LOCALAPPDATA%\Zyra` does not copy `desktop/`.
- Root dependency installation remains unchanged.
- Do not add desktop dependency installation to the CLI installer.

`install.sh` operates from a local checkout and does not need to delete desktop source. It should continue installing/linking only the root package.

Verify archive behavior after the migration commit exists, or use a temporary tree/archive check that includes staged attributes:

- CLI release archive contains root CLI/TUI files.
- CLI release archive does not contain `desktop/`.
- No production Electron build is required for this proof.

## Work package 06 — focused verification

Run the narrow checks first:

```bash
node --check scripts/build-release.mjs
npm run privacy-check
bun run --cwd desktop test:file-change-lifecycle
bun run --cwd desktop test:pi-assistant-lifecycle
bun run --cwd desktop test:assistant-diff
bun run --cwd desktop test:activity-rail
bun run --cwd desktop typecheck
node scripts/test-zyra-ui-render.mjs
```

Then run the root path that should now point to `desktop/`:

```bash
npm run test:file-change-streaming
```

Notes:

- These commands can be slow on the current Windows filesystem. Wait for actual completion; do not treat a launch line as a pass.
- The Pi lifecycle test intentionally logs a simulated usage-limit error before passing.
- The current file-change feature has review-discovered correctness failures not covered by its official suite: corrupt write-new patches and TUI late-event duplication. Do not claim the feature itself is release-ready merely because migration checks pass.
- Do not run `npm run ui:build`, Electron packaging, or a production build for this migration.

### Optional dev startup smoke

Do not leave a managed dev process running silently. If a startup smoke is needed, run it only long enough to prove that the moved path resolves, then stop it cleanly. The user will perform the final interactive restart.

## Work package 07 — stage and commit only the migration

The migration commit should contain:

- tracked `desktop/` application source and required build resources
- `.gitignore` boundary changes
- `.gitattributes` CLI archive exclusion
- migration-specific root command/path changes
- installer exclusion for remote CLI installs
- minimal current architecture documentation update

It must not contain:

- `desktop/.zyra/`
- sessions, preferences, logs, databases, secrets, or local exports
- `desktop/node_modules/`, `out/`, `dist/`, or `release/`
- the zero-byte quarantined artifact
- unrelated root auth/model/onboarding changes
- unrelated untracked planning documents
- opportunistic file-change-streaming fixes

Use partial staging where tracked files already contain unrelated edits:

```bash
git add desktop .gitignore .gitattributes
git add -p package.json AGENTS.md install.ps1
```

Before committing:

```bash
git diff --cached --stat
git diff --cached --check
git diff --cached --name-status
git status --short
```

Inspect the staged file list carefully. A large initial desktop source addition is expected; private/generated files are not.

Suggested commit message:

```text
chore(desktop): promote app into tracked root workspace
```

Do not push unless the user separately asks for a push.

## Required final report to the user

Report:

1. Whether `apps/zyra-ui/` was successfully moved to `desktop/`.
2. The commit hash and commit message.
3. Exactly what remained ignored/private.
4. Privacy-check result.
5. Focused test/typecheck results, including timeouts or failures.
6. Any historical old-path references deliberately retained.
7. Confirmation that unrelated working-tree changes remain unstaged/preserved.
8. Anything still unproven.
9. The restart instruction:

   ```bash
   npm run ui:dev
   ```

Use this exact readiness language only if all migration checks and the commit succeeded:

> Desktop migration is complete. Restart Zyra from the repository root with `npm run ui:dev`.

If migration or commit is incomplete, do not tell the user to restart. State the blocker and preserve both source and destination without destructive cleanup.
