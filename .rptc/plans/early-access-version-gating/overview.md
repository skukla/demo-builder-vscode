# Implementation Plan: Early-Access Update Channel (collaborator-gated)

## Status Tracking

- [x] Planned
- [x] In Progress (TDD Phase) — all 7 steps GREEN
- [x] Efficiency Review — clean, no must-fix
- [x] Security Review — safe to ship; encodeURIComponent hardening applied
- [ ] Complete

**Created:** 2026-06-04
**Last Updated:** 2026-06-04
**Base branch:** `develop` (work on `claude/extension-version-access-4PUbc`)

---

## Executive Summary

**Feature:** A third update channel, `early-access`, that surfaces `-alpha.*` prereleases of the extension from the existing public repo `skukla/demo-builder-vscode`, honored ONLY for verified GitHub repo collaborators.

**Purpose:** Let specific people install unreleased-feature builds through the in-app update flow without pulling `stable` or `beta` users onto `-alpha.*` builds.

**Approach:**
1. Fix the channel filtering bug: replace "newest prerelease wins" in `fetchLatestRelease` with per-channel prerelease-identifier classification (`stable` = final only; `beta` = final + `-beta.*`, excluding `-alpha.*`; `early-access` = `-alpha.*` only). Extract a small pure `releaseTrack.ts` classifier helper.
2. Widen the channel type to `'stable' | 'beta' | 'early-access'` everywhere it is referenced (a new `UpdateChannel` type in `types.ts`), and add the enum + description to `package.json`.
3. Add a small focused collaborator-gate helper (`collaboratorGate.ts`) that verifies token identity (`GET /user`) + collaborator status on `skukla/demo-builder-vscode`, caches the result with a TTL, and on ANY failure returns "not a collaborator". No class hierarchy, no DI, no interfaces.
4. Source the token by reading the EDS-stored secret key `'github-token'` directly via `context.secrets` from within updates (avoids a feature→feature import).
5. Wire the gate into `checkExtensionUpdate`: if the configured channel is `early-access` but the gate fails, fall back to `beta` behavior.
6. Add a graduation off-ramp: when channel is `early-access` and the installed version is an `-alpha.*` whose base version is met or exceeded by a final release, prompt the user to switch back to `stable`/`beta`.
7. Make the silent background checker (`src/utils/autoUpdater.ts`) channel-safe so it never serves `-alpha.*` builds.

**Estimated Complexity:** Medium

**Estimated Timeline:** 3-4 days

**Key Risks:**
1. Soft-gate only (consciously accepted in research) — public `.vsix` is still hand-downloadable; the gate keeps honest users on the right track, not a hard ACL.
2. Token-key drift: updates currently reads a never-written `'githubToken'` secret; EDS writes `'github-token'` (a JSON blob `{ token, tokenType, scopes }`, not a raw string). Bridging must parse the EDS blob shape correctly.
3. Two parallel implementations of channel logic exist (`updateManager.ts` AND `src/utils/autoUpdater.ts`, the latter instantiated at `extension.ts:322`). The background auto-updater must not silently pull EA builds. Plan addresses both.
4. Graceful degradation: GitHub failures must fall back to `beta`, never throw to the user.

---

## Research References

**Research Document:** `.rptc/research/2026-06-04-early-access-version-gating.md`

**Key Findings:**
- Extension updates come from one hardcoded repo `EXTENSION_REPO = 'skukla/demo-builder-vscode'` (`updateManager.ts:41`).
- Two channels today (`stable` | `beta`) chosen by `demoBuilder.updateChannel` (`package.json:135`).
- `beta` takes "newest prerelease by semver" regardless of identifier (`updateManager.ts:191-201`) — this is the bug that would pull beta users onto `2.0.0-alpha.1`.
- Dormant auth hook: every GitHub call runs through `buildGitHubHeaders()` which reads a `'githubToken'` secret that is never written anywhere (`githubApiClient.ts:54`).
- EDS already stores a GitHub OAuth token under the DIFFERENT key `'github-token'` as a JSON blob `{ token, tokenType, scopes }` (`githubTokenService.ts:27`, `:49-50`; type at `eds/services/types.ts:11-17`), and already verifies identity via `GET /user` (`githubTokenService.ts:112`).
- `autoUpdater.ts` is live (instantiated `extension.ts:322`), runs every 4h (`autoUpdater.ts:22-26`), and has its own "newest prerelease wins" sort (`:75-87`).

**Relevant Files (with line numbers):**
- `src/features/updates/services/updateManager.ts` — `fetchLatestRelease` (`:161-246`, prerelease sort `:191-201`), `getUpdateChannel` (`:268-271`), `isNewerVersion` (`:273-280`), `parseVersionFromTag` (`:285-287`), `checkExtensionUpdate` (`:52-70`), `checkAllProjectsForUpdates` (`:79-154`), `EXTENSION_REPO` (`:41`).
- `src/features/updates/services/githubApiClient.ts` — `GITHUB_API_BASE` (`:21`), `buildGitHubHeaders` + `'githubToken'` (`:46-60`), `fetchWithTimeout` using `TIMEOUTS.QUICK` (`:72-84`).
- `src/features/updates/services/extensionUpdater.ts` — VSIX download + `validateGitHubDownloadURL` (`:66-73`), install (`:33-36`).
- `src/features/updates/commands/checkUpdates.ts` — extension update prompt (`:151-166`).
- `src/features/updates/services/types.ts` — `ReleaseInfo`, `UpdateCheckResult`, `GitHubRelease`.
- `src/features/eds/services/githubTokenService.ts` — `'github-token'` (`:27`), `JSON.stringify(token)` (`:50`); `eds/services/types.ts:11-17` (`GitHubToken`).
- `src/core/utils/timeoutConfig.ts` — `TIMEOUTS.QUICK = 5000` (`:44`), `CACHE_TTL.MEDIUM = 300000` (`:293`).
- `src/utils/autoUpdater.ts` — `getUpdateChannel` (`:133-136`), prerelease sort (`:75-87`), 4h interval (`:22-26`).
- `package.json` — `demoBuilder.updateChannel` enum (`:135-143`).

**Existing tests mirrored for style:**
- `tests/features/updates/services/updateManager-channels.test.ts`
- `tests/features/updates/services/updateManager-checking.test.ts`
- `tests/features/updates/services/updateManager.testUtils.ts`

---

## PM Decisions (CONFIRMED)

| Question | Decision |
|----------|----------|
| Who is allowed | GitHub repo collaborators on `skukla/demo-builder-vscode` (token identity + collaborator check) |
| Channel reach | `early-access` considers `-alpha.*` only |
| Gate failure behavior | Fall back to `beta` (never throw) |
| Token source | (a) Read the EDS secret key `'github-token'` directly via `context.secrets`; do NOT import from `features/eds` |
| Collaborator endpoint | `GET /repos/{owner}/{repo}/collaborators/{username}` (204 = collaborator, 404 = not) |
| Cache TTL for gate result | `CACHE_TTL.MEDIUM` (5 min) in-memory; success AND failure cached |
| Off-ramp UX | Prompt-only with action buttons; never auto-write the setting |
| Token scope | **Gate-only** — the token is used solely for the collaborator gate; `buildGitHubHeaders` and other update calls stay as-is (anonymous) |
| `autoUpdater.ts` background path | Channel-aware; treats `early-access` as `beta` (no gate/token in the silent path) |
| Alpha tag convention | `X.Y.Z-alpha.N` (semver prerelease identifier `alpha`) |

---

## Ordered Step List

1. **Step 1 — `releaseTrack` classifier helper (pure, no I/O).**
2. **Step 2 — Channel type widening + per-channel filtering in `fetchLatestRelease`.** (Fixes the beta-vs-alpha bug.)
3. **Step 3 — `package.json` enum + description.**
4. **Step 4 — `collaboratorGate` helper (token read + identity + collaborator check + TTL cache, graceful).**
5. **Step 5 — Wire gate into `checkExtensionUpdate` with beta fallback.**
6. **Step 6 — Graduation off-ramp detection + prompt in `checkUpdates`.**
7. **Step 7 — Make `autoUpdater.ts` background checker channel-safe.**

Each step is independently green before the next.

---

## Test Strategy

- **Framework:** Jest + ts-jest (Node), mirroring `tests/features/updates/services/*`.
- **Mocks:** Reuse `updateManager.testUtils.ts`; extend with EA helpers. `vscode`, `@/core/logging`, `@/core/utils/timeoutConfig`, `@/core/validation`, and `global.fetch` are mocked as in the existing channel/checking tests.
- **Coverage Goal:** 100% for `releaseTrack.ts` and `collaboratorGate.ts`; 90%+ for modified `updateManager.ts` paths.
- **No magic timeouts:** all timing uses `TIMEOUTS.*` / `CACHE_TTL.*`.

---

## Constraints (project SOPs)

- Strict TDD (tests first each step).
- No magic timeout numbers — use `TIMEOUTS.*` / `CACHE_TTL.*`.
- No nested ternaries — classifier uses explicit `if`/early returns.
- KISS/YAGNI — two new small files only (`releaseTrack.ts`, `collaboratorGate.ts`); no interfaces, factories, or DI.
- Features import only from `@/core/*` and `@/types` (the `src/utils/*` orchestration layer MAY import from features — relevant to Step 7).
- Token never logged. `validateGitHubDownloadURL` still applies to alpha builds (`updateManager.ts:226`, `extensionUpdater.ts:66-73`; unchanged).

---

## File Reference Map

### New files
- `src/features/updates/services/releaseTrack.ts`
- `src/features/updates/services/collaboratorGate.ts`
- `tests/features/updates/services/releaseTrack.test.ts`
- `tests/features/updates/services/collaboratorGate.test.ts`
- `tests/features/updates/services/updateManager-earlyAccess.test.ts`

### Modified files
- `src/features/updates/services/types.ts` (add `UpdateChannel`)
- `src/features/updates/services/updateManager.ts` (Steps 2, 5, 6 hooks)
- `src/features/updates/commands/checkUpdates.ts` (Step 6 off-ramp prompt)
- `src/utils/autoUpdater.ts` (Step 7)
- `package.json` (Step 3)
- `tests/features/updates/services/updateManager.testUtils.ts` (add EA helpers)
- `tests/features/updates/services/updateManager-channels.test.ts` (add EA + beta-excludes-alpha cases)

**Total:** 5 created, 7 modified.

---

## Next Actions

After approval, run `/rptc:tdd "@early-access-version-gating/"` starting at `step-01.md`.
