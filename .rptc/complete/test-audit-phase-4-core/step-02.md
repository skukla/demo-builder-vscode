# Step 2: State Module Tests (15 files)

> **Phase:** 4 - Core Infrastructure
> **Step:** 2 of 5
> **Focus:** StateManager, TransientStateManager, ProjectConfigWriter

## Overview

**Purpose:** Audit all state module tests to ensure they accurately reflect the current StateManager delegation pattern, TransientStateManager TTL behavior, and ProjectConfigWriter API.

**Estimated Time:** 2-3 hours

**Prerequisites:**
- [ ] Step 1 (Shell) complete
- [ ] All current tests pass
- [ ] Access to src/core/state/*.ts for reference

---

## Source Files for Reference

Before auditing tests, review these source files:

```
src/core/state/
├── stateManager.ts            # State orchestrator with delegation
├── transientStateManager.ts   # TTL-based in-memory cache
├── projectConfigWriter.ts     # Config file writer
├── projectFileLoader.ts       # Project loading from disk
├── projectDirectoryScanner.ts # Projects directory scanner
├── recentProjectsManager.ts   # Recent projects list
├── projectStateSync.ts        # State synchronization
├── sessionUIState.ts          # Session UI state
└── index.ts                   # Public exports
```

**Key Architectural Note:** StateManager uses delegation pattern:
- `ProjectFileLoader` - Loading projects from disk
- `ProjectConfigWriter` - Writing project config files
- `RecentProjectsManager` - Managing recent projects list
- `ProjectDirectoryScanner` - Scanning projects directory

---

## Test Files to Audit

### StateManager Tests (10 files)

#### 1. stateManager-basic.test.ts

**File:** `tests/core/state/stateManager-basic.test.ts`

**Audit Checklist:**
- [ ] Constructor takes `vscode.ExtensionContext` only
- [ ] `initialize()` creates state directory and loads state
- [ ] `getCurrentProject()` returns `Project | undefined`
- [ ] Mock fs operations match current patterns
- [ ] State file path matches `~/.demo-builder/state.json`

**Key Verification Points:**
```typescript
// Verify these match current implementation:
- StateManager(context: vscode.ExtensionContext)
- initialize(): Promise<void>
- getCurrentProject(): Promise<Project | undefined>
- StateData: { version, currentProject, processes, lastUpdated }
```

#### 2. stateManager-context.test.ts

**File:** `tests/core/state/stateManager-context.test.ts`

**Audit Checklist:**
- [ ] ExtensionContext mock matches current usage
- [ ] globalState mock matches current operations
- [ ] Context-based state operations verified

#### 3. stateManager-errorHandling.test.ts

**File:** `tests/core/state/stateManager-errorHandling.test.ts`

**Audit Checklist:**
- [ ] Error recovery matches current graceful degradation
- [ ] Corrupted state file handling verified
- [ ] Missing state file handling verified
- [ ] Logger mock calls match current logging patterns

#### 4. stateManager-processes.test.ts

**File:** `tests/core/state/stateManager-processes.test.ts`

**Audit Checklist:**
- [ ] ProcessInfo type matches current definition
- [ ] Process registration/deregistration verified
- [ ] Process state persistence verified

#### 5. stateManager-projects.test.ts

**File:** `tests/core/state/stateManager-projects.test.ts`

**Audit Checklist:**
- [ ] Project type matches current definition
- [ ] setCurrentProject() signature verified
- [ ] clearCurrentProject() behavior verified
- [ ] Project path validation (fs.access) verified

#### 6. stateManager-recentProjects.test.ts

**File:** `tests/core/state/stateManager-recentProjects.test.ts`

**Audit Checklist:**
- [ ] RecentProjectsManager delegation verified
- [ ] Recent projects list operations match current
- [ ] RecentProject type matches current definition

#### 7. stateManager-componentVersions.test.ts

**File:** `tests/core/state/stateManager-componentVersions.test.ts`

**Audit Checklist:**
- [ ] Component version tracking matches current
- [ ] Version comparison logic verified
- [ ] Update detection behavior verified

#### 8. stateManager-utilities.test.ts

**File:** `tests/core/state/stateManager-utilities.test.ts`

**Audit Checklist:**
- [ ] Utility methods match current exports
- [ ] Helper function signatures verified

#### 9. stateManager.disposal.test.ts

**File:** `tests/core/state/stateManager.disposal.test.ts`

**Audit Checklist:**
- [ ] Disposal pattern matches current
- [ ] Event emitter cleanup verified
- [ ] File handle cleanup verified

#### 10. stateManager-getCurrentProject-reload.test.ts

**File:** `tests/core/state/stateManager-getCurrentProject-reload.test.ts`

**Audit Checklist:**
- [ ] Project reload from disk behavior verified
- [ ] ProjectFileLoader delegation verified
- [ ] Cache invalidation behavior verified

---

### TransientStateManager Tests (3 files)

#### 11. transientStateManager-basic.test.ts

**File:** `tests/core/state/transientStateManager-basic.test.ts`

**Audit Checklist:**
- [ ] get/set API matches current implementation
- [ ] In-memory storage behavior verified
- [ ] Type parameter usage verified

**Key Verification Points:**
```typescript
// Verify these match current implementation:
- TransientStateManager<T>
- get(key: string): T | undefined
- set(key: string, value: T, ttlMs?: number): void
- delete(key: string): boolean
- clear(): void
```

#### 12. transientStateManager-ttl.test.ts

**File:** `tests/core/state/transientStateManager-ttl.test.ts`

**Audit Checklist:**
- [ ] TTL expiration behavior verified
- [ ] Default TTL value verified
- [ ] TTL override per-entry verified
- [ ] jest.useFakeTimers() used correctly

#### 13. transientStateManager-helpers.test.ts

**File:** `tests/core/state/transientStateManager-helpers.test.ts`

**Audit Checklist:**
- [ ] Helper functions match current exports
- [ ] Cache key generation verified
- [ ] Utility function signatures verified

---

### ProjectConfigWriter Tests (1 file)

#### 14. projectConfigWriter-accessors.test.ts

**File:** `tests/core/state/projectConfigWriter-accessors.test.ts`

**Audit Checklist:**
- [ ] ProjectConfigWriter API matches current
- [ ] Config file path patterns verified
- [ ] Write operations match current implementation
- [ ] File locking/safety patterns verified

**Note:** This is a new test file (untracked in git status). Verify it aligns with current implementation.

---

## Audit Process

For each file:

1. **Read current source** in src/core/state/
2. **Open test file** in tests/core/state/
3. **Verify mock setup** matches current dependencies
4. **Check delegation pattern** - StateManager delegates to specialized services
5. **Check each test** for:
   - Correct API calls
   - Correct expected values
   - Proper mock of fs/vscode
   - No version references (v2/v3)
6. **Run tests** after changes: `npm test -- tests/core/state/[file].test.ts`
7. **Commit** after each file passes

---

## Common Issues to Fix

### Issue 1: Outdated StateManager Constructor

**Before:**
```typescript
const stateManager = new StateManager(mockContext, mockLogger);
```

**After:**
```typescript
const stateManager = new StateManager(mockContext);
```

### Issue 2: Missing Delegation Service Mocks

**Before:**
```typescript
// Direct file operations
(fs.readFile as jest.Mock).mockResolvedValue(projectData);
```

**After:**
```typescript
// ProjectFileLoader is delegated to
jest.mock('./projectFileLoader');
const mockProjectFileLoader = {
  loadProject: jest.fn().mockResolvedValue(projectData)
};
```

### Issue 3: Outdated Project Type

**Before:**
```typescript
const project = {
  name: 'test',
  path: '/test',
  components: ['frontend', 'backend']
};
```

**After:**
```typescript
const project: Project = {
  name: 'test',
  path: '/test',
  status: 'ready',
  created: new Date('2024-01-01'),
  lastModified: new Date('2024-01-02')
};
```

### Issue 4: Outdated State File Structure

**Before:**
```typescript
const mockState = {
  currentProject: {...},
  settings: {...}
};
```

**After:**
```typescript
const mockState: StateData = {
  version: 1,
  currentProject: {...},
  processes: {},
  lastUpdated: new Date().toISOString()
};
```

---

## Key Type Definitions to Verify

```typescript
// From src/types/index.ts or src/core/state/
interface Project {
  name: string;
  path: string;
  status: 'creating' | 'ready' | 'error';
  created: Date;
  lastModified: Date;
  // ... other fields
}

interface StateData {
  version: number;
  currentProject?: Project;
  processes: Map<string, ProcessInfo> | Record<string, ProcessInfo>;
  lastUpdated: Date | string;
}

interface ProcessInfo {
  pid: number;
  type: string;
  startedAt: Date;
}
```

---

## Completion Criteria

- [ ] All 15 state test files audited
- [ ] All mocks match current src/core/state/ implementations
- [ ] Delegation pattern properly mocked (ProjectFileLoader, etc.)
- [ ] All Project/StateData types match current definitions
- [ ] All tests pass: `npm test -- tests/core/state/`
- [ ] No TypeScript errors

---

## Files Modified (Tracking)

| File | Status | Notes |
|------|--------|-------|
| stateManager-basic.test.ts | [ ] | |
| stateManager-context.test.ts | [ ] | |
| stateManager-errorHandling.test.ts | [ ] | |
| stateManager-processes.test.ts | [ ] | |
| stateManager-projects.test.ts | [ ] | |
| stateManager-recentProjects.test.ts | [ ] | |
| stateManager-componentVersions.test.ts | [ ] | |
| stateManager-utilities.test.ts | [ ] | |
| stateManager.disposal.test.ts | [ ] | |
| stateManager-getCurrentProject-reload.test.ts | [ ] | |
| transientStateManager-basic.test.ts | [ ] | |
| transientStateManager-ttl.test.ts | [ ] | |
| transientStateManager-helpers.test.ts | [ ] | |
| projectConfigWriter-accessors.test.ts | [ ] | New file |

---

## Next Step

After completing Step 2, proceed to:
**Step 3: Validation + Utils Tests (20 files)**
