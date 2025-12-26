# Codebase Audit & Test Coverage Analysis

**Date**: 2025-12-24
**Scope**: Codebase only
**Depth**: Comprehensive
**Focus Areas**: New data model, updater/fnm logic, test organization

---

## Executive Summary

The audit reveals **significant testing gaps** that explain why recent bugs (updater logic, fnm/Node version management) weren't caught by TDD. The root cause is a **breakdown in the TDD process** - tests were written after implementation, using outdated structures, without cross-reference validation.

**Critical Finding**: File rename from `demo-templates.json` → `templates.json` was NOT reflected in source code or tests, causing **runtime failures**.

---

## Critical Issues (Blocking)

### 1. File Rename Not Reflected in Code

**Severity: BLOCKING** - Code will fail at runtime

| File | Line | Issue |
|------|------|-------|
| `src/features/project-creation/ui/helpers/templateLoader.ts` | 8 | Still imports `demo-templates.json` (doesn't exist) |
| `tests/unit/templates/demoTemplates.test.ts` | 49 | References non-existent file path |
| `src/types/templates.ts` | 57 | Docs reference old filename |

**Why Tests Didn't Catch This:**
- Test file path references non-existent file but tests weren't run
- No integration test validates imports resolve
- No build/compile verification in CI

### 2. TypeScript Types Don't Match JSON Structure

`src/types/templates.ts` - `DemoTemplate` interface is **missing 3 fields**:

```typescript
// MISSING from types (but EXISTS in templates.json):
stack?: string;      // References stacks.json
brand?: string;      // References brands.json
source?: GitSource;  // Git repository configuration
```

### 3. No Cross-Reference Validation

- Templates reference `stack: "headless-paas"` but **no test verifies** this ID exists in `stacks.json`
- Templates reference `brand: "citisignal"` but **no test verifies** this ID exists in `brands.json`

---

## Test Coverage Analysis by Area

### New Data Model (templates/stacks/brands)

| File | Status | Notes |
|------|--------|-------|
| `tests/templates/brands.test.ts` | ✅ Good | 143 lines, validates structure |
| `tests/templates/stacks.test.ts` | ✅ Good | 178 lines, validates component refs |
| `tests/unit/templates/demoTemplates.test.ts` | ⚠️ Broken | References non-existent file |
| `tests/templates/templates.test.ts` | ❌ Missing | **No tests for new templates.json** |

**Coverage: ~40%** - Cross-references and new fields unvalidated

### Component Updater Logic

| Functionality | Tested? | Notes |
|---------------|---------|-------|
| Shell parameter for unzip | ✅ Yes | |
| Timeout handling | ✅ Yes | |
| PATH enhancement | ✅ Yes | |
| Snapshot creation | ❌ No | Critical for rollback |
| Automatic rollback | ❌ No | Bug protection |
| Snapshot cleanup | ❌ No | |
| .env file preservation | ❌ No | User config protection |
| Version tracking | ❌ No | Only after verification |
| Concurrent update lock | ❌ No | Prevents race conditions |
| Error formatting | ❌ No | User-friendly messages |

**Coverage: ~40-50%** - Happy path only, failure scenarios untested

### Node Version Management (fnm)

| Functionality | Tested? | Notes |
|---------------|---------|-------|
| fnm list with shell option | ✅ Yes | |
| Installed version detection | ✅ Yes | |
| fnm failure handling | ✅ Yes | |
| fnm path discovery (4 locations) | ❌ No | Apple Silicon, Intel, manual, self-install |
| PATH caching (cachedFnmPath) | ❌ No | Performance optimization |
| FNM_DIR env var support | ❌ No | Bug Fix #7 untested |
| `which` fallback command | ❌ No | |
| Per-node-version prerequisites | ❌ No | Adobe CLI per version |
| Version satisfaction checking | ❌ No | |

**Coverage: ~50-60%** - Path discovery and env var support untested

---

## Quantified Gaps

### Overall Test-to-Source Ratio

| Area | Source Files | Test Files | Ratio | Assessment |
|------|--------------|------------|-------|------------|
| **Total** | 426 | 455 | 1.07x | Appears healthy |
| **Core Infrastructure** | 150 | 78 | 0.52x | ⚠️ UNDER-TESTED |
| **Updates Feature** | ~20 | 8 | 0.40x | ⚠️ MINIMAL |
| **Components Feature** | ~30 | ~10 | 0.33x | ⚠️ MINIMAL |
| **Prerequisites** | ~25 | 32 | 1.28x | ✅ GOOD |
| **Authentication** | ~20 | ~25 | 1.25x | ✅ GOOD |

### Data Model Coverage

| Data Model File | Lines | Test Coverage |
|-----------------|-------|---------------|
| `brands.json` | 50 | ✅ Well-tested |
| `stacks.json` | 54 | ✅ Well-tested |
| `templates.json` | 107 | ❌ New fields NOT tested |
| Type definitions | 65 | ❌ Missing 3 fields |

---

## Root Cause Analysis: Why TDD Failed

### 1. File Rename Without Coordination
- `demo-templates.json` renamed to `templates.json`
- Source import NOT updated
- Tests reference non-existent file
- **No build-time validation** of imports

### 2. Tests Written AFTER Implementation
- `brands.test.ts` and `stacks.test.ts` created AFTER JSON files
- `demoTemplates.test.ts` tests OLD model structure
- No TDD cycle for new fields (`stack`, `brand`, `source`)

### 3. TypeScript Types Not Validated Against JSON
- `DemoTemplate` type definition outdated
- No compile-time validation types match actual JSON structure
- Tests use old type definitions → false sense of coverage

### 4. Fragmented Test Organization
- Node version logic split across `environmentSetup.ts` and `installHandler.ts`
- Tests in different files with different context
- Features added (FNM_DIR support) without corresponding tests

### 5. No Cross-Reference Validation
- Templates reference stacks/brands by ID
- No tests verify referenced IDs actually exist
- Typo in stack ID wouldn't be caught

---

## Remediation Priority

### Immediate (This Session) - BLOCKING FIXES

1. **Fix import path** in `templateLoader.ts:8`
   - Change: `demo-templates.json` → `templates.json`

2. **Fix test path** in `demoTemplates.test.ts:49`
   - Change: `demo-templates.json` → `templates.json`

3. **Update TypeScript types** in `src/types/templates.ts`
   - Add: `stack?: string`
   - Add: `brand?: string`
   - Add: `source?: GitSource`
   - Add: `submodules?: Record<string, SubmoduleConfig>`

### High Priority (This Sprint)

4. **Create `tests/templates/templates.test.ts`**
   - Validate structure matches schema
   - Cross-reference validation (stack IDs exist, brand IDs exist)
   - Git source URL validation

5. **Expand `componentUpdater.test.ts`**
   - Snapshot creation test
   - Rollback on failure test
   - .env preservation test
   - Concurrent lock test

6. **Expand fnm tests**
   - Path discovery for all 4 locations
   - FNM_DIR env var support
   - PATH caching mechanism

### Medium Priority (Next 2 Weeks)

7. **Update `templateLoader.test.ts`**
   - Update fixtures to use new structure
   - Add stack/brand reference validation

8. **Add build-time validation**
   - TypeScript types vs JSON structure
   - Import path resolution verification

---

## Process Improvements

| Gap | Recommended Fix |
|-----|-----------------|
| File renames break imports | Pre-commit hook to verify imports resolve |
| Types out of sync with JSON | JSON schema → TypeScript type generator |
| Cross-references unvalidated | Contract tests between features |
| Tests written after implementation | Enforce TDD in PR reviews |
| Fragmented test organization | Test file per source file convention |

---

## Key Takeaways

1. **Overall ratio (1.07x) is misleading** - Critical areas are under-tested
2. **File rename created silent failure** - No detection until runtime
3. **New data model only 40% covered** - Cross-references not validated
4. **Component updater 40-50% covered** - Failure paths untested
5. **fnm logic 50-60% covered** - Path discovery and env vars untested

**The point of TDD is valid** - but TDD wasn't followed for the recent changes. Tests were written after implementation using old structures.

---

## Relevant Files

### Critical (Need Immediate Updates)
- `src/features/project-creation/ui/helpers/templateLoader.ts:8` - Broken import
- `tests/unit/templates/demoTemplates.test.ts:49` - Broken path reference
- `src/types/templates.ts` - Missing type fields

### Data Model
- `templates/templates.json` - New template structure
- `templates/brands.json` - Brand definitions
- `templates/stacks.json` - Stack definitions
- `templates/components.json` - Component definitions (v3.0.0)

### Tests
- `tests/templates/brands.test.ts` - Good coverage
- `tests/templates/stacks.test.ts` - Good coverage
- `tests/features/project-creation/ui/helpers/templateLoader.test.ts` - Needs update
- `tests/features/updates/services/componentUpdater.test.ts` - Needs expansion

### Node Version Management
- `src/core/shell/environmentSetup.ts` - fnm path discovery
- `src/features/prerequisites/handlers/installHandler.ts` - Version installation
- `tests/core/shell/environmentSetup-nodeVersion.test.ts` - Needs expansion
- `tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts` - Needs expansion
