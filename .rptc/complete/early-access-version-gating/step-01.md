# Step 1: `releaseTrack` Classifier Helper (pure, no I/O)

**Purpose:** Create a small pure helper that classifies a release tag into a track (`stable` | `beta` | `early-access` | `other`) by its semver prerelease identifier, and selects the highest release matching a given channel. This is the foundation that fixes the "newest prerelease wins" bug.

**Prerequisites:**
- [x] Research read in full
- [x] `updateManager.ts:187-204` (current array sort) understood
- [x] `semver` is already a dependency (`updateManager.ts:2`, `githubApiClient.ts:13`)

---

## Tests to Write First

### Unit Tests: `tests/features/updates/services/releaseTrack.test.ts`

Pure module — no `vscode` or timeout mocks needed.

#### Test Group 1: `classifyTrack(tag)`
- [ ] `'v2.0.0'` → `'stable'`
- [ ] `'2.0.0'` (no `v`) → `'stable'`
- [ ] `'v1.8.0-beta.2'` → `'beta'`
- [ ] `'v2.0.0-alpha.1'` → `'early-access'`
- [ ] `'v2.0.0-rc.1'` → `'other'` (prerelease, but neither beta nor alpha; accepted by NO channel)
- [ ] `'invalid-version'` → `'other'` (does not throw)

#### Test Group 2: `channelAcceptsTrack(channel, track)`
- [ ] `stable` accepts `stable` only (rejects `beta`, `early-access`, `other`)
- [ ] `beta` accepts `stable` and `beta` (rejects `early-access` and `other`) — **bug fix: beta MUST reject `early-access`/alpha**
- [ ] `early-access` accepts `early-access` only (rejects `stable`, `beta`, `other`)

#### Test Group 3: `selectLatestForChannel(releases, channel)`
- [ ] Given final `1.1.0`, beta `1.2.0-beta.1`, alpha `2.0.0-alpha.1`:
  - `stable` → picks `1.1.0`
  - `beta` → picks `1.2.0-beta.1` (NOT the higher-semver alpha) — **core bug-fix assertion**
  - `early-access` → picks `2.0.0-alpha.1`
- [ ] Multiple alphas `2.0.0-alpha.1`, `2.0.0-alpha.5` for `early-access` → picks `2.0.0-alpha.5`
- [ ] Drafts excluded (`draft: true` never selected) for every channel
- [ ] No matching release for channel → returns `null` (e.g. `early-access` with only finals)
- [ ] Empty array → `null`

---

## Files to Create/Modify
- [ ] `src/features/updates/services/types.ts` — add `UpdateChannel` type (one line; consumed broadly in Step 2)
- [ ] `src/features/updates/services/releaseTrack.ts` (new)
- [ ] `tests/features/updates/services/releaseTrack.test.ts` (new)

---

## Implementation Details

### First, add the type to `src/features/updates/services/types.ts`
```typescript
/** Extension/component update channel. */
export type UpdateChannel = 'stable' | 'beta' | 'early-access';
```

### GREEN Phase — `src/features/updates/services/releaseTrack.ts`
```typescript
import * as semver from 'semver';
import type { GitHubRelease, UpdateChannel } from './types';

/** A release's track, derived from its semver prerelease identifier. */
export type ReleaseTrack = 'stable' | 'beta' | 'early-access' | 'other';

/** Strip a leading 'v' (mirrors UpdateManager.parseVersionFromTag at updateManager.ts:285). */
function cleanTag(tagName: string): string {
    return tagName.replace(/^v/, '');
}

/**
 * Classify a tag into a track by its first semver prerelease identifier.
 * - no prerelease               -> 'stable'
 * - 'beta' id                   -> 'beta'
 * - 'alpha' id                  -> 'early-access'
 * - anything else / unparseable -> 'other' (accepted by NO channel)
 */
export function classifyTrack(tagName: string): ReleaseTrack {
    const parsed = semver.parse(cleanTag(tagName));
    if (!parsed) return 'other';
    if (parsed.prerelease.length === 0) return 'stable';
    const id = String(parsed.prerelease[0]);
    if (id === 'beta') return 'beta';
    if (id === 'alpha') return 'early-access';
    return 'other';
}

/** Which tracks a channel will install. NOTE: beta intentionally EXCLUDES early-access. */
export function channelAcceptsTrack(channel: UpdateChannel, track: ReleaseTrack): boolean {
    if (channel === 'stable') return track === 'stable';
    if (channel === 'beta') return track === 'stable' || track === 'beta';
    // early-access
    return track === 'early-access';
}

/**
 * Pick the highest-semver, non-draft release that the channel accepts.
 * Returns null when nothing matches (graceful: caller treats as "no update").
 */
export function selectLatestForChannel(
    releases: GitHubRelease[],
    channel: UpdateChannel,
): GitHubRelease | null {
    const eligible = releases.filter((r) => {
        if (r.draft) return false;
        return channelAcceptsTrack(channel, classifyTrack(r.tag_name));
    });
    if (eligible.length === 0) return null;

    eligible.sort((a, b) => {
        const va = cleanTag(a.tag_name);
        const vb = cleanTag(b.tag_name);
        if (semver.gt(va, vb)) return -1;
        if (semver.lt(va, vb)) return 1;
        return 0;
    });
    return eligible[0];
}
```

### REFACTOR
- Ensure no nested ternaries (early returns). Confirm `classifyTrack` never throws.

---

## Acceptance Criteria
- [ ] All Step 1 tests passing
- [ ] `beta` channel selects beta over a higher-semver alpha (bug-fix assertion green)
- [ ] `classifyTrack` returns `'other'` for `rc`/garbage and never throws
- [ ] 100% coverage for `releaseTrack.ts`
- [ ] No magic numbers, no nested ternaries, no console/debug code

**Estimated Time:** 2-3 hours
