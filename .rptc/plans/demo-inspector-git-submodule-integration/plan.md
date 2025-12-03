# Implementation Plan: Demo Inspector Git Submodule Integration

**Feature**: Integrate demo-inspector as a git submodule of citisignal-nextjs
**Research**: `.rptc/research/demo-inspector-git-submodule-integration/research.md`
**Created**: 2025-11-29
**Status**: Ready for PM Approval

---

## Summary

Demo inspector has been extracted from citisignal-nextjs into its own repository (`skukla/demo-inspector`) and is now referenced as a git submodule. This plan integrates submodule support into the extension's clone and update workflows.

**Approach**: Option B from research - demo-inspector as submodule of citisignal-nextjs with independent update tracking.

---

## Implementation Steps

### Step 1: Update citisignal-nextjs Component Definition

**File**: `templates/components.json`

**Changes**:
1. Add `recursive: true` to clone submodules
2. Change `shallow: false` to avoid "reference is not a tree" errors with submodules
3. Update dependencies to reflect demo-inspector is now included via submodule

**Before**:
```json
"citisignal-nextjs": {
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/citisignal-nextjs",
    "branch": "master",
    "gitOptions": {
      "shallow": true
    }
  },
  "dependencies": {
    "required": ["commerce-mesh"],
    "optional": ["demo-inspector"]
  }
}
```

**After**:
```json
"citisignal-nextjs": {
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/citisignal-nextjs",
    "branch": "master",
    "gitOptions": {
      "shallow": false,
      "recursive": true
    }
  },
  "dependencies": {
    "required": ["commerce-mesh"]
  },
  "submodules": {
    "demo-inspector": {
      "path": "packages/demo-inspector",
      "repository": "skukla/demo-inspector"
    }
  }
}
```

**Tests**:
- Unit test: Component definition parsing with submodules field
- Integration test: Git clone with `--recursive` generates correct command

---

### Step 2: Remove demo-inspector as Standalone Component

**File**: `templates/components.json`

**Changes**:
1. Remove demo-inspector from `components` section
2. Update `selectionGroups.dependencies` to remove demo-inspector

**Rationale**: Demo-inspector is no longer a selectable component - it comes automatically with citisignal-nextjs.

**Before**:
```json
"selectionGroups": {
  "dependencies": ["commerce-mesh", "demo-inspector"]
},
"components": {
  "demo-inspector": {
    "source": { "type": "npm", "package": "@adobe/demo-inspector" }
  }
}
```

**After**:
```json
"selectionGroups": {
  "dependencies": ["commerce-mesh"]
}
// demo-inspector component definition removed
```

**Tests**:
- Unit test: Component registry no longer includes demo-inspector
- Integration test: Project creation succeeds without demo-inspector selection

---

### Step 3: Add demo-inspector to Update System

**File**: `src/features/updates/services/updateManager.ts`

**Changes**:
1. Add demo-inspector to `COMPONENT_REPOS` mapping
2. Add submodule-aware update checking method

**Code**:
```typescript
private readonly COMPONENT_REPOS: Record<string, string> = {
    'citisignal-nextjs': 'skukla/citisignal-nextjs',
    'commerce-mesh': 'skukla/commerce-mesh',
    'integration-service': 'skukla/kukla-integration-service',
    'demo-inspector': 'skukla/demo-inspector',  // NEW
};

/**
 * Check for submodule updates within a parent component
 */
async checkSubmoduleUpdates(
    project: Project,
    parentComponentId: string
): Promise<Map<string, UpdateCheckResult>> {
    // Implementation in Step 4
}
```

**Tests**:
- Unit test: `COMPONENT_REPOS` includes demo-inspector
- Unit test: `checkSubmoduleUpdates` returns correct results

---

### Step 4: Implement Submodule Update Checking

**File**: `src/features/updates/services/updateManager.ts`

**Changes**: Add method to check submodule versions by reading git submodule status.

**Implementation**:
```typescript
/**
 * Check for updates to submodules within installed components
 * Uses git submodule status and compares against GitHub releases
 */
async checkSubmoduleUpdates(
    project: Project,
    parentComponentId: string
): Promise<Map<string, UpdateCheckResult>> {
    const results = new Map<string, UpdateCheckResult>();
    const channel = this.getUpdateChannel();

    // Get parent component definition
    const parentDef = await ComponentRegistry.getComponent(parentComponentId);
    if (!parentDef?.submodules) return results;

    // Get parent component path
    const parentPath = project.componentInstances?.[parentComponentId]?.path;
    if (!parentPath) return results;

    for (const [submoduleId, submoduleConfig] of Object.entries(parentDef.submodules)) {
        const repoPath = this.COMPONENT_REPOS[submoduleId];
        if (!repoPath) continue;

        // Get current submodule commit
        const submodulePath = path.join(parentPath, submoduleConfig.path);
        const currentCommit = await this.getGitCommit(submodulePath);

        // Fetch latest release
        const latestRelease = await this.fetchLatestRelease(repoPath, channel);

        if (!latestRelease) {
            results.set(submoduleId, {
                hasUpdate: false,
                current: currentCommit?.substring(0, 8) || 'unknown',
                latest: 'unknown'
            });
            continue;
        }

        // Compare versions (tag vs commit)
        const hasUpdate = currentCommit !== await this.getTagCommit(repoPath, latestRelease.version);

        results.set(submoduleId, {
            hasUpdate,
            current: currentCommit?.substring(0, 8) || 'unknown',
            latest: latestRelease.version,
            releaseInfo: hasUpdate ? latestRelease : undefined
        });
    }

    return results;
}

private async getGitCommit(repoPath: string): Promise<string | null> {
    try {
        const executor = ServiceLocator.getCommandExecutor();
        const result = await executor.execute('git rev-parse HEAD', {
            cwd: repoPath,
            shell: DEFAULT_SHELL
        });
        return result.code === 0 ? result.stdout.trim() : null;
    } catch {
        return null;
    }
}
```

**Tests**:
- Unit test: `checkSubmoduleUpdates` detects available updates
- Unit test: `checkSubmoduleUpdates` handles missing submodule path
- Unit test: `getGitCommit` returns commit hash
- Integration test: Full update check flow with submodules

---

### Step 5: Add Logging for Submodule Operations

**Files**:
- `src/features/components/services/componentManager.ts`
- `src/features/updates/services/updateManager.ts`

**Changes**: Add debug logging for submodule-related operations.

**ComponentManager logging** (during clone):
```typescript
// After successful clone with --recursive
if (componentDef.source.gitOptions?.recursive) {
    this.logger.debug(`[ComponentManager] Submodules initialized for ${componentDef.name}`);
}
```

**UpdateManager logging** (during update check):
```typescript
// During submodule update check
this.logger.debug(`[Updates] Checking submodule ${submoduleId}: current=${currentCommit?.substring(0, 8)}`);

// When update available
this.logger.debug(`[Updates] ${submoduleId} update available: ${current} -> ${latestRelease.version}`);
```

**Tests**:
- Integration test: Verify log messages appear during clone
- Integration test: Verify log messages appear during update check

---

### Step 6: Update Component Types

**File**: `src/types/components.ts` (or appropriate types file)

**Changes**: Add `submodules` type to component definition.

```typescript
interface SubmoduleConfig {
    path: string;           // Relative path within parent (e.g., "packages/demo-inspector")
    repository: string;     // GitHub repo (e.g., "skukla/demo-inspector")
}

interface ComponentSource {
    type: 'git' | 'npm' | 'local';
    url?: string;
    branch?: string;
    gitOptions?: {
        shallow?: boolean;
        recursive?: boolean;
        tag?: string;
    };
    // ... existing fields
}

interface TransformedComponentDefinition {
    // ... existing fields
    submodules?: Record<string, SubmoduleConfig>;  // NEW
}
```

**Tests**:
- Type check: Component definitions with submodules compile correctly
- Unit test: Component registry transforms submodules field

---

## Test Strategy

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `tests/features/updates/services/updateManager-submodules.test.ts` | Submodule update checking |
| `tests/features/components/services/componentManager-submodules.test.ts` | Recursive clone verification |

### Integration Tests

| Test | Scenario |
|------|----------|
| Clone with submodules | Verify `git clone --recursive` is executed |
| Update check | Verify submodule versions are checked correctly |
| Missing submodule | Graceful handling when submodule not initialized |

### Manual Testing Checklist

- [ ] Create new project with citisignal-nextjs
- [ ] Verify demo-inspector submodule is cloned
- [ ] Check debug logs show submodule initialization
- [ ] Run update check, verify demo-inspector appears
- [ ] Verify update notification when demo-inspector has new release

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shallow clone + submodules causes "reference is not a tree" | Clone fails | Already mitigated: using `shallow: false` |
| Increased clone time without shallow | Slower project creation | Acceptable trade-off for submodule support |
| Submodule not initialized | Demo inspector missing | Add verification step after clone |

---

## Implementation Order

1. **Step 6** (Types) - Foundation for other changes
2. **Step 1** (citisignal-nextjs definition) - Enable recursive cloning
3. **Step 2** (Remove demo-inspector) - Simplify component selection
4. **Step 3** (COMPONENT_REPOS) - Enable update tracking
5. **Step 4** (Submodule update checking) - Core functionality
6. **Step 5** (Logging) - Observability

---

## Acceptance Criteria

- [ ] `git clone --recursive` is used for citisignal-nextjs
- [ ] demo-inspector submodule is present after project creation
- [ ] Update system can check demo-inspector for updates independently
- [ ] Debug logs show submodule operations
- [ ] No regression in existing component installation
- [ ] All new code has test coverage

---

## Notes

- This plan assumes citisignal-nextjs repository already has demo-inspector configured as a submodule
- The submodule path (`packages/demo-inspector`) should be verified against actual repo structure
- Future enhancement: Add submodule update command to update submodules in existing projects
