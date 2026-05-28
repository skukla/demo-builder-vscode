# Step 3: Add Subdirectory Extraction to ComponentUpdater

## Purpose

Modify `downloadAndExtract()` to accept an optional `subdirectory` parameter. When provided, extract only the specified subdirectory from the monorepo archive instead of the entire archive. Integrate with UpdateManager to pass subdirectory info from component config.

## Prerequisites

- [ ] Step 1 complete (ComponentRepoConfig with `subdirectory` field and getRepoConfig() helper)
- [ ] Step 2 complete (fetchLatestRelease with tagPrefix filtering, integration chain working)

**Integration Context:**
- Step 1 provides `getRepoConfig()` to normalize component config
- Step 2 provides tag prefix filtering in release fetching
- Step 3 integrates subdirectory extraction with the config flow
- Final chain: config → tag filtering → subdirectory extraction

## Tests to Write First (RED Phase)

### Test File: `tests/features/updates/services/componentUpdater-subdirectory.test.ts`

#### Test 1: downloadAndExtract extracts entire archive when no subdirectory specified (backward compat)
- **Purpose**: Verify backward compatibility with existing behavior
- **Arrange**: Mock zip download, no subdirectory parameter
- **Act**: Call `updateComponent()` without subdirectory
- **Assert**: Shell command moves all contents from root folder: `mv targetPath/*/* targetPath/`

#### Test 2: downloadAndExtract extracts only subdirectory when specified
- **Purpose**: Verify subdirectory extraction isolates component
- **Arrange**: Mock zip download, subdirectory = `packages/backend`
- **Act**: Call `updateComponent()` with subdirectory
- **Assert**: Shell command moves only subdirectory contents: `mv targetPath/*/packages/backend/* targetPath/`

#### Test 3: downloadAndExtract handles nested subdirectory paths
- **Purpose**: Verify deeply nested paths work correctly
- **Arrange**: Mock zip download, subdirectory = `apps/commerce/backend`
- **Act**: Call `updateComponent()` with nested subdirectory
- **Assert**: Shell command correctly references nested path

#### Test 4: updateComponent receives subdirectory from UpdateManager config
- **Purpose**: Verify integration between UpdateManager and ComponentUpdater
- **Arrange**: Component config with `subdirectory: 'packages/backend'`
- **Act**: UpdateManager calls ComponentUpdater.updateComponent()
- **Assert**: ComponentUpdater receives subdirectory parameter

#### Test 5: End-to-end monorepo update flow (NEW - for integration testing)
- **Purpose**: Verify complete flow from config → tag filtering → subdirectory extraction
- **Arrange**:
  - Component `backend` configured with `tagPrefix: 'backend@'`, `subdirectory: 'packages/backend'`
  - Mock GitHub releases with mixed tags: `v1.0.0`, `backend@2.0.0`, `backend@3.0.0`
- **Act**: Call `checkComponentUpdates('backend')` with mocked download/extract
- **Assert**:
  - Only `backend@*` tags considered
  - Version extracted as `3.0.0` (from `backend@3.0.0`)
  - ComponentUpdater called with subdirectory `packages/backend`
  - Extraction command includes subdirectory path

## Files to Create/Modify

### `tests/features/updates/services/componentUpdater-subdirectory.test.ts`
**Action**: Create
**Changes**:
- New test file for subdirectory extraction functionality
- Follow existing test patterns from `componentUpdater.test.ts`

### `src/features/updates/services/componentUpdater.ts`
**Action**: Modify
**Changes**:
- Update `downloadAndExtract()` signature to accept optional `subdirectory` parameter (line 291)
- Modify extraction command to handle subdirectory case (lines 340-347)
- Update `updateComponent()` signature to accept optional `subdirectory` parameter (line 32)

### `src/features/updates/services/updateManager.ts`
**Action**: Modify
**Changes**:
- Update `checkComponentUpdates()` to extract and pass subdirectory from config
  - Search for: `checkComponentUpdates(componentId: string)` method
  - After getting config via `getRepoConfig()`, pass `config?.subdirectory` to `updateComponent()` call
  - Also used: Integration with Step 2's tagPrefix filtering

### `src/features/updates/types.ts` (or where ReleaseInfo is defined)
**Action**: Modify (if not already done)
**Changes**:
- Verify/add `subdirectory?: string` field to `ReleaseInfo` interface
- This field optional (not all components have subdirectories)

## Implementation Details (GREEN Phase)

### 1. Update updateComponent Method Signature

Search for: `async updateComponent(project: Project, componentId: string,`

Replace signature with:
```typescript
async updateComponent(
    project: Project,
    componentId: string,
    downloadUrl: string,
    newVersion: string,
    subdirectory?: string,
): Promise<void> {
```

### 2. Pass Subdirectory to downloadAndExtract

In the `updateComponent()` method, find the call to `downloadAndExtract()` and update:

```typescript
// 4. Download and extract new version
await this.downloadAndExtract(downloadUrl, component.path, componentId, subdirectory);
```

### 3. Update downloadAndExtract Signature

Search for: `private async downloadAndExtract(`

Update signature:
```typescript
private async downloadAndExtract(
    downloadUrl: string,
    targetPath: string,
    componentId: string,
    subdirectory?: string,
): Promise<void> {
```

### 4. Modify Extraction Command

Search for the extraction command section (look for `mv` or `unzip` commands)

```typescript
// GitHub archives have a root folder (e.g., "owner-repo-abc123/")
// For subdirectory extraction, we need to move only the subdirectory contents
const moveCommand = subdirectory
    ? `mv "${targetPath}"/*/${subdirectory}/* "${targetPath}"/`
    : `mv "${targetPath}"/*/* "${targetPath}"/`;

await commandManager.execute(
    `unzip -q "${tempZip}" -d "${targetPath}" && ${moveCommand} && rm -rf "${targetPath}"/*/`,
    {
        shell: DEFAULT_SHELL,
        timeout: TIMEOUTS.UPDATE_EXTRACT,
        enhancePath: true,
    },
);
```

### 5. Update ReleaseInfo Type

Search for: `export interface ReleaseInfo` (in types.ts or same file as defined)

Ensure it includes optional subdirectory field:
```typescript
export interface ReleaseInfo {
    version: string;
    downloadUrl: string;
    releaseNotes: string;
    publishedAt: string;
    isPrerelease: boolean;
    subdirectory?: string; // For monorepo components (NEW)
}
```

### 6. Pass Subdirectory from UpdateManager

Search for: `checkComponentUpdates(componentId: string)` method

In the release result building section, after fetching release:
```typescript
// After fetching release from fetchLatestRelease()
const config = this.getRepoConfig(componentId);  // From Step 1
results.set(componentId, {
    hasUpdate,
    current: currentVersion,
    latest: latestRelease.version,
    releaseInfo: hasUpdate ? {
        ...latestRelease,
        subdirectory: config?.subdirectory,  // NEW: Pass subdirectory from config
    } : undefined,
});
```

## Refactoring Notes (REFACTOR Phase)

- Changed `rmdir` to `rm -rf` for cleanup - handles non-empty directories if subdirectory extraction leaves siblings
- Keep backward compatibility - subdirectory is optional throughout chain
- Consider adding validation that subdirectory exists in archive before extraction (future enhancement)

**Complete Integration Chain (All 3 Steps):**
```
Component Update Flow:
├─ COMPONENT_REPOS config (Step 1)
│  ├─ repo: 'owner/repo'
│  ├─ tagPrefix?: 'component@'
│  └─ subdirectory?: 'packages/component'
│
├─ Step 1: getRepoConfig(componentId) normalizes config
│
├─ Step 2: checkComponentUpdates() flow
│  ├─ const config = getRepoConfig(componentId)
│  ├─ fetchLatestRelease(repo, channel, config?.tagPrefix)
│  │  └─ Filters releases by tagPrefix
│  │  └─ parseVersionFromTag(tag, config?.tagPrefix) strips prefixes
│  └─ Returns ReleaseInfo { version, downloadUrl, subdirectory?, ... }
│
└─ Step 3: updateComponent() integration
   ├─ Receives subdirectory from ReleaseInfo
   ├─ downloadAndExtract(url, path, componentId, subdirectory)
   │  └─ For monorepo: moves only subdirectory contents
   │  └─ For standard: moves all contents
   └─ Completes isolated component update
```

## Expected Outcome

- [ ] `downloadAndExtract()` accepts optional `subdirectory` parameter
- [ ] Standard components (no subdirectory) extract entire archive as before
- [ ] Monorepo components extract only the specified subdirectory
- [ ] UpdateManager passes subdirectory from config to ComponentUpdater
- [ ] All existing component update tests continue passing
- [ ] New subdirectory extraction tests pass

## Acceptance Criteria

- [ ] TypeScript compiles without errors
- [ ] `updateComponent()` without subdirectory works unchanged (backward compat)
- [ ] `updateComponent()` with subdirectory extracts only that directory
- [ ] Nested subdirectory paths work correctly (e.g., `packages/backend`)
- [ ] ReleaseInfo includes subdirectory when available
- [ ] All tests pass: `npm run test:watch -- tests/features/updates/services`
- [ ] Integration: UpdateManager -> ComponentUpdater -> subdirectory extraction works end-to-end
