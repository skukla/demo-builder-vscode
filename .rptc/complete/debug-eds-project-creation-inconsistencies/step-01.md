# Step 1: Add GitHub Repository Listing Logs

## Purpose

Add strategic logging to `listUserRepositories()` in `githubRepoOperations.ts` to understand why newly created repositories might not appear in the repository selection list.

## Prerequisites

None (first step).

## Implementation Details

**File**: `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/src/features/eds/services/githubRepoOperations.ts`

Add logging at these locations in `listUserRepositories()` (lines 224-279):

### 1. After each API response (line 239, after `response.data`)

```typescript
const repos = response.data;
this.logger.debug(`[GitHub:ListRepos] Page ${page}: received ${repos.length} repos`);
```

### 2. After permission filtering (line 256, after `mappedRepos` creation)

```typescript
const filteredOut = repos.length - mappedRepos.length;
if (filteredOut > 0) {
    this.logger.debug(`[GitHub:ListRepos] Page ${page}: filtered out ${filteredOut} repos (no push access)`);
}
```

### 3. Before returning final list (line 274, before `return allRepos`)

```typescript
this.logger.debug(`[GitHub:ListRepos] Total repos returned: ${allRepos.length}`);
```

### 4. In catch block (line 276, enhance existing error log)

```typescript
this.logger.error('[GitHub:ListRepos] Failed to list repositories', error as Error);
this.logger.debug(`[GitHub:ListRepos] Error details: ${JSON.stringify((error as any).response?.data || {})}`);
```

## Expected Outcome

Debug output channel should show:
- Per-page fetch counts
- Number of repos filtered by permissions
- Total repos returned to UI
- Any API error details if fetch fails

## Acceptance Criteria

- [ ] Page-level logging shows repos received per API call
- [ ] Permission filtering logs show how many repos excluded
- [ ] Final count logged before returning to UI
- [ ] Error details captured if API fails
- [ ] Logs use `[GitHub:ListRepos]` prefix for filtering
