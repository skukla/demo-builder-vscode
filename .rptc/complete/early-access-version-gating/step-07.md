# Step 7: Make `autoUpdater.ts` Background Checker Channel-Safe

**Purpose:** The background auto-updater (`src/utils/autoUpdater.ts`, instantiated at `extension.ts:322`) is a SECOND, independent copy of channel/fetch logic that runs silently every 4 hours (`:22-26`). It still uses "newest prerelease wins" (`:75-87`) and has no gate/token wiring. Ensure it cannot silently pull anyone onto an `-alpha.*` build via the background path.

**Prerequisites:**
- [x] Steps 1-6 green
- [x] Background path treats `early-access` as `beta` (CONFIRMED — no gate in the silent path)

---

## Tests to Write First

### New file: `tests/utils/autoUpdater.test.ts`
This file uses `axios` (`autoUpdater.ts:4`), not fetch. Mock `axios`, `vscode`, `@/core/utils/timeoutConfig`, `@/core/logging`.

- [ ] **beta excludes alpha (background):** config `'beta'`; axios returns array with alpha higher-semver than beta; assert returned `UpdateInfo.version` is the beta, not the alpha.
- [ ] **early-access collapses to beta (background, no gate):** config `'early-access'`; array with alpha + beta; assert returned version is the beta (background never serves alpha).
- [ ] **stable unchanged:** config `'stable'`; uses `/releases/latest`.
- [ ] **no eligible release → undefined** (existing graceful behavior preserved).

---

## Files to Create/Modify
- [ ] `src/utils/autoUpdater.ts` — replace inline sort with `selectLatestForChannel`; collapse EA→beta
- [ ] `tests/utils/autoUpdater.test.ts` (new)

---

## Implementation Details

### `autoUpdater.ts` edits

1. Import the classifier and types (the `src/utils/*` orchestration layer may import from features):
```typescript
import { selectLatestForChannel } from '@/features/updates/services/releaseTrack';
import type { UpdateChannel, GitHubRelease } from '@/features/updates/services/types';
```

2. Widen `getUpdateChannel` (`:133-136`):
```typescript
private getUpdateChannel(): UpdateChannel {
    return vscode.workspace.getConfiguration('demoBuilder')
        .get<UpdateChannel>('updateChannel', 'stable');
}
```

3. In `checkForUpdates` (`:47-131`), compute an effective channel and collapse EA→beta (no gate here):
```typescript
const configured = this.getUpdateChannel();
// Background path has no collaborator gate/token; never serve alpha silently.
const channel: UpdateChannel = configured === 'early-access' ? 'beta' : configured;
```
(Single non-nested ternary.)

4. URL selection (`:62-64`) keyed on the effective `channel`:
```typescript
const url = channel === 'stable'
    ? `https://api.github.com/repos/${this.REPO}/releases/latest`
    : `https://api.github.com/repos/${this.REPO}/releases?per_page=20`;
```

5. Replace the array branch (`:74-87`) with the classifier:
```typescript
let release = response.data;
if (channel !== 'stable' && Array.isArray(response.data)) {
    const selected = selectLatestForChannel(response.data as GitHubRelease[], channel);
    if (!selected) {
        this.logger.debug('[Updates] No releases found for channel');
        return undefined;
    }
    release = selected;
}
```
This deletes the inline `.filter(!draft).sort(semver.gt)` (`:77-86`). `semver` import (`:5`) remains used by `semver.gt(latestVersion, currentVersion)` (`:93`).

> Note: the axios `release` objects share the `GitHubRelease` shape (`tag_name`, `draft`, `assets`, `body`), so `selectLatestForChannel` works directly.

### REFACTOR
- Confirm no dead imports; no nested ternaries.

---

## Acceptance Criteria
- [ ] Background checker never selects alpha for any channel (EA collapses to beta)
- [ ] beta excludes alpha in the background path too
- [ ] stable path unchanged; graceful "no release → undefined" preserved
- [ ] Tests green

**Estimated Time:** 2-3 hours

---

## Post-Plan Notes / flags for TDD start

- **`buildGitHubHeaders` key mismatch is intentional** (gate-only decision): we do NOT change the shared `'githubToken'` read (`githubApiClient.ts:54`); the gate uses its own EDS-token read. Raising rate limits by authenticating all update calls is a deferred follow-up.
- **Component checks under EA** collapse to beta (Step 2) to avoid silently skipping component updates.
- `validateGitHubDownloadURL` continues to gate alpha downloads unchanged (`updateManager.ts:226`, `extensionUpdater.ts:66-73`).
