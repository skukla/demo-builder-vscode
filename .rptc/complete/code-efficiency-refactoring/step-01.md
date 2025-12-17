# Step 1: Branch Setup & Quick Wins

**Estimated Time:** 2-3 hours

---

## Purpose

Establish the refactoring branch and complete quick wins that immediately reduce code duplication and fix a known memory leak. This step removes 6 duplicate files (saving ~316 lines of code) and introduces proper status enums for type safety.

---

## Prerequisites

- [ ] Current branch is `refactor/core-architecture-wip`
- [ ] All existing tests pass
- [ ] No uncommitted changes in working directory

---

## Tests to Write First

### Test 1: ComponentTreeProvider Dispose Method

- [ ] **Test:** ComponentTreeProvider properly disposes event subscription
  - **Given:** A ComponentTreeProvider instance with an active subscription to stateManager.onProjectChanged
  - **When:** The dispose() method is called
  - **Then:** The subscription is disposed and no memory leak occurs
  - **File:** `tests/features/components/providers/componentTreeProvider.test.ts`

```typescript
describe('ComponentTreeProvider', () => {
  describe('dispose', () => {
    it('should dispose the project change subscription', () => {
      const mockDisposable = { dispose: jest.fn() };
      const mockStateManager = {
        onProjectChanged: jest.fn().mockReturnValue(mockDisposable),
        getCurrentProject: jest.fn(),
        getAllProjects: jest.fn(),
      };

      const provider = new ComponentTreeProvider(mockStateManager as any, '/ext/path');
      provider.dispose();

      expect(mockDisposable.dispose).toHaveBeenCalled();
    });
  });
});
```

### Test 2: MeshStatus Enum Usage

- [ ] **Test:** MeshStatus enum contains expected values
  - **Given:** The MeshStatus enum is imported
  - **When:** Enum values are accessed
  - **Then:** Values match expected status states (Deployed, NotDeployed, Stale, Checking, Error)
  - **File:** `tests/types/enums.test.ts`

```typescript
import { MeshStatus } from '@/types/enums';

describe('MeshStatus enum', () => {
  it('should have all expected status values', () => {
    expect(MeshStatus.Deployed).toBe('deployed');
    expect(MeshStatus.NotDeployed).toBe('not_deployed');
    expect(MeshStatus.Stale).toBe('stale');
    expect(MeshStatus.Checking).toBe('checking');
    expect(MeshStatus.Error).toBe('error');
  });
});
```

### Test 3: ComponentStatus Enum Usage

- [ ] **Test:** ComponentStatus enum contains expected values
  - **Given:** The ComponentStatus enum is imported
  - **When:** Enum values are accessed
  - **Then:** Values match expected component states (Installed, NotInstalled, Updating, Error)
  - **File:** `tests/types/enums.test.ts`

```typescript
import { ComponentStatus } from '@/types/enums';

describe('ComponentStatus enum', () => {
  it('should have all expected status values', () => {
    expect(ComponentStatus.Installed).toBe('installed');
    expect(ComponentStatus.NotInstalled).toBe('not_installed');
    expect(ComponentStatus.Updating).toBe('updating');
    expect(ComponentStatus.Error).toBe('error');
  });
});
```

### Test 4: Import Compilation After Deletions

- [ ] **Test:** TypeScript compilation succeeds after duplicate file deletions
  - **Given:** Duplicate files are deleted and imports updated
  - **When:** `npm run build` is executed
  - **Then:** Build completes without errors
  - **File:** Manual verification via build command

---

## Files to Create/Modify

### Files to Delete (Duplicates)

- [ ] **Delete:** `src/commands/helpers/setupInstructions.ts`
  - Keep: `src/features/project-creation/helpers/setupInstructions.ts`

- [ ] **Delete:** `src/commands/helpers/formatters.ts`
  - Keep: `src/features/project-creation/helpers/formatters.ts`

- [ ] **Delete:** `src/features/dashboard/ui/hooks/useDebouncedValue.ts`
  - Keep: `src/core/ui/hooks/useDebouncedValue.ts`

- [ ] **Delete:** `src/features/authentication/ui/hooks/useDebouncedLoading.ts`
  - Keep: `src/core/ui/hooks/useDebouncedLoading.ts`

- [ ] **Delete:** `src/features/authentication/ui/hooks/useMinimumLoadingTime.ts`
  - Keep: `src/core/ui/hooks/useMinimumLoadingTime.ts`

- [ ] **Delete:** `src/features/project-creation/handlers/HandlerContext.ts`
  - Keep: `src/commands/handlers/HandlerContext.ts`

### Files to Create

- [ ] **Create:** `src/types/enums.ts` - Status enums for type safety
- [ ] **Create:** `tests/features/components/providers/componentTreeProvider.test.ts` - Dispose tests
- [ ] **Create:** `tests/types/enums.test.ts` - Enum tests

### Files to Modify

- [ ] **Modify:** `src/features/components/providers/componentTreeProvider.ts` - Add dispose method and store subscription
- [ ] **Modify:** `src/types/index.ts` - Export new enums
- [ ] **Modify:** Import statements in files that reference deleted duplicates (update to use kept versions)

---

## Implementation Details

### RED Phase (Write failing tests first)

1. Create test file for ComponentTreeProvider dispose:
```typescript
// tests/features/components/providers/componentTreeProvider.test.ts
import { ComponentTreeProvider } from '@/features/components/providers/componentTreeProvider';

describe('ComponentTreeProvider', () => {
  describe('dispose', () => {
    it('should dispose the project change subscription', () => {
      const mockDisposable = { dispose: jest.fn() };
      const mockStateManager = {
        onProjectChanged: jest.fn().mockReturnValue(mockDisposable),
        getCurrentProject: jest.fn().mockResolvedValue(null),
        getAllProjects: jest.fn().mockResolvedValue([]),
      };

      const provider = new ComponentTreeProvider(mockStateManager as any, '/ext/path');
      provider.dispose();

      expect(mockDisposable.dispose).toHaveBeenCalled();
    });

    it('should dispose the EventEmitter', () => {
      const mockStateManager = {
        onProjectChanged: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        getCurrentProject: jest.fn().mockResolvedValue(null),
        getAllProjects: jest.fn().mockResolvedValue([]),
      };

      const provider = new ComponentTreeProvider(mockStateManager as any, '/ext/path');
      const disposeSpy = jest.spyOn(provider['_onDidChangeTreeData'], 'dispose');

      provider.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });
});
```

2. Create test file for enums:
```typescript
// tests/types/enums.test.ts
import { MeshStatus, ComponentStatus } from '@/types/enums';

describe('Status Enums', () => {
  describe('MeshStatus', () => {
    it('should have all expected values', () => {
      expect(MeshStatus.Deployed).toBe('deployed');
      expect(MeshStatus.NotDeployed).toBe('not_deployed');
      expect(MeshStatus.Stale).toBe('stale');
      expect(MeshStatus.Checking).toBe('checking');
      expect(MeshStatus.Error).toBe('error');
    });

    it('should be usable as type', () => {
      const status: MeshStatus = MeshStatus.Deployed;
      expect(status).toBe('deployed');
    });
  });

  describe('ComponentStatus', () => {
    it('should have all expected values', () => {
      expect(ComponentStatus.Installed).toBe('installed');
      expect(ComponentStatus.NotInstalled).toBe('not_installed');
      expect(ComponentStatus.Updating).toBe('updating');
      expect(ComponentStatus.Error).toBe('error');
    });
  });
});
```

### GREEN Phase (Minimal implementation to pass tests)

1. **Create branch:**
```bash
git checkout -b refactor/code-efficiency
```

2. **Create enums file:**
```typescript
// src/types/enums.ts
export enum MeshStatus {
  Deployed = 'deployed',
  NotDeployed = 'not_deployed',
  Stale = 'stale',
  Checking = 'checking',
  Error = 'error',
}

export enum ComponentStatus {
  Installed = 'installed',
  NotInstalled = 'not_installed',
  Updating = 'updating',
  Error = 'error',
}
```

3. **Fix ComponentTreeProvider memory leak:**
```typescript
// src/features/components/providers/componentTreeProvider.ts
export class ComponentTreeProvider implements vscode.TreeDataProvider<FileSystemItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<FileSystemItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private stateManager: StateManager;
    private extensionPath: string;
    private projectChangeSubscription: vscode.Disposable;  // ADD THIS

    constructor(stateManager: StateManager, extensionPath: string) {
        this.stateManager = stateManager;
        this.extensionPath = extensionPath;

        // Store subscription for disposal
        this.projectChangeSubscription = stateManager.onProjectChanged(() => {
            this.refresh();
        });
    }

    // ADD THIS METHOD
    dispose(): void {
        this.projectChangeSubscription.dispose();
        this._onDidChangeTreeData.dispose();
    }
    // ... rest of class
}
```

4. **Delete duplicate files and update imports:**

Find files importing from deleted locations and update to use kept versions:
- `@/commands/helpers/setupInstructions` -> `@/features/project-creation/helpers/setupInstructions`
- `@/commands/helpers/formatters` -> `@/features/project-creation/helpers/formatters`
- `@/features/dashboard/ui/hooks/useDebouncedValue` -> `@/core/ui/hooks/useDebouncedValue`
- `@/features/authentication/ui/hooks/useDebouncedLoading` -> `@/core/ui/hooks/useDebouncedLoading`
- `@/features/authentication/ui/hooks/useMinimumLoadingTime` -> `@/core/ui/hooks/useMinimumLoadingTime`
- `@/features/project-creation/handlers/HandlerContext` -> `@/commands/handlers/HandlerContext`

5. **Export enums from types index:**
```typescript
// src/types/index.ts
export * from './enums';
```

### REFACTOR Phase (Improve while keeping tests green)

1. Ensure dispose method follows VS Code extension patterns
2. Verify no orphaned imports remain after deletions
3. Run full build to confirm all imports resolve
4. Run all tests to ensure no regressions

---

## Expected Outcome

After completing this step:

- [ ] New branch `refactor/code-efficiency` created
- [ ] ComponentTreeProvider has proper dispose() method (no memory leak)
- [ ] 6 duplicate files deleted (~316 LOC removed)
- [ ] MeshStatus and ComponentStatus enums created
- [ ] All imports updated to use correct file locations
- [ ] Build compiles successfully
- [ ] All existing tests pass
- [ ] New tests for dispose and enums pass

---

## Acceptance Criteria

- [ ] All tests passing for this step
- [ ] Code follows project style guide (path aliases, TypeScript strict)
- [ ] No console.log or debugger statements
- [ ] Coverage maintained at 80%+ for modified code
- [ ] Git commit created with clear message describing changes
- [ ] No duplicate files remain in codebase

---

## Improvement Tracking

```
Step 1 Impact Summary:
- LOC: -316 lines (duplicate deletions)
- CC Reduction: 0 (no logic changes)
- Type Safety: +2 enums (MeshStatus, ComponentStatus)
- Abstractions: 0
- Coverage: baseline established
- Memory: +1 memory leak fixed (ComponentTreeProvider)
```

---

## Notes

- The kept versions of duplicate files were chosen based on their location in the feature-based architecture
- Enums are placed in `src/types/` as they are shared across multiple features
- ComponentTreeProvider dispose pattern follows VS Code extension best practices
