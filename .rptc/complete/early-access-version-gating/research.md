# Early-access version gating (collaborator-only preview channel)

**Date:** 2026-06-04
**Phase:** Research (RPTC)
**Status:** Ready for Plan
**Base branch:** `develop` (work on `claude/extension-version-access-4PUbc`)

## Question

We want to let *certain people* install builds of an unreleased feature (developed in a parallel
session) through the extension's existing in-app update flow — without disturbing `stable` or
`beta` users. How do we do this with the current update/upgrade machinery?

## Short answer

Add a third update channel, **`early-access`**, that surfaces `-alpha.*` prereleases published to
the **existing public repo**, and **honor that channel only for GitHub repo collaborators**
(verified via the user's GitHub token). This reuses the existing release-fetching plumbing almost
entirely; the only structural change is teaching the channel logic to **filter prereleases by
identifier** instead of "newest prerelease wins."

## How the update system works today

- **Extension updates** come from one hardcoded repo: `EXTENSION_REPO = 'skukla/demo-builder-vscode'`
  (`src/features/updates/services/updateManager.ts:41`).
- **Two channels**, chosen by the `demoBuilder.updateChannel` setting (`stable` | `beta`,
  `package.json:135`):
  - `stable` → GitHub `/releases/latest` (non-prereleases only).
  - `beta` → `/releases?per_page=20`, **takes the newest prerelease by semver**
    (`updateManager.ts:191-201`).
- **Download/install**: the release's `.vsix` asset → `workbench.extensions.installExtension`
  (`src/features/updates/services/extensionUpdater.ts:33`).
- **Dormant auth hook (key finding):** every GitHub call runs through `buildGitHubHeaders()`
  (`src/features/updates/services/githubApiClient.ts:46`), which reads a `'githubToken'` secret and,
  if present, adds an `Authorization` header. **That key is never written anywhere in the codebase**
  (grep-confirmed) — so update checks currently run anonymously. This is a ready-made insertion point
  for authenticated, identity-aware behavior.
- **Separate EDS token:** the EDS feature already runs a GitHub OAuth flow and stores a token under a
  *different* key, `'github-token'` (with a dash;
  `src/features/eds/services/githubTokenService.ts:27`). This existing token can be bridged for the
  collaborator check rather than prompting a second sign-in.

## Decisions locked in (PM-approved)

| Dimension | Decision |
|---|---|
| Who's allowed | **GitHub repo collaborators** (verify the token's identity via `GET /user`, then a collaborator check on `skukla/demo-builder-vscode`) |
| Where builds live | **Prereleases in the existing public repo** `skukla/demo-builder-vscode` |
| Granularity | **A 3rd channel**, `early-access`, added to `demoBuilder.updateChannel` |
| EA channel reach | **Isolated** — considers only `-alpha.*` prereleases |
| Tag convention | **`-alpha.N`** suffix (e.g. `2.0.0-alpha.1`) |
| Enforcement model | **Soft gate** — channel honored only after collaborator check passes |

## The semver pitfall this design avoids

Today's `beta` logic takes the *newest prerelease by semver* regardless of identifier. An unreleased
feature build almost always carries a **higher** version than the active beta line, e.g.:

- beta line: `1.8.0-beta.2`
- early-access: `2.0.0-alpha.1`
- `2.0.0-alpha.1 > 1.8.0-beta.2` → **beta testers would be pulled onto the unreleased feature.**

So introducing early access *forces* the channel logic to filter by prerelease identifier. That's
the central code change.

## Target channel behavior

| Channel | Considers | Picks |
|---|---|---|
| `stable` | final releases only | latest final *(unchanged)* |
| `beta` | final + `-beta.*` | highest semver among those *(refined to exclude `-alpha.*`)* |
| `early-access` | `-alpha.*` only | highest `-alpha.*`, **only if** collaborator check passes; else falls back to `beta` |

## Soft-gate trade-off (consciously accepted)

Because builds are **public prereleases**, the gate lives in extension logic, not GitHub's download
ACL.
- ✅ Trivial to publish (existing beta release flow); the official in-app update path is gated.
- ⚠️ A determined user could still download the public `.vsix` from the Releases page by hand. It
  keeps honest people on the right track; it is **not** a hard security boundary. A hard boundary
  would require a private repo, which contradicts "public prereleases."

## Residual risk from "Isolated" reach + mitigation

With `early-access` considering only `-alpha.*`, when the feature graduates (alphas stop, a final
ships) an EA user has no newer `-alpha.*` to move to and is **stranded on the last alpha**.

**Recommended mitigation (for Plan):** a **graduation off-ramp** — if a *final* release supersedes
the installed alpha's base version (e.g. final `2.0.0` ≥ installed `2.0.0-alpha.5`), prompt the user
to switch back to `stable`/`beta`. Keeps the channel alpha-only in normal operation while preventing
dead-ends.

## Code touchpoints (all under `src/features/updates/`)

1. `package.json:135` — add `early-access` to the `updateChannel` enum (+ description).
2. `updateManager.ts:161` `fetchLatestRelease` — replace "newest prerelease wins" with per-channel
   identifier filtering (`-beta.*` vs `-alpha.*`).
3. `updateManager.ts:268` `getUpdateChannel()` — widen the channel type.
4. New **collaborator gate** before honoring `early-access`: light up the dormant `'githubToken'`
   hook (`githubApiClient.ts:54`), likely bridging the EDS `'github-token'`; verify identity
   (`GET /user`) + collaborator status; cache the result; fall back to `beta` on failure/denial.
5. Graduation off-ramp prompt (mitigation above).

## Open items for the Plan phase

- Collaborator-check **caching & error handling** (TTL, offline/rate-limit fallback, denial UX).
- Token sourcing: confirm bridging the EDS `'github-token'` vs. a dedicated sign-in for updates.
- Whether the off-ramp auto-switches the setting or only prompts.

## Suggested next step (Plan phase)

Plan the five touchpoints above with TDD targets on: (a) per-channel prerelease filtering in
`fetchLatestRelease`, (b) the collaborator gate (verified → alpha; denied/unauth → beta fallback),
and (c) the graduation off-ramp decision.
