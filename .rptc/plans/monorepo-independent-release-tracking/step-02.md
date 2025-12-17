# Step 2: Implement Tag Prefix Filtering in fetchLatestRelease()

## Purpose

Modify `fetchLatestRelease()` to accept an optional `tagPrefix` parameter and filter releases accordingly. Update `parseVersionFromTag()` to strip both `v` prefix and component-specific prefixes (e.g., `backend@1.0.0` -> `1.0.0`).

## Prerequisites

- [ ] Step 1 complete (ComponentRepoConfig interface and getRepoConfig() helper available)
- [ ] Existing `updateManager-channels.test.ts` tests passing

**Integration Note:** Step 1 creates `getRepoConfig()` helper. Step 2 will call this helper to extract `tagPrefix` when fetching releases for components with prefix-based tags.

## Tests to Write First (RED Phase)

### Test File: `tests/features/updates/services/updateManager-tagPrefix.test.ts`

#### Test 1: parseVersionFromTag handles standard v prefix (backward compat)
- **Purpose**: Verify backward compatibility with existing tag format
- **Arrange**: Tag `v1.0.0`
- **Act**: Call `parseVersionFromTag('v1.0.0')`
- **Assert**: Returns `1.0.0`

#### Test 2: parseVersionFromTag handles component prefix
- **Purpose**: Verify new tag prefix format works correctly
- **Arrange**: Tag `backend@1.0.0`, prefix `backend@`
- **Act**: Call `parseVersionFromTag('backend@1.0.0', 'backend@')`
- **Assert**: Returns `1.0.0`

#### Test 3: parseVersionFromTag handles component prefix with v
- **Purpose**: Verify edge case `backend@v1.0.0` format
- **Arrange**: Tag `backend@v1.0.0`, prefix `backend@`
- **Act**: Call `parseVersionFromTag('backend@v1.0.0', 'backend@')`
- **Assert**: Returns `1.0.0`

#### Test 4: fetchLatestRelease filters by tag prefix
- **Purpose**: Verify only matching tags are considered
- **Arrange**: Mock releases with mixed tags (`v1.0.0`, `backend@2.0.0`, `optimizer@3.0.0`)
- **Act**: Call `fetchLatestRelease(repo, channel, 'backend@')`
- **Assert**: Returns version `2.0.0` (from `backend@2.0.0`)

#### Test 5: fetchLatestRelease returns null when no tags match prefix
- **Purpose**: Verify graceful handling when no matching releases
- **Arrange**: Mock releases with tags `v1.0.0`, `v2.0.0` (no prefix)
- **Act**: Call `fetchLatestRelease(repo, channel, 'backend@')`
- **Assert**: Returns `null`

#### Test 6: fetchLatestRelease without prefix works unchanged (backward compat)
- **Purpose**: Verify backward compatibility for repos without tagPrefix
- **Arrange**: Mock releases with standard `v1.0.0` tags
- **Act**: Call `fetchLatestRelease(repo, channel)` (no prefix)
- **Assert**: Returns highest version as before

## Files to Create/Modify

### `tests/features/updates/services/updateManager-tagPrefix.test.ts`
**Action**: Create
**Changes**:
- New test file for tag prefix functionality
- Follow existing test patterns from `updateManager-channels.test.ts`
- Use shared test utilities from `updateManager.testUtils.ts`

### `src/features/updates/services/updateManager.ts`
**Action**: Modify
**Changes**:
- Update `parseVersionFromTag()` signature to accept optional `tagPrefix` parameter
  - Search for method: `private parseVersionFromTag` (currently around line 393, may shift after Step 1)
  - Update signature and implementation
- Update `fetchLatestRelease()` signature to accept optional `tagPrefix` parameter
  - Search for method: `private async fetchLatestRelease` (currently around line 273, may shift after Step 1)
  - Update signature and add tag filtering logic
- Update callers of `parseVersionFromTag()` in sort/comparison operations to pass prefix when available
- Add integration point: When `checkComponentUpdates()` calls `fetchLatestRelease()`, pass `tagPrefix` from `getRepoConfig()` (implemented in Step 1)

## Implementation Details (GREEN Phase)

### 1. Update parseVersionFromTag Method

Search for: `private parseVersionFromTag(tagName: string`

```typescript
/**
 * Extract version string from Git tag
 * Strips leading prefix (component@) and 'v' prefix
 *
 * Examples:
 *   v1.0.0 -> 1.0.0
 *   backend@1.0.0 -> 1.0.0
 *   backend@v1.0.0 -> 1.0.0
 */
private parseVersionFromTag(tagName: string, tagPrefix?: string): string {
    let version = tagName;

    // Strip component prefix if provided (e.g., "backend@")
    if (tagPrefix && version.startsWith(tagPrefix)) {
        version = version.slice(tagPrefix.length);
    }

    // Strip leading 'v' if present
    return version.replace(/^v/, '');
}
```

### 2. Update fetchLatestRelease Method Signature

Search for: `private async fetchLatestRelease(`

Update signature to:
```typescript
private async fetchLatestRelease(
    repo: string,
    channel: 'stable' | 'beta',
    tagPrefix?: string
): Promise<ReleaseInfo | null> {
```

### 3. Add Tag Prefix Filtering

In the `fetchLatestRelease()` method, after filtering for draft releases (look for `nonDraftReleases`)

```typescript
// Filter by tag prefix if provided (for monorepo components)
let filteredReleases = nonDraftReleases;
if (tagPrefix) {
    filteredReleases = nonDraftReleases.filter(
        (r: GitHubRelease) => r.tag_name.startsWith(tagPrefix)
    );
    if (filteredReleases.length === 0) {
        this.logger.debug(`[Updates] No releases found matching prefix ${tagPrefix} for ${repo}`);
        return null;
    }
}

// Sort by version using semver
release = filteredReleases.sort((a: GitHubRelease, b: GitHubRelease) => {
    const versionA = this.parseVersionFromTag(a.tag_name, tagPrefix);
    const versionB = this.parseVersionFromTag(b.tag_name, tagPrefix);
    return semver.gt(versionA, versionB) ? -1 : 1;
})[0];
```

### 4. Update parseVersionFromTag Calls

Search for all calls to `this.parseVersionFromTag(` in the `fetchLatestRelease()` method

Add `tagPrefix` parameter to the call (usually used in version comparison/sorting):
```typescript
const version = this.parseVersionFromTag(release.tag_name, tagPrefix);
```

## Refactoring Notes (REFACTOR Phase)

- Keep method signature backward compatible (tagPrefix is optional)
- Update `checkComponentUpdates()` call site to pass `tagPrefix` from `getRepoConfig(componentId).tagPrefix`
- Update version comparison in sort to pass `tagPrefix` to `parseVersionFromTag()`
- Consider extracting tag filtering to separate helper if complexity grows

**Integration Chain:**
```
checkComponentUpdates(componentId)
  → const config = getRepoConfig(componentId)  [Step 1]
  → fetchLatestRelease(repo, channel, config?.tagPrefix)  [Step 2]
  → parseVersionFromTag(tag, config?.tagPrefix)  [Step 2]
  → returns version string stripped of prefixes
```

## Expected Outcome

- [ ] `parseVersionFromTag()` correctly strips component prefixes and v prefix
- [ ] `fetchLatestRelease()` filters releases by tag prefix when provided
- [ ] `fetchLatestRelease()` returns null when no releases match prefix
- [ ] All existing tests continue to pass (backward compatible)
- [ ] New tag prefix tests pass

## Acceptance Criteria

- [ ] TypeScript compiles without errors
- [ ] `parseVersionFromTag('v1.0.0')` returns `1.0.0` (backward compat)
- [ ] `parseVersionFromTag('backend@1.0.0', 'backend@')` returns `1.0.0`
- [ ] `parseVersionFromTag('backend@v1.0.0', 'backend@')` returns `1.0.0`
- [ ] `fetchLatestRelease()` filters by prefix when provided
- [ ] `fetchLatestRelease()` ignores prefix when not provided
- [ ] All tests pass: `npm run test:watch -- tests/features/updates/services`
