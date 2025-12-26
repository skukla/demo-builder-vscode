# Step 7: State Utilities Tests

## Prerequisites

- [x] Step 6 complete (logging infrastructure tests)

## Overview
Add comprehensive unit tests for state utilities with 0% coverage.

**Priority**: LOW (Internal utilities)
**Estimated Time**: 1-2 hours
**Test Location**: `tests/core/state/`

---

## Source Files

| File | Lines | Complexity |
|------|-------|------------|
| `src/core/state/sessionUIState.ts` | 115 | Simple singleton class |
| `src/core/state/projectStateSync.ts` | 60 | Pure utility functions |

---

## Test File 1: sessionUIState.test.ts

**Target**: `tests/core/state/sessionUIState.test.ts`
**Coverage Target**: 100%

### Test Scenarios (16 cases)

#### Initial State
- [ ] isComponentsViewShown defaults to false
- [ ] isLogsViewShown defaults to false
- [ ] viewModeOverride defaults to undefined

#### Panel Visibility Setters
- [ ] Setting isComponentsViewShown to true
- [ ] Setting isComponentsViewShown to false
- [ ] Setting isLogsViewShown to true
- [ ] Setting isLogsViewShown to false

#### View Mode Override
- [ ] Setting viewModeOverride to 'cards'
- [ ] Setting viewModeOverride to 'rows'
- [ ] Setting viewModeOverride to undefined (clear)

#### reset() Method
- [ ] reset() clears isComponentsViewShown
- [ ] reset() clears isLogsViewShown
- [ ] reset() clears viewModeOverride

#### resetPanelState() Method
- [ ] resetPanelState() clears panel visibility
- [ ] resetPanelState() preserves viewModeOverride

#### Singleton Behavior
- [ ] Same instance returned on multiple imports

### Implementation

```typescript
import { sessionUIState, ViewMode } from '@/core/state/sessionUIState';

describe('sessionUIState', () => {
    beforeEach(() => {
        sessionUIState.reset();
    });

    describe('initial state', () => {
        it('should default isComponentsViewShown to false', () => {
            expect(sessionUIState.isComponentsViewShown).toBe(false);
        });

        it('should default isLogsViewShown to false', () => {
            expect(sessionUIState.isLogsViewShown).toBe(false);
        });

        it('should default viewModeOverride to undefined', () => {
            expect(sessionUIState.viewModeOverride).toBeUndefined();
        });
    });

    describe('panel visibility', () => {
        it('should set isComponentsViewShown', () => {
            sessionUIState.isComponentsViewShown = true;
            expect(sessionUIState.isComponentsViewShown).toBe(true);
        });

        it('should set isLogsViewShown', () => {
            sessionUIState.isLogsViewShown = true;
            expect(sessionUIState.isLogsViewShown).toBe(true);
        });
    });

    describe('viewModeOverride', () => {
        it('should set to cards', () => {
            sessionUIState.viewModeOverride = 'cards';
            expect(sessionUIState.viewModeOverride).toBe('cards');
        });

        it('should set to rows', () => {
            sessionUIState.viewModeOverride = 'rows';
            expect(sessionUIState.viewModeOverride).toBe('rows');
        });

        it('should clear with undefined', () => {
            sessionUIState.viewModeOverride = 'cards';
            sessionUIState.viewModeOverride = undefined;
            expect(sessionUIState.viewModeOverride).toBeUndefined();
        });
    });

    describe('reset()', () => {
        it('should clear all state', () => {
            sessionUIState.isComponentsViewShown = true;
            sessionUIState.isLogsViewShown = true;
            sessionUIState.viewModeOverride = 'cards';

            sessionUIState.reset();

            expect(sessionUIState.isComponentsViewShown).toBe(false);
            expect(sessionUIState.isLogsViewShown).toBe(false);
            expect(sessionUIState.viewModeOverride).toBeUndefined();
        });
    });

    describe('resetPanelState()', () => {
        it('should clear only panel visibility', () => {
            sessionUIState.isComponentsViewShown = true;
            sessionUIState.isLogsViewShown = true;
            sessionUIState.viewModeOverride = 'rows';

            sessionUIState.resetPanelState();

            expect(sessionUIState.isComponentsViewShown).toBe(false);
            expect(sessionUIState.isLogsViewShown).toBe(false);
            expect(sessionUIState.viewModeOverride).toBe('rows');
        });
    });
});
```

---

## Test File 2: projectStateSync.test.ts

**Target**: `tests/core/state/projectStateSync.test.ts`
**Coverage Target**: 100%

### Test Scenarios (12 cases)

#### getFrontendEnvVars
- [ ] Returns all FRONTEND_ENV_VARS keys
- [ ] Extracts string values correctly
- [ ] Returns empty string for missing keys
- [ ] Returns empty string for undefined values
- [ ] Returns empty string for non-string values
- [ ] Returns empty string for null values

#### updateFrontendState
- [ ] Updates frontendEnvState with valid config
- [ ] Sets capturedAt timestamp
- [ ] No-op when frontendInstance missing
- [ ] No-op when componentConfigs missing
- [ ] No-op when componentInstances missing
- [ ] Uses empty object when frontend config missing

### Implementation

```typescript
import { getFrontendEnvVars, updateFrontendState } from '@/core/state/projectStateSync';
import { Project } from '@/types';

describe('projectStateSync', () => {
    describe('getFrontendEnvVars', () => {
        it('should return all expected frontend env var keys', () => {
            const result = getFrontendEnvVars({});
            expect(Object.keys(result)).toEqual([
                'MESH_ENDPOINT',
                'ADOBE_COMMERCE_URL',
                'ADOBE_COMMERCE_ENVIRONMENT_ID',
                'ADOBE_COMMERCE_STORE_VIEW_CODE',
                'ADOBE_COMMERCE_WEBSITE_CODE',
                'ADOBE_COMMERCE_STORE_CODE',
                'ADOBE_CATALOG_API_KEY',
                'ADOBE_ASSETS_URL',
                'ADOBE_COMMERCE_CUSTOMER_GROUP',
            ]);
        });

        it('should extract string values', () => {
            const config = { MESH_ENDPOINT: 'https://mesh.api' };
            const result = getFrontendEnvVars(config);
            expect(result.MESH_ENDPOINT).toBe('https://mesh.api');
        });

        it('should return empty string for missing keys', () => {
            const result = getFrontendEnvVars({});
            expect(result.MESH_ENDPOINT).toBe('');
        });

        it('should normalize non-string to empty string', () => {
            const config = { MESH_ENDPOINT: 123, ADOBE_COMMERCE_URL: null };
            const result = getFrontendEnvVars(config as any);
            expect(result.MESH_ENDPOINT).toBe('');
            expect(result.ADOBE_COMMERCE_URL).toBe('');
        });
    });

    describe('updateFrontendState', () => {
        const createProject = (overrides: Partial<Project> = {}): Project => ({
            name: 'test',
            path: '/test',
            status: 'ready',
            created: new Date(),
            lastModified: new Date(),
            componentInstances: { 'citisignal-nextjs': { status: 'running' } },
            componentConfigs: { 'citisignal-nextjs': { MESH_ENDPOINT: 'https://api' } },
            ...overrides,
        } as Project);

        it('should update frontendEnvState', () => {
            const project = createProject();
            updateFrontendState(project);

            expect(project.frontendEnvState).toBeDefined();
            expect(project.frontendEnvState?.envVars.MESH_ENDPOINT).toBe('https://api');
        });

        it('should set capturedAt timestamp', () => {
            const project = createProject();
            const before = new Date().toISOString();
            updateFrontendState(project);
            const after = new Date().toISOString();

            expect(project.frontendEnvState?.capturedAt).toBeDefined();
            expect(project.frontendEnvState!.capturedAt >= before).toBe(true);
            expect(project.frontendEnvState!.capturedAt <= after).toBe(true);
        });

        it('should not modify when componentInstances missing', () => {
            const project = createProject({ componentInstances: undefined });
            updateFrontendState(project);
            expect(project.frontendEnvState).toBeUndefined();
        });

        it('should not modify when frontend instance missing', () => {
            const project = createProject({ componentInstances: {} });
            updateFrontendState(project);
            expect(project.frontendEnvState).toBeUndefined();
        });

        it('should not modify when componentConfigs missing', () => {
            const project = createProject({ componentConfigs: undefined });
            updateFrontendState(project);
            expect(project.frontendEnvState).toBeUndefined();
        });
    });
});
```

---

## TDD Workflow

### RED Phase
1. Create `tests/core/state/sessionUIState.test.ts`
2. Create `tests/core/state/projectStateSync.test.ts`
3. Run tests - verify failures for any gaps

### GREEN Phase
Both modules already implemented - tests should pass immediately.

### REFACTOR Phase
No refactoring needed - these are simple utility modules.

---

## Acceptance Criteria

- [x] `sessionUIState.test.ts` created (24 tests - exceeds 16 target)
- [x] `projectStateSync.test.ts` created (17 tests - exceeds 12 target)
- [x] All 41 tests passing
- [x] High coverage achieved (100% projectStateSync, 95.65% sessionUIState)
- [x] No mocking required (pure state/logic)
- [x] Tests use beforeEach reset for isolation

---

## Notes

- **Simplicity**: No external dependencies to mock
- **Singleton**: sessionUIState uses reset() in beforeEach for test isolation
- **Type Safety**: Tests verify ViewMode type ('cards' | 'rows')
- **Mutation**: updateFrontendState mutates project in place (matches source behavior)
