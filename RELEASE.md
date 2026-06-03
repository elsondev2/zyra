# Zyra Release Workflow

Zyra is pre-1.0. Releases should stay lightweight, but version numbers should still mean something.

## Version rule

Within the `0.x.x` era, use a lightweight local meaning:

- **Small/minor release**: `0.3.5 -> 0.3.6`
  - changes the last digit
  - copy changes
  - small CLI polish
  - bug fixes
  - theme/rendering polish
  - no workflow/config/session format change

- **Major line inside 0.x**: `0.3.x -> 0.4.0`
  - changes the middle digit
  - new slash command
  - new visible workflow
  - meaningful memory/session behavior change
  - new install/update behavior
  - anything a user would experience as a new capability

- **Hold off / plan first**
  - auth changes
  - destructive file/git behavior
  - session format changes
  - memory storage changes
  - public prompt/profile architecture changes
  - anything that can lose context or break existing chats

## Normal small release

1. Check what is already modified:

   ```bash
   git status --short
   git diff --stat
   ```

2. Summarize the diff from the current version.

3. Run checks:

   ```bash
   npm run check
   npm run privacy-check
   ```

4. Bump the version:

   ```bash
   npm version patch --no-git-tag-version
   ```

5. Run checks again:

   ```bash
   npm run check
   npm run privacy-check
   ```

6. Commit:

   ```bash
   git add package.json package-lock.json src README.md RELEASE.md AGENTS.md commands prompts scripts bin install.* zyra.*
   git commit -m "chore: release zyra 0.3.6"
   ```

   Adjust the version number in the commit message.

7. Push:

   ```bash
   git push origin master
   ```

## Release note style

Keep release notes human and small:

```txt
0.3.6
- Split public Zyra behavior from selectable profile overlays.
- Improved public readiness checks for private prompt/context references.
```

## Current posture

Do not over-formalize releases yet. Prefer small last-digit releases when the CLI feels better, and change the middle digit only when the workflow actually changes.
