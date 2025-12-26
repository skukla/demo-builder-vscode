# Step 1: Audit and Migrate `.components!` Usages

## Purpose

Migrate 7 test files from the legacy v2.0 `.components!` pattern (unified components map) to the current v3.0.0 section-based registry structure. This ensures tests accurately reflect the canonical implementation in `templates/components.json`.

**Why This Step is First:**
- Test utilities (`testUtils.ts`) are foundational - all other ComponentRegistryManager tests depend on them
- Fixing mock data first prevents cascading failures in subsequent test updates
- The `mockRawRegistryV3` already exists but is underutilized

---

## Prerequisites

- [x] Understanding of v2.0 vs v3.0.0 registry structure (documented below)
- [x] Access to `templates/components.json` as reference for canonical structure
- [x] Jest test runner functional (`npm test`)

---

## ✅ COMPLETED (2025-01-XX)

### Summary

**Step 1 completed successfully.** All 11 ComponentRegistryManager test suites pass (117 tests total).

### Key Changes Made

1. **testUtils.ts completely rewritten**:
   - Removed v2.0 mock entirely (no deprecation - just eliminated)
   - Renamed `mockRawRegistryV3` → `mockRawRegistry`
   - Renamed `createMaliciousRegistryV3` → `createMaliciousRegistry`
   - Renamed `V3_COMPONENT_SECTIONS` → `COMPONENT_SECTIONS`
   - Added `integrations` section and `dependencies` property to eds

2. **8 test files migrated to v3.0.0 structure**:
   - ComponentRegistryManager-retrieval.test.ts
   - ComponentRegistryManager-registration.test.ts
   - ComponentRegistryManager-initialization.test.ts
   - ComponentRegistryManager-loading.test.ts
   - ComponentRegistryManager-nodeVersions.test.ts
   - ComponentRegistryManager-configuration.test.ts
   - ComponentRegistryManager-dependencies.test.ts
   - ComponentRegistryManager-security.test.ts

3. **Production code bugfix** (discovered via TDD):
   - Added `...(raw.integrations || {})` to componentsMap in ComponentRegistryManager.ts
   - This enables v3.0.0 integrations section support (was missing)

### Metrics

- **Before**: 52 `.components!` usages, 8 V3-suffixed variables
- **After**: 0 `.components!` usages, 0 V3-suffixed variables
- **Tests**: 11 suites, 117 tests - all passing
- **Full suite**: 5727 tests - all passing

---

## Registry Structure Comparison

### Legacy v2.0 Pattern (Migrate FROM)
```typescript
// Unified components map - all component types in one flat object
const mockRawRegistry = {
  version: '2.0',
  components: {
    'frontend1': { ... },      // frontends mixed with
    'backend1': { ... },       // backends and
    'dep1': { ... },           // dependencies
    'app1': { ... }            // in same map
  }
};

// Access pattern:
mockRawRegistry.components!['frontend1']
```

### Current v3.0.0 Pattern (Migrate TO)
```typescript
// Section-based - components organized by type
const mockRawRegistryV3 = {
  version: '3.0.0',
  frontends: {
    'eds': { ... },
    'headless': { ... }
  },
  backends: {
    'adobe-commerce-paas': { ... }
  },
  mesh: {
    'commerce-mesh': { ... }
  },
  dependencies: {
    'demo-inspector': { ... }
  },
  appBuilderApps: {
    'integration-service': { ... }
  }
};

// Access pattern:
mockRawRegistryV3.frontends!['eds']
mockRawRegistryV3.backends!['adobe-commerce-paas']
```

---

## Tests to Write First (TDD - RED Phase)

Since this is a migration step, we verify tests pass with the NEW mock data structure.

### A. Test Utility Migration Verification

- [ ] **Test: mockRawRegistryV3 structure matches components.json sections**
  - **Given:** `mockRawRegistryV3` in testUtils.ts
  - **When:** Compare sections against components.json v3.0.0
  - **Then:** All section keys match (`frontends`, `backends`, `mesh`, `dependencies`, `appBuilderApps`)
  - **File:** `tests/features/components/services/ComponentRegistryManager.testUtils.ts`

- [ ] **Test: createMaliciousRegistry works with v3.0.0 section paths**
  - **Given:** Component path like `"frontends.eds"` or `"backends.adobe-commerce-paas"`
  - **When:** `createMaliciousRegistry('frontends.eds', 'malicious', true)` called
  - **Then:** Returns registry with malicious nodeVersion in correct section
  - **File:** Existing tests in `ComponentRegistryManager-security.test.ts`

### B. Node Version Tests Migration

- [ ] **Test: getRequiredNodeVersions with v3.0.0 mock data**
  - **Given:** Tests use `mockRawRegistryV3` instead of `mockRawRegistry`
  - **When:** `getRequiredNodeVersions('eds', 'adobe-commerce-paas')` called
  - **Then:** Returns correct node versions from v3.0.0 sections
  - **File:** `tests/features/components/services/ComponentRegistryManager-nodeVersions.test.ts`

### C. Security Validation Tests Migration

- [ ] **Test: Security validation works with v3.0.0 section paths**
  - **Given:** Tests use `createMaliciousRegistryV3()` helper
  - **When:** Malicious registry created with section path like `"frontends.eds"`
  - **Then:** Security validation properly rejects injection payloads
  - **File:** `tests/features/components/services/ComponentRegistryManager-security.test.ts`

### D. Dependency Resolution Tests Migration

- [ ] **Test: Dependency resolver works with v3.0.0 structure**
  - **Given:** `mockRawRegistryV3` with section-based components
  - **When:** `resolveDependencies('eds', 'adobe-commerce-paas')` called
  - **Then:** Correctly resolves dependencies from `dependencies` section
  - **File:** `tests/features/components/services/ComponentRegistryManager-dependencies.test.ts`

---

## Files to Modify

### Primary Files

- [ ] **`tests/features/components/services/ComponentRegistryManager.testUtils.ts`**
  - Deprecate `mockRawRegistry` (v2.0) - add deprecation comment
  - Enhance `mockRawRegistryV3` to be the primary mock
  - Update `createMaliciousRegistry` to default to v3.0.0
  - Add helper to create test-specific v3.0.0 registry variations

- [ ] **`tests/features/components/services/ComponentRegistryManager-nodeVersions.test.ts`**
  - Replace `mockRawRegistry` imports with `mockRawRegistryV3`
  - Update component IDs from legacy (`frontend1`) to canonical (`eds`)
  - Update `.components!` accesses to section-based accesses

- [ ] **`tests/features/components/services/ComponentRegistryManager-security.test.ts`**
  - Switch from `mockRawRegistry` to `mockRawRegistryV3`
  - Update `createMaliciousRegistry()` calls to use v3.0.0 paths
  - Use `createMaliciousRegistryV3()` for cleaner syntax

- [ ] **`tests/features/components/services/ComponentRegistryManager-validation.test.ts`**
  - Replace inline `.components!` modifications with section-based
  - Use v3.0.0 section paths (`frontends.eds` not `components.frontend1`)

- [ ] **`tests/features/components/services/ComponentRegistryManager-configuration.test.ts`**
  - Migrate from `mockRawRegistry` to `mockRawRegistryV3`
  - Update component ID references
  - Update inline registry modifications to use sections

- [ ] **`tests/features/components/services/ComponentRegistryManager-dependencies.test.ts`**
  - Switch to `mockRawRegistryV3`
  - Update dependency resolution tests with v3.0.0 component IDs

### UI Test File

- [ ] **`tests/features/project-creation/ui/wizard/steps/ReviewStep.test.tsx`**
  - No changes needed - uses UI mock data, not registry structure
  - Verify component IDs match current canonical names

---

## Implementation Details

### RED Phase (Verify current tests pass, then identify breakage)

1. **Run existing tests to establish baseline:**
   ```bash
   npm test -- tests/features/components/services/ComponentRegistryManager
   ```

2. **Verify current test status:**
   - All 6 ComponentRegistryManager test files should pass
   - Document current pass/fail counts

### GREEN Phase (Migrate mock data and fix tests)

1. **Update testUtils.ts:**

   ```typescript
   /**
    * @deprecated Use mockRawRegistryV3 for v3.0.0 structure
    * This v2.0 mock is retained only for backward compatibility testing
    */
   export const mockRawRegistry: RawComponentRegistry = {
     // ... existing v2.0 structure (keep for reference)
   };

   /**
    * PRIMARY MOCK - v3.0.0 section-based structure
    * Matches templates/components.json canonical structure
    */
   export const mockRawRegistryV3: RawComponentRegistry = {
     version: '3.0.0',
     selectionGroups: {
       frontends: ['eds', 'headless'],
       backends: ['adobe-commerce-paas', 'adobe-commerce-accs'],
       dependencies: ['demo-inspector'],
       appBuilderApps: ['integration-service'],
     },
     frontends: {
       eds: {
         id: 'eds',
         name: 'Edge Delivery Services',
         // ... full structure matching components.json
       },
     },
     backends: { ... },
     mesh: { ... },
     dependencies: { ... },
     appBuilderApps: { ... },
   };
   ```

2. **Update each test file systematically:**

   **Pattern - Before (v2.0):**
   ```typescript
   mockLoader.load.mockResolvedValue(mockRawRegistry);
   const versions = await manager.getRequiredNodeVersions('frontend1', 'backend1');
   ```

   **Pattern - After (v3.0.0):**
   ```typescript
   mockLoader.load.mockResolvedValue(mockRawRegistryV3);
   const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas');
   ```

3. **Update inline registry modifications:**

   **Before (v2.0):**
   ```typescript
   const modified = {
     ...mockRawRegistry,
     components: {
       ...mockRawRegistry.components!,
       frontend1: {
         ...mockRawRegistry.components!.frontend1,
         configuration: { nodeVersion: 'invalid' }
       }
     }
   };
   ```

   **After (v3.0.0):**
   ```typescript
   const modified = {
     ...mockRawRegistryV3,
     frontends: {
       ...mockRawRegistryV3.frontends,
       eds: {
         ...mockRawRegistryV3.frontends!.eds,
         configuration: {
           ...mockRawRegistryV3.frontends!.eds.configuration,
           nodeVersion: 'invalid'
         }
       }
     }
   };
   ```

4. **Update createMaliciousRegistry calls:**

   **Before:**
   ```typescript
   createMaliciousRegistry('components.frontend1', '20; rm -rf /')
   ```

   **After:**
   ```typescript
   createMaliciousRegistryV3('frontends.eds', '20; rm -rf /')
   ```

### REFACTOR Phase (Improve test clarity)

1. **Add type safety improvements:**
   - Ensure all mock data conforms to `RawComponentRegistry` type
   - Remove unnecessary non-null assertions where possible

2. **Consolidate duplicate test helpers:**
   - Use `createMaliciousRegistryV3()` consistently
   - Remove redundant inline registry construction

3. **Update test descriptions:**
   - Replace legacy component IDs in test names
   - Clarify which registry version tests target

---

## Expected Outcome

After this step completes:

- [x] All 11 ComponentRegistryManager test files use v3.0.0 mock data
- [x] Legacy `.components!` pattern eliminated from test files
- [x] Tests reference canonical component IDs (`eds`, `adobe-commerce-paas`, etc.)
- [x] `mockRawRegistry` is now v3.0.0 (v2.0 mock removed entirely)
- [x] `mockRawRegistry` is the primary mock for all tests (V3 suffix removed)
- [x] All tests pass with `npm test -- tests/features/components/services/`

**Test Count Verification:**
```bash
npm test -- tests/features/components/services/ --verbose
# Expected: All existing tests pass (no change in pass/fail count)
```

---

## Acceptance Criteria

### Functionality
- [x] All ComponentRegistryManager tests pass after migration
- [x] No new test failures introduced
- [x] Tests use v3.0.0 component IDs matching `templates/components.json`

### Code Quality
- [x] Legacy `mockRawRegistry` removed entirely (simpler than deprecation)
- [x] All `.components!` usages replaced with section-based access
- [x] No TypeScript errors in test files
- [x] Test file imports updated (no unused imports)

### Documentation
- [x] testUtils.ts has clear comments explaining v3.0.0 structure
- [x] Mock derivation pattern documentation preserved

### Testing
- [x] Run full ComponentRegistryManager test suite: `npm test -- tests/features/components/services/`
- [x] Verify no regressions (full suite: 5727 tests pass)

---

## Component ID Mapping Reference

| Legacy ID (v2.0) | Canonical ID (v3.0.0) | Section |
|------------------|----------------------|---------|
| `frontend1` | `eds` | `frontends` |
| `frontend2` | `headless` | `frontends` |
| `backend1` | `adobe-commerce-paas` | `backends` |
| `dep1` | `demo-inspector` | `dependencies` |
| `app1` | `integration-service` | `appBuilderApps` |
| N/A | `commerce-mesh` | `mesh` |

---

## Estimated Time

**2-3 hours**

- testUtils.ts update: 30 min
- Each test file migration: 20-30 min x 5 files = ~2 hours
- Verification and cleanup: 30 min

---

## Risks and Mitigations

### Risk: Breaking existing tests during migration
- **Mitigation:** Run tests after each file update, commit incrementally

### Risk: Mock data structure doesn't match actual implementation
- **Mitigation:** Cross-reference with `templates/components.json` and `ComponentRegistryManager.ts`

### Risk: Missing section in mockRawRegistryV3
- **Mitigation:** Compare sections against actual components.json before starting
