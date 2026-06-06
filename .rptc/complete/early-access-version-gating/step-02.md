# Step 2: Channel Type Widening + Per-Channel Filtering in `fetchLatestRelease`

**Purpose:** Replace the "newest prerelease wins" logic (`updateManager.ts:191-201`) with the Step 1 classifier, and widen the channel type from `'stable' | 'beta'` to `UpdateChannel` throughout `updateManager.ts`. After this step, beta users can no longer be pulled onto `-alpha.*`.

**Prerequisites:**
- [x] Step 1 green (`releaseTrack.ts` + `UpdateChannel` in `types.ts`)

---

## Tests to Write First

### Modify: `tests/features/updates/services/updateManager-channels.test.ts`
Add a new `describe('per-channel prerelease filtering')` block, reusing the existing mocks at the top of the file.

- [ ] **beta EXCLUDES alpha:** config `'beta'`; fetch array `[ '2.0.0-alpha.1' (prerelease,nondraft), '1.2.0-beta.1' (prerelease,nondraft), '1.1.0' (final) ]`; assert `result.latest === '1.2.0-beta.1'` (NOT the alpha). Central regression guard.
- [ ] **early-access picks alpha (Step-2 ungated path):** config `'early-access'`; same array; assert `result.latest === '2.0.0-alpha.1'`. NOTE: in Step 2, `checkExtensionUpdate` passes the configured channel straight to `fetchLatestRelease` (gate added in Step 5), so this is valid here and will be re-pointed into the gated test in Step 5.
- [ ] **early-access with only finals → no update:** config `'early-access'`; finals only; assert `result.hasUpdate === false`.
- [ ] **stable still uses `/releases/latest`** (existing test stays green).
- [ ] **draft filtering still works** (existing test stays green).

### Must remain green
- All of `updateManager-checking.test.ts` (stable single-object path untouched).

---

## Files to Create/Modify
- [ ] `src/features/updates/services/types.ts` — confirm `UpdateChannel` present (from Step 1)
- [ ] `src/features/updates/services/updateManager.ts` — widen types + use classifier

---

## Implementation Details

### `updateManager.ts` edits

1. Import the classifier and type (replace the existing `import type { ReleaseInfo, ... }` at `:10`):
```typescript
import { selectLatestForChannel } from './releaseTrack';
import type { ReleaseInfo, UpdateCheckResult, GitHubRelease, GitHubReleaseAsset, UpdateChannel } from './types';
```

2. Widen `fetchLatestRelease` signature (`:161`):
```typescript
private async fetchLatestRelease(repo: string, channel: UpdateChannel): Promise<ReleaseInfo | null> {
```

3. URL selection (`:165-167`) — keep as-is; `!== 'stable'` already covers the new channel:
```typescript
const url = channel === 'stable'
    ? `${GITHUB_API_BASE}/repos/${repo}/releases/latest`
    : `${GITHUB_API_BASE}/repos/${repo}/releases?per_page=20`;
```

4. Replace the array branch (`:190-204`) with the classifier:
```typescript
let release: GitHubRelease;
if (Array.isArray(data)) {
    const selected = selectLatestForChannel(data, channel);
    if (!selected) return null;
    release = selected;
} else {
    release = data;
}
```
This deletes the inline `.filter(!draft).sort(semver.gt)` (`:191-201`). `parseVersionFromTag` is still used at `:231`; keep it. Top-level `import * as semver` (`:2`) is still used by `isNewerVersion` (`:276`); keep it.

5. Keep the security block intact (`:225-229`) — `validateGitHubDownloadURL` still runs for alpha builds. No change.

6. Widen `getUpdateChannel` (`:268-271`):
```typescript
private getUpdateChannel(): UpdateChannel {
    return vscode.workspace.getConfiguration('demoBuilder')
        .get<UpdateChannel>('updateChannel', 'stable');
}
```

7. `checkAllProjectsForUpdates` (`:79-154`): components ship no `-alpha.*` builds, so collapse EA→beta for component checks to avoid silently skipping component updates when a user is on `early-access`. Before the `fetchLatestRelease(repoInfo.repository, ...)` call at `:132`:
```typescript
// Components ship no -alpha.* builds; EA collapses to beta for component checks.
const componentChannel: UpdateChannel = channel === 'early-access' ? 'beta' : channel;
```
Use `componentChannel` in that call. (Single non-nested ternary, allowed.)

### REFACTOR
- Confirm no dead imports remain (`semver` stays — used by `isNewerVersion`).

---

## Acceptance Criteria
- [ ] beta no longer selects alpha (regression test green)
- [ ] early-access selects highest alpha; returns no-update when no alpha exists
- [ ] stable path unchanged; all existing channel + checking tests green
- [ ] `UpdateChannel` used throughout `updateManager.ts`
- [ ] Component update checks collapse EA→beta (no silent skipping)
- [ ] No nested ternaries, no magic timeouts

**Estimated Time:** 3-4 hours
