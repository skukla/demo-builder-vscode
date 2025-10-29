# Step 4: Fix Core-to-Shared/Types Imports (Batch 1)

## Purpose

Apply import mapping corrections to authentication and prerequisites modules to resolve incorrect `@/core/*` imports. This batch focuses on two isolated modules for testing the fix approach before applying to remaining codebase.

**Why This Step:**
- Validates import mapping accuracy with isolated modules
- Reduces error count by ~30-40 (authentication has 18 errors, prerequisites has 15 errors)
- Tests compilation fix approach before broader application
- Ensures no runtime breaks in critical authentication/prerequisites flows

**Why These Modules First:**
- **Authentication**: Core module with clear dependency boundaries
- **Prerequisites**: Well-tested module (10 unit tests verify runtime correctness)
- Both have existing test coverage to catch regressions

---

## Prerequisites

- [x] Step 1 complete: Error analysis and categorization in `.rptc/plans/fix-compilation-errors/error-analysis.md`
- [x] Step 2 complete: Import mapping created in `.rptc/plans/fix-compilation-errors/import-mapping.md`
- [x] Step 3 complete: Missing exports added to shared infrastructure

**Verify Before Starting:**
```bash
# Confirm mapping file exists
cat .rptc/plans/fix-compilation-errors/import-mapping.md | grep "IMPORT CORRECTIONS"

# Confirm current error count baseline
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Expected: ~644 errors
```

---

## Tests to Write First

### Compilation Tests (Authentication Module)

- [ ] **Test: Authentication handlers compile without @/core/* errors**
  - **Given:** Authentication handler files with corrected imports
  - **When:** Running `npx tsc --noEmit` on authentication handlers
  - **Then:** No TS2307 "Cannot find module '@/core/*'" errors in `src/features/authentication/handlers/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/authentication/handlers" | grep "@/core"`

- [ ] **Test: Authentication services compile without @/core/* errors**
  - **Given:** Authentication service files with corrected imports
  - **When:** Running `npx tsc --noEmit` on authentication services
  - **Then:** No TS2307 errors in `src/features/authentication/services/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/authentication/services" | grep "@/core"`

- [ ] **Test: No type errors in authentication module**
  - **Given:** All authentication imports corrected
  - **When:** Compiling authentication module
  - **Then:** Only expected type errors (if any), no import resolution errors
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/authentication/" | grep -v "@/core" | wc -l`

### Compilation Tests (Prerequisites Module)

- [ ] **Test: Prerequisites services compile without @/core/* errors**
  - **Given:** PrerequisitesManager and cache manager with corrected imports
  - **When:** Running `npx tsc --noEmit` on prerequisites services
  - **Then:** No TS2307 errors in `src/features/prerequisites/services/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/prerequisites/services" | grep "@/core"`

- [ ] **Test: Prerequisites handlers compile without @/core/* errors**
  - **Given:** Prerequisites handler files with corrected imports
  - **When:** Running `npx tsc --noEmit` on prerequisites handlers
  - **Then:** No TS2307 errors in `src/features/prerequisites/handlers/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/prerequisites/handlers" | grep "@/core"`

- [ ] **Test: Prerequisites index file compiles successfully**
  - **Given:** Prerequisites barrel export with corrected imports
  - **When:** Compiling `src/features/prerequisites/index.ts`
  - **Then:** No import resolution errors
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/prerequisites/index.ts"`

### Unit Test Verification

- [ ] **Test: Authentication unit tests pass**
  - **Given:** Import corrections applied to authentication module
  - **When:** Running authentication unit tests
  - **Then:** All tests pass (no runtime import errors)
  - **Command:** `npm test -- --testPathPattern=authentication`
  - **Expected:** ~5 tests passing

- [ ] **Test: Prerequisites unit tests pass**
  - **Given:** Import corrections applied to prerequisites module
  - **When:** Running prerequisites unit tests (npmFlags, npmFallback, PrerequisitesManager)
  - **Then:** All 10 tests pass without runtime errors
  - **Command:** `npm test -- --testPathPattern=prerequisites`
  - **Expected:** 10 tests passing (5 npmFlags + 5 npmFallback + manager tests)

### Integration Verification

- [ ] **Test: No circular dependency warnings**
  - **Given:** Corrected imports in both modules
  - **When:** Building extension with webpack
  - **Then:** No circular dependency warnings for authentication/prerequisites
  - **Verification:** `npm run build 2>&1 | grep -i "circular" | grep -E "(authentication|prerequisites)"`

- [ ] **Test: Dynamic imports resolve correctly**
  - **Given:** ServiceLocator imports in authentication/prerequisites
  - **When:** Extension activates and loads services
  - **Then:** No runtime module resolution errors in activation logs
  - **Note:** Manual verification during F5 debug session

- [ ] **Test: Compilation error reduction verified**
  - **Given:** All imports fixed in both modules
  - **When:** Running full TypeScript compilation
  - **Then:** Error count reduced by 30-40 (from ~644 to ~610)
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`

---

## Files to Create/Modify

### Authentication Module Files (8 files)

**Handlers (2 files):**
- [ ] `src/features/authentication/handlers/projectHandlers.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `@/core/validation` → `@/shared/validation/securityValidation`

- [ ] `src/features/authentication/handlers/workspaceHandlers.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `@/core/validation` → `@/shared/validation/securityValidation`

**Services (6 files):**
- [ ] `src/features/authentication/services/adobeEntityService.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `@/core/utils/promiseUtils` → `@/shared/utils/promiseUtils`

- [ ] `src/features/authentication/services/adobeSDKClient.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

- [ ] `src/features/authentication/services/authCacheManager.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

- [ ] `src/features/authentication/services/authenticationService.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `@/core/shell` → `@/shared/command-execution/shellExecutor`

- [ ] `src/features/authentication/services/organizationValidator.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

- [ ] `src/features/authentication/services/tokenManager.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

### Prerequisites Module Files (4 files)

**Services (2 files):**
- [ ] `src/features/prerequisites/services/PrerequisitesManager.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `@/core/shell` → `@/shared/command-execution/shellExecutor`
  - Fix: `@/core/utils/promiseUtils` → `@/shared/utils/promiseUtils`

- [ ] `src/features/prerequisites/services/prerequisitesCacheManager.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

**Handlers (3 files):**
- [ ] `src/features/prerequisites/handlers/checkHandler.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

- [ ] `src/features/prerequisites/handlers/installHandler.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

- [ ] `src/features/prerequisites/handlers/shared.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

**Total Files:** 12 files to modify

---

## Implementation Details

### RED Phase: Write Failing Tests

**Create Compilation Test Script:**

```bash
# Create test script to verify compilation errors
cat > .rptc/plans/fix-compilation-errors/verify-step-4.sh << 'EOF'
#!/bin/bash

echo "=== Step 4 Compilation Verification ==="
echo ""

# Test 1: Authentication handlers
echo "Test 1: Authentication handlers compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/authentication/handlers" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in authentication handlers"
else
  echo "❌ FAIL: $ERRORS @/core errors in authentication handlers"
fi
echo ""

# Test 2: Authentication services
echo "Test 2: Authentication services compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/authentication/services" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in authentication services"
else
  echo "❌ FAIL: $ERRORS @/core errors in authentication services"
fi
echo ""

# Test 3: Prerequisites services
echo "Test 3: Prerequisites services compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/prerequisites/services" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in prerequisites services"
else
  echo "❌ FAIL: $ERRORS @/core errors in prerequisites services"
fi
echo ""

# Test 4: Prerequisites handlers
echo "Test 4: Prerequisites handlers compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/prerequisites/handlers" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in prerequisites handlers"
else
  echo "❌ FAIL: $ERRORS @/core errors in prerequisites handlers"
fi
echo ""

# Test 5: Total error reduction
echo "Test 5: Overall error count..."
TOTAL=$(npx tsc --noEmit 2>&1 | grep "error TS" | wc -l)
echo "Current errors: $TOTAL (target: ~610 or fewer)"
if [ "$TOTAL" -le 610 ]; then
  echo "✅ PASS: Error count reduced to acceptable level"
else
  echo "⚠️  PENDING: Error count still above target"
fi

echo ""
echo "=== Unit Tests ==="
npm test -- --testPathPattern=authentication --silent
npm test -- --testPathPattern=prerequisites --silent
EOF

chmod +x .rptc/plans/fix-compilation-errors/verify-step-4.sh
```

**Run Initial Test (Expected: FAIL):**
```bash
./.rptc/plans/fix-compilation-errors/verify-step-4.sh
# Expected output: All tests FAIL with @/core import errors
```

---

### GREEN Phase: Minimal Implementation

**Systematic Import Replacement Process:**

For each file, follow this procedure:

1. **Open file** in editor
2. **Identify @/core/* imports** using find/replace or manual inspection
3. **Apply mapping** from `import-mapping.md`:
   ```typescript
   // BEFORE (incorrect):
   import { debugLogger } from '@/core/logging/debugLogger';

   // AFTER (correct):
   import { debugLogger } from '@/shared/logging/debugLogger';
   ```
4. **Save file**
5. **Verify compilation** for that specific file:
   ```bash
   npx tsc --noEmit 2>&1 | grep "path/to/file.ts"
   ```
6. **Mark checkbox complete** in Files to Create/Modify section above

**Common Import Replacements (from import-mapping.md):**

| Incorrect Import | Correct Import |
|-----------------|----------------|
| `@/core/logging/debugLogger` | `@/shared/logging/debugLogger` |
| `@/core/shell/shellExecutor` | `@/shared/command-execution/shellExecutor` |
| `@/core/validation/securityValidation` | `@/shared/validation/securityValidation` |
| `@/core/utils/promiseUtils` | `@/shared/utils/promiseUtils` |

**Implementation Order:**

**Phase 1: Authentication Handlers (2 files, ~5 min)**
```bash
# Fix projectHandlers.ts
code src/features/authentication/handlers/projectHandlers.ts
# Replace: @/core/logging → @/shared/logging
# Replace: @/core/validation → @/shared/validation
# Save and verify

# Fix workspaceHandlers.ts
code src/features/authentication/handlers/workspaceHandlers.ts
# Replace: @/core/logging → @/shared/logging
# Replace: @/core/validation → @/shared/validation
# Save and verify
```

**Phase 2: Authentication Services (6 files, ~15 min)**
```bash
# Fix each service file systematically
for file in adobeEntityService adobeSDKClient authCacheManager authenticationService organizationValidator tokenManager; do
  code src/features/authentication/services/${file}.ts
  # Apply import mapping
  # Save and verify
done
```

**Phase 3: Prerequisites Services (2 files, ~5 min)**
```bash
# Fix PrerequisitesManager.ts (multiple imports)
code src/features/prerequisites/services/PrerequisitesManager.ts
# Replace: @/core/logging → @/shared/logging
# Replace: @/core/shell → @/shared/command-execution
# Replace: @/core/utils/promiseUtils → @/shared/utils/promiseUtils
# Save and verify

# Fix prerequisitesCacheManager.ts
code src/features/prerequisites/services/prerequisitesCacheManager.ts
# Replace: @/core/logging → @/shared/logging
# Save and verify
```

**Phase 4: Prerequisites Handlers (3 files, ~10 min)**
```bash
# Fix handler files
for file in checkHandler installHandler shared; do
  code src/features/prerequisites/handlers/${file}.ts
  # Replace: @/core/logging → @/shared/logging
  # Save and verify
done
```

**Verification After Each Phase:**
```bash
# Run test script after each phase
./.rptc/plans/fix-compilation-errors/verify-step-4.sh

# Expected progression:
# After Phase 1: Authentication handlers ✅
# After Phase 2: Authentication services ✅
# After Phase 3: Prerequisites services ✅
# After Phase 4: Prerequisites handlers ✅, error count ~610
```

---

### REFACTOR Phase: Improve Code Quality

**Import Organization:**

For each modified file:

1. **Alphabetize imports** by path:
   ```typescript
   // BEFORE:
   import { debugLogger } from '@/shared/logging/debugLogger';
   import { securityValidation } from '@/shared/validation/securityValidation';
   import { shellExecutor } from '@/shared/command-execution/shellExecutor';

   // AFTER (alphabetical):
   import { shellExecutor } from '@/shared/command-execution/shellExecutor';
   import { debugLogger } from '@/shared/logging/debugLogger';
   import { securityValidation } from '@/shared/validation/securityValidation';
   ```

2. **Group imports** by category:
   ```typescript
   // External dependencies
   import * as vscode from 'vscode';

   // Shared infrastructure
   import { debugLogger } from '@/shared/logging/debugLogger';
   import { shellExecutor } from '@/shared/command-execution/shellExecutor';

   // Types
   import { DemoProject } from '@/types/project';

   // Local imports
   import { localFunction } from './localModule';
   ```

3. **Remove unused imports** (if any):
   ```bash
   # VS Code auto-fix
   # In each file: Cmd+Shift+P → "Organize Imports"
   ```

**Code Quality Checks:**

```bash
# Run linter to catch style issues
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix

# Re-run compilation to ensure refactor didn't break anything
npx tsc --noEmit
```

---

## Expected Outcome

After completing this step:

**Compilation Success:**
- ✅ All 8 authentication module files compile without `@/core/*` errors
- ✅ All 4 prerequisites module files compile without `@/core/*` errors
- ✅ Overall TypeScript error count reduced from ~644 to ~610 (33 errors resolved)

**Runtime Verification:**
- ✅ Authentication unit tests pass (no runtime import errors)
- ✅ Prerequisites unit tests pass (10 tests, no runtime errors)
- ✅ Extension activates successfully in debug mode (F5)

**Quality Metrics:**
- ✅ No circular dependencies introduced in authentication/prerequisites
- ✅ Imports organized alphabetically and grouped by category
- ✅ No linting errors in modified files

**What Can Be Demonstrated:**
- Run extension with F5 → Authentication flows work correctly
- Prerequisites check/install works without errors
- Compilation output shows reduced error count

---

## Acceptance Criteria

**Compilation Criteria:**
- [ ] Zero `@/core/*` import errors in `src/features/authentication/` (verified by grep)
- [ ] Zero `@/core/*` import errors in `src/features/prerequisites/` (verified by grep)
- [ ] `npx tsc --noEmit` shows ≤610 total errors (baseline: 644, target reduction: 34 errors)
- [ ] No new TypeScript errors introduced in modified files

**Testing Criteria:**
- [ ] Authentication unit tests pass: `npm test -- --testPathPattern=authentication` (all tests green)
- [ ] Prerequisites unit tests pass: `npm test -- --testPathPattern=prerequisites` (10 tests green)
- [ ] Verification script shows all checks passing: `./.rptc/plans/fix-compilation-errors/verify-step-4.sh`

**Code Quality Criteria:**
- [ ] All imports alphabetized and grouped by category
- [ ] No debug code (`console.log`, `debugger`) added
- [ ] `npm run lint` passes for modified files
- [ ] Import statements use consistent quote style (single quotes)

**Integration Criteria:**
- [ ] Extension activates in debug mode (F5) without module resolution errors
- [ ] No circular dependency warnings in build output: `npm run build`
- [ ] Dynamic imports resolve correctly (ServiceLocator pattern works)

**Documentation Criteria:**
- [ ] All 12 file checkboxes marked complete in "Files to Create/Modify" section
- [ ] Verification script created and tested
- [ ] Any deviations from plan documented in implementation notes

---

## Dependencies from Other Steps

**Depends On:**
- **Step 1**: Error analysis (`error-analysis.md`) provides error count baseline and categorization
- **Step 2**: Import mapping (`import-mapping.md`) provides correct import paths for replacements
- **Step 3**: Missing exports added to shared infrastructure (enables imports to resolve)

**Enables:**
- **Step 5**: Provides validated import fix approach for remaining modules (mesh, project-creation, dashboard)
- **Step 6**: Reduces error count baseline for final type fixes
- **Step 7**: Ensures authentication/prerequisites stable for final integration testing

---

## Estimated Time

**Total Time: 45-60 minutes**

**Breakdown:**
- RED Phase (test script creation): 5 minutes
- GREEN Phase (import fixes):
  - Authentication handlers: 5 minutes
  - Authentication services: 15 minutes
  - Prerequisites services: 5 minutes
  - Prerequisites handlers: 10 minutes
  - **Subtotal**: 35 minutes
- REFACTOR Phase (import organization): 10 minutes
- Verification (unit tests + compilation): 10 minutes

**Contingency:**
- +15 minutes if unexpected type errors surface
- +10 minutes if circular dependencies need resolution
- +5 minutes for manual extension testing (F5 debug)

**Total with Contingency: 90 minutes maximum**

---

## Implementation Notes

**Tips for Success:**

1. **Work in small batches**: Fix one file at a time, verify compilation immediately
2. **Use find/replace carefully**: Search for `from '@/core/` to find all incorrect imports
3. **Keep mapping open**: Reference `import-mapping.md` frequently to avoid typos
4. **Test incrementally**: Run verification script after each phase, not just at end
5. **Watch for cascading errors**: Fixing one import may reveal other type errors

**Common Pitfalls:**

- **Don't** assume all `@/core/logging` imports are identical (check named exports)
- **Don't** skip verification after each file (catches errors early)
- **Don't** refactor logic during import fixes (stay focused on imports only)
- **Do** verify unit tests pass (compilation success ≠ runtime success)
- **Do** check for unused imports after fixes (may have leftover imports)

**Recovery Strategy:**

If error count doesn't decrease as expected:
1. Run verification script to identify which module still has errors
2. Re-check import mapping for that specific module
3. Manually inspect failing file for typos in import paths
4. Verify Step 3 exports exist for all referenced modules
5. Check for case-sensitivity issues in import paths

---

_This step is ready for TDD implementation. Run verification script first to establish RED state, then systematically fix imports to achieve GREEN state._
