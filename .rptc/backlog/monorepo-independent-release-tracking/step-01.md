# Step 1: Extend COMPONENT_REPOS with Tag Prefix Support

## Purpose

Add `tagPrefix` and `subdirectory` fields to `COMPONENT_REPOS` configuration to enable components in a monorepo to have independent release tracking via tag prefixes (e.g., `component-a@1.0.0` vs `component-b@2.0.0`).

## Prerequisites

- [ ] Overview.md reviewed and understood
- [ ] Existing `updateManager.ts` code reviewed (lines 37-42)

## Tests to Write First (RED Phase)

### Test File: `tests/features/updates/services/updateManager-repoConfig.test.ts`

#### Test 1: getRepoConfig returns normalized config for string entry
- **Purpose**: Verify backward compatibility - string entries normalize to full config
- **Arrange**: Access `COMPONENT_REPOS` entry that is a plain string
- **Act**: Call `getRepoConfig('citisignal-nextjs')`
- **Assert**: Returns `{ repo: 'skukla/citisignal-nextjs', tagPrefix: undefined, subdirectory: undefined }`

#### Test 2: getRepoConfig returns full config for object entry
- **Purpose**: Verify new config format works correctly
- **Arrange**: `COMPONENT_REPOS` entry with `tagPrefix` and `subdirectory`
- **Act**: Call `getRepoConfig('component-with-prefix')`
- **Assert**: Returns full config with all fields

#### Test 3: getRepoConfig returns undefined for unknown component
- **Purpose**: Verify graceful handling of missing entries
- **Arrange**: Component ID not in `COMPONENT_REPOS`
- **Act**: Call `getRepoConfig('unknown-component')`
- **Assert**: Returns `undefined`

#### Test 4: ComponentRepoConfig type supports all fields
- **Purpose**: Verify TypeScript interface is correct
- **Arrange**: Create object matching `ComponentRepoConfig` interface
- **Act**: Assign to variable with explicit type
- **Assert**: No TypeScript errors, all fields accessible

## Files to Create/Modify

### `src/features/updates/services/updateManager.ts`
**Action**: Modify
**Changes**:
- Add `ComponentRepoConfig` interface (lines ~32-36)
- Update `COMPONENT_REPOS` type to `Record<string, string | ComponentRepoConfig>` (line 37)
- Add `getRepoConfig()` helper method (after constructor, ~line 48)

## Implementation Details (GREEN Phase)

### 1. Add ComponentRepoConfig Interface

```typescript
/**
 * Configuration for a component repository
 * Supports monorepo components with tag prefixes
 */
interface ComponentRepoConfig {
    /** GitHub repo path (e.g., 'owner/repo') */
    repo: string;
    /** Tag prefix for filtering releases (e.g., 'component-name@') */
    tagPrefix?: string;
    /** Subdirectory within repo (for monorepo components) */
    subdirectory?: string;
}
```

### 2. Update COMPONENT_REPOS Type

```typescript
private readonly COMPONENT_REPOS: Record<string, string | ComponentRepoConfig> = {
    'citisignal-nextjs': 'skukla/citisignal-nextjs',
    'commerce-mesh': 'skukla/commerce-mesh',
    'integration-service': 'skukla/kukla-integration-service',
    'demo-inspector': 'skukla/demo-inspector',
};
```

### 3. Add getRepoConfig Helper

```typescript
/**
 * Get normalized repository configuration for a component
 * Handles both string (legacy) and object (new) formats
 */
private getRepoConfig(componentId: string): { repo: string; tagPrefix?: string; subdirectory?: string } | undefined {
    const entry = this.COMPONENT_REPOS[componentId];
    if (!entry) return undefined;

    if (typeof entry === 'string') {
        return { repo: entry };
    }
    return entry;
}
```

## Refactoring Notes (REFACTOR Phase)

- Keep existing `COMPONENT_REPOS` entries as strings (backward compatible)
- No changes to existing method signatures - `getRepoConfig` is internal helper
- Future steps will update callers to use `getRepoConfig()` instead of direct access

**How Steps 2 & 3 Use This Helper:**
- **Step 2:** `checkComponentUpdates()` calls `getRepoConfig()` to extract `tagPrefix` → passes to `fetchLatestRelease()`
- **Step 3:** `checkComponentUpdates()` calls `getRepoConfig()` to extract `subdirectory` → passes to `updateComponent()` call

## Expected Outcome

- [ ] New `ComponentRepoConfig` interface defined
- [ ] `COMPONENT_REPOS` type updated to support both formats
- [ ] `getRepoConfig()` helper normalizes access to config
- [ ] All existing tests still pass (backward compatible)
- [ ] New tests for `getRepoConfig()` pass

## Acceptance Criteria

- [ ] TypeScript compiles without errors
- [ ] `getRepoConfig()` returns normalized config for string entries
- [ ] `getRepoConfig()` returns full config for object entries
- [ ] `getRepoConfig()` returns undefined for unknown components
- [ ] Existing `checkComponentUpdates` and `checkAllProjectsForUpdates` still work
- [ ] All tests pass: `npm run test:watch -- tests/features/updates/services`
