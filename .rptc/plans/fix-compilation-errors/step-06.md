# Step 6: Fix Missing/Nonexistent Module Imports

## Purpose

Resolve the remaining ~550-560 compilation errors after Steps 4-5, focusing on:
1. **ComponentManager casing issue** causing duplicate file name detection
2. **Type errors in ComponentRegistryManager** (property mismatches with component types)
3. **Remaining @/core/* import errors** in components module
4. **Command handler signature mismatches** in commandManager and projectDashboardWebview
5. **Type definition completeness** (missing exports, interface mismatches)

**Why This Step:**
- Addresses the largest remaining error categories after @/core/* bulk fixes in Steps 4-5
- Fixes critical file system casing issue blocking components module compilation
- Resolves type safety issues preventing strict TypeScript compilation
- Reduces error count from ~560 to <100 (estimated 85% reduction)

**Why These Modules:**
- **Components Module**: Casing issue + extensive type mismatches + @/core/* imports (highest error concentration)
- **Commands Module**: Handler signature mismatches preventing compilation
- **Type System**: Missing exports and interface mismatches across modules

**Note**: Authentication module is handled in Step 4; this step focuses on components, commands, and remaining type issues.

---

## Prerequisites

- [x] Step 1 complete: Error analysis and categorization (644 total errors)
- [x] Step 2 complete: Import mapping created
- [x] Step 3 complete: Missing exports added to shared infrastructure
- [x] Step 4 complete: Authentication and prerequisites modules fixed (planned)
- [x] Step 5 complete: Mesh, dashboard, lifecycle, updates modules fixed (planned)

**Verify Before Starting:**
```bash
# Confirm current error count
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Expected: ~550-560 errors

# Verify Steps 4-5 modules are clean (if executed)
npx tsc --noEmit 2>&1 | grep -E "features/(mesh|dashboard|lifecycle|updates)" | grep "@/core" | wc -l
# Expected: 0 errors (if Steps 4-5 completed)
```

---

## Tests to Write First

### Compilation Tests (File Casing)

- [ ] **Test: ComponentManager casing issue resolved**
  - **Given:** ComponentManager.ts file with consistent casing
  - **When:** Running `npx tsc --noEmit` on components module
  - **Then:** No TS1149 "File name differs only in casing" error
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "TS1149"`

### Compilation Tests (Remaining @/core/* Imports)

**Note**: Authentication module @/core/* imports are tested in Step 4.

- [ ] **Test: Components module has no @/core/* errors**
  - **Given:** Components service files with corrected imports
  - **When:** Running `npx tsc --noEmit` on components module
  - **Then:** Zero TS2307 errors in `src/features/components/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/components" | grep "@/core" | wc -l`

### Compilation Tests (Type Errors)

- [ ] **Test: ComponentRegistryManager type properties match**
  - **Given:** ComponentRegistryManager with correct property names
  - **When:** Running `npx tsc --noEmit` on ComponentRegistryManager
  - **Then:** No TS2551 "Property does not exist, did you mean..." errors
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "ComponentRegistryManager" | grep "TS2551"`

- [ ] **Test: ComponentRegistry interface matches implementation**
  - **Given:** ComponentRegistry type definition with all properties
  - **When:** Running `npx tsc --noEmit` on ComponentRegistryManager
  - **Then:** No TS2339 "Property does not exist" or TS2353 "Object literal may only specify" errors
  - **Verification:** `npx tsc --noEmit 2>&1 | grep -E "ComponentRegistry|ComponentRegistryManager" | grep -E "TS2339|TS2353"`

### Compilation Tests (Command Handler Signatures)

- [ ] **Test: commandManager.ts has no signature mismatch errors**
  - **Given:** commandManager with correct registerCommand signature
  - **When:** Running `npx tsc --noEmit`
  - **Then:** No TS2554 "Expected 0 arguments, but got 4" errors
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "commandManager.ts" | grep "TS2554"`

- [ ] **Test: projectDashboardWebview.ts handler calls match registry**
  - **Given:** DashboardHandlerRegistry with correct method signatures
  - **When:** Running `npx tsc --noEmit`
  - **Then:** No TS2339 "Property does not exist" errors for registry methods
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "projectDashboardWebview.ts" | grep "TS2339"`

### Integration Verification

- [ ] **Test: Overall error count reduced by 85%**
  - **Given:** All imports and type errors fixed
  - **When:** Running full TypeScript compilation
  - **Then:** Error count reduced from ~560 to <100 (~85% reduction)
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`

- [ ] **Test: No new errors introduced in previously fixed modules**
  - **Given:** Fixes in authentication and components
  - **When:** Running compilation on all features
  - **Then:** No regression in mesh, dashboard, lifecycle, updates (if Steps 4-5 completed)
  - **Verification:** `npx tsc --noEmit 2>&1 | grep -E "features/(mesh|dashboard|lifecycle|updates)" | wc -l`

---

## Files to Create/Modify

**Note**: Authentication module files are handled in Step 4. This step focuses on components, commands, and type system fixes.

### Components Module Files (~12 files)

**Services (5 files - casing + @/core/* + type errors):**
- [ ] **CRITICAL:** Rename `src/features/components/services/componentManager.ts` → `ComponentManager.ts`
  - **OR:** Update all imports to use lowercase `componentManager`
  - **Issue:** TS1149 file name differs only in casing
  - **Decision needed:** Standardize on PascalCase or camelCase

- [ ] `src/features/components/services/ComponentManager.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`
  - Fix: `@/types/loggerTypes` → Verify actual location or update type reference

- [ ] `src/features/components/services/ComponentRegistryManager.ts`
  - Fix: Property name mismatches:
    - `frontends` → `frontend` (line 75)
    - `backends` → `backend` (line 80)
    - `appBuilderApps` → `appBuilder` (line 85)
  - Fix: Missing properties in ComponentRegistry interface:
    - Add `integrations` property (line 90)
    - Add `infrastructure` property (lines 103, 104, 122, 313, 314)
  - Fix: Unknown type narrowing for `comp` (lines 108-112)
  - Fix: Type assertion for spread operation (line 106)

- [ ] `src/features/components/services/componentRegistry.ts`
  - Verify and fix any @/core/* imports

- [ ] `src/features/components/services/types.ts`
  - Verify type definitions match usage

**Providers (1 file):**
- [ ] `src/features/components/providers/componentTreeProvider.ts`
  - Fix: `@/core/state` → `@/shared/state/stateManager`
  - Fix: Property access on empty object type (lines 67-71)

**UI (2 files):**
- [ ] `src/features/components/ui/steps/ComponentSelectionStep.tsx`
  - Fix: Property access on empty object (frontend, backend, dependencies, services)
  - Add proper type definitions for component groups

- [ ] `src/features/components/ui/steps/ComponentConfigStep.tsx`
  - Verify and fix any type errors

**Handlers (2 files):**
- [ ] `src/features/components/handlers/componentHandler.ts`
  - Verify and fix any @/core/* imports

- [ ] `src/features/components/handlers/componentHandlers.ts`
  - Verify and fix any @/core/* imports

**Index (1 file):**
- [ ] `src/features/components/index.ts`
  - Fix: ComponentManager import casing

**Types Definition (1 file - missing properties):**
- [ ] `src/types/index.ts` or component type definition file
  - Add missing properties to ComponentRegistry interface:
    - `integrations?: string[]`
    - `infrastructure?: ComponentDefinition[]`
  - Update selectionGroups type to include all used properties

### Commands Module Files (~3 files)

**Command Manager (1 file - signature mismatches):**
- [ ] `src/commands/commandManager.ts`
  - Fix: Lines 183, 192, 250 - registerCommand signature mismatch
  - **Issue:** Calling with 4 arguments when expecting 0
  - **Investigation needed:** Check VS Code API or wrapper function signature

**Dashboard Command (1 file - registry method calls):**
- [ ] `src/commands/projectDashboardWebview.ts`
  - Fix: Line 90 - `getRegisteredTypes()` does not exist on DashboardHandlerRegistry
  - Fix: Line 95 - `handle()` does not exist on DashboardHandlerRegistry
  - **Investigation needed:** Verify DashboardHandlerRegistry interface

**Dashboard Handler Registry (1 file - method signatures):**
- [ ] `src/features/dashboard/handlers/HandlerRegistry.ts`
  - Add missing methods: `getRegisteredTypes()`, `handle()`
  - Or update callers to use correct registry interface

**Total Files:** ~15 files to modify (authentication files handled in Step 4)

---

## Implementation Details

### RED Phase: Write Failing Tests

**Create Compilation Test Script:**

```bash
# Create test script to verify Step 6 compilation errors
cat > .rptc/plans/fix-compilation-errors/verify-step-6.sh << 'EOF'
#!/bin/bash

echo "=== Step 6 Compilation Verification ==="
echo ""

# Test 1: ComponentManager casing
echo "Test 1: ComponentManager casing issue..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "TS1149" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No file casing errors"
else
  echo "❌ FAIL: $ERRORS file casing errors"
fi
echo ""

# Test 2: Components @/core/* imports (auth handled in Step 4)
echo "Test 3: Components module @/core/* imports..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/components" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in components"
else
  echo "❌ FAIL: $ERRORS @/core errors in components"
fi
echo ""

# Test 4: ComponentRegistryManager type errors
echo "Test 4: ComponentRegistryManager type properties..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "ComponentRegistryManager" | grep -E "TS2551|TS2339|TS2353" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No type property errors"
else
  echo "❌ FAIL: $ERRORS type property errors"
fi
echo ""

# Test 5: Implicit any errors (reduced scope to remaining files)
echo "Test 6: Implicit any parameter errors..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "TS7006" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No implicit any errors"
else
  echo "❌ FAIL: $ERRORS implicit any errors"
fi
echo ""

# Test 7: Command signature errors
echo "Test 7: Command handler signature errors..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep -E "commandManager|projectDashboardWebview" | grep -E "TS2554|TS2339" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No command signature errors"
else
  echo "❌ FAIL: $ERRORS command signature errors"
fi
echo ""

# Test 8: Total error reduction
echo "Test 8: Overall error count reduction..."
TOTAL=$(npx tsc --noEmit 2>&1 | grep "error TS" | wc -l)
echo "Current errors: $TOTAL (target: <100)"
if [ "$TOTAL" -lt 100 ]; then
  echo "✅ PASS: Error count below 100"
elif [ "$TOTAL" -lt 200 ]; then
  echo "⚠️  PROGRESS: Significant reduction, but not complete"
else
  echo "❌ FAIL: Error count still too high"
fi

echo ""
echo "=== Summary ==="
echo "Total errors: $TOTAL / 644 (baseline)"
REDUCTION=$(( (644 - TOTAL) * 100 / 644 ))
echo "Reduction: ${REDUCTION}%"
EOF

chmod +x .rptc/plans/fix-compilation-errors/verify-step-6.sh
```

**Run Initial Test (Expected: FAIL):**
```bash
./.rptc/plans/fix-compilation-errors/verify-step-6.sh
# Expected output: All tests FAIL with current errors
```

---

### GREEN Phase: Minimal Implementation

**Implementation Order: Fix Blockers First**

#### Phase 1: Fix ComponentManager Casing Issue (CRITICAL - 5 min)

**Decision Required:** Standardize on PascalCase or camelCase for file naming.

**Option A: Rename to PascalCase (Recommended)**
```bash
# Rename file to match imports
git mv src/features/components/services/componentManager.ts \
     src/features/components/services/ComponentManager.ts

# Update any lowercase imports
# This matches the existing ComponentRegistryManager.ts pattern
```

**Option B: Update Imports to camelCase**
```bash
# Keep file as componentManager.ts
# Update all PascalCase imports to camelCase
# Search: '@/features/components/services/ComponentManager'
# Replace: '@/features/components/services/componentManager'
```

**Verify:**
```bash
npx tsc --noEmit 2>&1 | grep "TS1149"
# Expected: 0 errors
```

---

#### Phase 2: Fix ComponentRegistryManager Type Errors (15 min)

**Step 2.1: Fix Property Name Mismatches**

Open `src/features/components/services/ComponentRegistryManager.ts`:

```typescript
// Line 75: frontends → frontend
const frontends = raw.selectionGroups?.frontend || [];
// Change to:
const frontend = raw.selectionGroups?.frontend || [];

// Line 80: backends → backend
const backends = raw.selectionGroups?.backend || [];
// Change to:
const backend = raw.selectionGroups?.backend || [];

// Line 85: appBuilderApps → appBuilder
const appBuilderApps = raw.selectionGroups?.appBuilder || [];
// Change to:
const appBuilder = raw.selectionGroups?.appBuilder || [];

// Update variable usage throughout function
```

**Step 2.2: Add Missing Properties to ComponentRegistry Type**

Check where `ComponentRegistry` interface is defined (likely `src/types/index.ts` or component types file):

```typescript
// Add missing properties
export interface ComponentRegistry {
    // Existing properties...
    frontend?: TransformedComponentDefinition[];
    backend?: TransformedComponentDefinition[];
    dependencies?: TransformedComponentDefinition[];
    externalSystems?: TransformedComponentDefinition[];
    appBuilder?: TransformedComponentDefinition[];

    // ADD THESE:
    integrations?: TransformedComponentDefinition[];
    infrastructure?: TransformedComponentDefinition[];
}
```

**Step 2.3: Fix Unknown Type Narrowing**

In `ComponentRegistryManager.ts` lines 108-112:

```typescript
// BEFORE (unknown type):
const comp = infrastructure[compName];
if (comp.id) { ... }

// AFTER (type guard):
const comp = infrastructure[compName];
if (comp && typeof comp === 'object' && 'id' in comp) {
    const componentDef = comp as RawComponentDefinition;
    // Use componentDef safely
}
```

**Verify:**
```bash
npx tsc --noEmit 2>&1 | grep "ComponentRegistryManager"
# Expected: Significantly fewer errors
```

---

#### Phase 3: Fix Remaining @/core/* Imports (15 min)

**Note**: Authentication module @/core/* imports are handled in Step 4.

**Components Module (2 files with @/core/*):**

```bash
code src/features/components/services/ComponentManager.ts
# Fix: @/core/di → @/services/serviceLocator
# Fix: @/types/loggerTypes → Verify actual logger type location

code src/features/components/providers/componentTreeProvider.ts
# Fix: @/core/state → @/shared/state/stateManager
```

**Verify:**
```bash
./.rptc/plans/fix-compilation-errors/verify-step-6.sh | grep "@/core"
# Expected: All @/core/* tests passing
```

---

#### Phase 4: Fix Command Handler Signature Errors (15 min)

**Investigation Step 1: Check commandManager.ts**

Open `src/commands/commandManager.ts` lines 183, 192, 250:

```typescript
// Identify what registerCommand is being called
// Example issue:
vscode.commands.registerCommand(id, callback, thisArg, disposables)
//                                ^    ^        ^        ^
//                               arg1  arg2    arg3     arg4

// But signature expects:
registerCommand(commandId: string, callback: (...args: any[]) => any): Disposable
//              ^                  ^
//             arg1              arg2 (only 2 args!)
```

**Fix:**
```typescript
// BEFORE (if extra args):
const disposable = vscode.commands.registerCommand(id, callback, thisArg, disposables);

// AFTER:
const disposable = vscode.commands.registerCommand(id, callback.bind(thisArg));
// Add disposables to context.subscriptions separately if needed
```

**Investigation Step 2: Check DashboardHandlerRegistry**

Open `src/features/dashboard/handlers/HandlerRegistry.ts`:

```typescript
// Add missing methods if not present:
export class DashboardHandlerRegistry extends BaseHandlerRegistry {
    // ... existing code ...

    // ADD IF MISSING:
    getRegisteredTypes(): string[] {
        return Array.from(this.handlers.keys());
    }

    async handle(type: string, payload: any): Promise<any> {
        const handler = this.handlers.get(type);
        if (!handler) {
            throw new Error(`No handler registered for type: ${type}`);
        }
        return await handler(payload);
    }
}
```

**OR Update Callers in projectDashboardWebview.ts:**

```typescript
// BEFORE (line 90):
const types = registry.getRegisteredTypes();

// AFTER (if method doesn't exist, use alternative):
const types = registry.getHandlerTypes(); // Use correct method name

// BEFORE (line 95):
const result = await registry.handle(type, payload);

// AFTER:
const result = await registry.handleMessage(type, payload); // Use correct method
```

**Verify:**
```bash
./.rptc/plans/fix-compilation-errors/verify-step-6.sh | grep -E "commandManager|projectDashboardWebview"
# Expected: All command signature tests passing
```

---

#### Phase 5: Verify Type Exports (5 min)

**Note**: DataResult export is handled in Step 3. Verify it's working correctly.

**Verify type exports:**
```bash
npx tsc --noEmit 2>&1 | grep "DataResult"
# Expected: 0 errors (fixed in Step 3)

# Check for any remaining missing type exports
npx tsc --noEmit 2>&1 | grep "has no exported member"
```

---

**Final Verification:**
```bash
# Run full test suite
./.rptc/plans/fix-compilation-errors/verify-step-6.sh

# Check overall error count
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Target: <100 errors (85%+ reduction from 644)
```

---

### REFACTOR Phase: Improve Code Quality

**Import Organization:**

For each modified file:

1. **Alphabetize imports** by path
2. **Group imports** by category:
   ```typescript
   // External dependencies
   import * as vscode from 'vscode';

   // Shared infrastructure
   import { debugLogger } from '@/shared/logging/debugLogger';
   import { shellExecutor } from '@/shared/command-execution/shellExecutor';

   // Services
   import { ServiceLocator } from '@/services/serviceLocator';

   // Types
   import { DemoProject } from '@/types/project';
   import { DataResult } from '@/types/results';

   // Local imports
   import { localFunction } from './localModule';
   ```

3. **Remove unused imports**:
   ```bash
   # VS Code auto-fix
   # In each file: Cmd+Shift+P → "Organize Imports"
   ```

**Type Guard Consolidation:**

If multiple files need same type guards, extract to shared utility:

```typescript
// src/shared/utils/typeGuards.ts
export function hasProperty<K extends string>(
    obj: unknown,
    key: K
): obj is Record<K, unknown> {
    return obj !== null && typeof obj === 'object' && key in obj;
}

export function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}
```

**Code Quality Checks:**

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix

# Re-run compilation to ensure refactor didn't break anything
npx tsc --noEmit

# Final verification
./.rptc/plans/fix-compilation-errors/verify-step-6.sh
```

---

## Expected Outcome

After completing this step:

**Compilation Success:**
- ✅ ComponentManager casing issue resolved (TS1149 eliminated)
- ✅ All components module files compile without `@/core/*` errors
- ✅ ComponentRegistryManager type property errors fixed
- ✅ Command handler signature mismatches resolved
- ✅ Type exports verified (DataResult from Step 3)
- ✅ Overall TypeScript error count reduced from ~560 to <100 (~85% reduction)

**Module Verification:**
- ✅ Components module compiles cleanly (casing + types + imports all fixed)
- ✅ Commands module compiles cleanly (signature mismatches resolved)
- ✅ No regression in previously fixed modules (authentication, mesh, dashboard, lifecycle, updates, prerequisites)

**Quality Metrics:**
- ✅ Imports organized alphabetically and grouped by category
- ✅ Type guards extracted to shared utilities where reused
- ✅ No linting errors in modified files
- ✅ Consistent import patterns across all modules

**What Can Be Demonstrated:**
- Run extension with F5 → Components module loads without errors
- Dashboard opens and functions correctly
- Commands execute without signature errors
- Component selection and configuration works
- Compilation output shows <100 errors (down from 644)

---

## Acceptance Criteria

**Compilation Criteria:**
- [ ] Zero TS1149 "File name differs only in casing" errors
- [ ] Zero `@/core/*` import errors in `src/features/components/` (verified by grep)
- [ ] Zero TS2551/TS2339 property errors in ComponentRegistryManager
- [ ] Zero TS2554/TS2339 signature errors in commands module
- [ ] `npx tsc --noEmit` shows <100 total errors (target: 85%+ reduction from 644)
- [ ] DataResult type export verified working (fixed in Step 3)

**Testing Criteria:**
- [ ] Verification script shows all checks passing: `./.rptc/plans/fix-compilation-errors/verify-step-6.sh`
- [ ] Extension activates in debug mode (F5) without module resolution errors
- [ ] Components module loads and displays correctly
- [ ] Dashboard commands execute without errors
- [ ] No regression in authentication module (fixed in Step 4)

**Code Quality Criteria:**
- [ ] All imports alphabetized and grouped by category
- [ ] Type guards extracted to shared utilities (if reused 3+ times)
- [ ] No debug code (`console.log`, `debugger`) added
- [ ] `npm run lint` passes for modified files
- [ ] Import statements use consistent quote style (single quotes)

**Integration Criteria:**
- [ ] No circular dependency warnings in build output: `npm run build`
- [ ] All dynamic imports resolve correctly at runtime
- [ ] No runtime errors when accessing authentication, components, or commands features
- [ ] Type safety maintained (no `any` types except where explicitly needed)

**Documentation Criteria:**
- [ ] All file checkboxes marked complete in "Files to Create/Modify" section
- [ ] Verification script created and tested
- [ ] ComponentManager casing decision documented (PascalCase vs camelCase)
- [ ] Any missing type locations documented
- [ ] Any deviations from plan documented in implementation notes

---

## Dependencies from Other Steps

**Depends On:**
- **Step 1**: Error analysis provides error count baseline (644 errors)
- **Step 2**: Import mapping provides correct import paths
- **Step 3**: Missing exports added to shared infrastructure
- **Step 4**: Authentication and prerequisites baseline (if completed)
- **Step 5**: Mesh, dashboard, lifecycle, updates baseline (if completed)

**Enables:**
- **Step 7**: Final verification and edge case fixes (<100 errors → 0 errors)
- **Complete Refactor**: All core modules compiling, ready for final integration

---

## Estimated Time

**Total Time: 50-65 minutes** (reduced from 90-110 min due to authentication handled in Step 4)

**Breakdown:**
- RED Phase (test script creation): 5 minutes
- GREEN Phase (fixes):
  - Phase 1 (ComponentManager casing): 5 minutes
  - Phase 2 (ComponentRegistryManager types): 15 minutes
  - Phase 3 (Components @/core/* imports): 10 minutes
  - Phase 4 (Command signatures): 15 minutes
  - Phase 5 (Verify type exports): 5 minutes
  - **Subtotal**: 50 minutes
- REFACTOR Phase (import organization): 5 minutes
- Verification (compilation + manual testing): 10 minutes

**Contingency:**
- +10 minutes if ComponentManager casing requires extensive import updates
- +15 minutes if command signature fixes require deeper refactoring
- +10 minutes for manual extension testing (F5 debug)

**Total with Contingency: 100 minutes maximum (~1.7 hours)**

---

## Implementation Notes

**Tips for Success:**

1. **Fix casing issue FIRST**: ComponentManager casing blocks components module compilation
2. **Fix types before imports**: ComponentRegistryManager type errors affect multiple files
3. **Create type guards early**: Reusable type guards save time across multiple UI files
4. **Test after each phase**: Run verification script after each phase to catch regressions
5. **Document decisions**: Note PascalCase vs camelCase decision for future reference

**Common Pitfalls:**

- **Don't** rename ComponentManager file without updating all imports (or vice versa)
- **Don't** skip type narrowing in UI files (runtime errors will occur)
- **Don't** forget dynamic imports (search for `await import('@/core/` to find all)
- **Do** verify missing type locations before assuming they don't exist
- **Do** test authentication flow in F5 debug after fixing UI type guards

**Recovery Strategy:**

If error count doesn't decrease as expected:
1. Run verification script to identify which phase still has errors
2. Check for typos in import paths (case-sensitivity)
3. Verify type definitions match actual usage patterns
4. Manually inspect files with remaining errors for edge cases
5. Check git diff to ensure all intended changes were saved

**Investigation Notes:**

Document findings for missing items:
- `@/core/errors`: [ACTUAL LOCATION]
- `@/core/utils/promiseUtils`: [ACTUAL LOCATION]
- `@/types/adobe`: [ACTUAL LOCATION or CREATE]
- `@/types/loggerTypes`: [ACTUAL LOCATION]
- ComponentManager casing decision: [PascalCase ✓ / camelCase]

---

_This step is ready for TDD implementation. Fix casing issue first, then types, then imports, then strict mode errors systematically to achieve significant error reduction (<100 errors target)._
