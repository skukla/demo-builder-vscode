# Step 5: Fix Core-to-Shared/Types Imports (Batch 2)

## Purpose

Apply import mapping corrections to mesh, dashboard, lifecycle, and updates modules to resolve incorrect `@/core/*` imports. This batch covers the remaining feature modules before tackling UI components.

**Why This Step:**
- Resolves ~50-60 `@/core/*` import errors across 4 feature modules
- Covers critical features: mesh deployment, dashboard, project lifecycle, auto-updates
- Tests import fix approach on diverse modules (commands, handlers, services, UI)
- Reduces error count from ~610 to ~550-560

**Why These Modules:**
- **Mesh**: Critical deployment functionality with complex dependencies
- **Dashboard**: Mix of backend (handlers) and frontend (UI) imports
- **Lifecycle**: Simple module with clear boundaries (good for validation)
- **Updates**: Security-critical module with dynamic imports pattern

---

## Prerequisites

- [x] Step 1 complete: Error analysis and categorization
- [x] Step 2 complete: Import mapping created
- [x] Step 3 complete: Missing exports added to shared infrastructure
- [x] Step 4 complete: Authentication and prerequisites modules fixed (~34 errors resolved, ~610 remaining)

**Verify Before Starting:**
```bash
# Confirm Step 4 completed successfully
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
# Expected: ~610 errors

# Confirm Step 4 modules compile cleanly
npx tsc --noEmit 2>&1 | grep -E "features/(authentication|prerequisites)" | grep "@/core" | wc -l
# Expected: 0 errors
```

---

## Tests to Write First

### Compilation Tests (Mesh Module)

- [ ] **Test: Mesh commands compile without @/core/* errors**
  - **Given:** Mesh command files with corrected imports
  - **When:** Running `npx tsc --noEmit` on mesh commands
  - **Then:** No TS2307 "Cannot find module '@/core/*'" errors in `src/features/mesh/commands/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/mesh/commands" | grep "@/core"`

- [ ] **Test: Mesh services compile without @/core/* errors**
  - **Given:** Mesh service files with corrected imports
  - **When:** Running `npx tsc --noEmit` on mesh services
  - **Then:** No TS2307 errors in `src/features/mesh/services/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/mesh/services" | grep "@/core"`

- [ ] **Test: Mesh handlers compile without @/core/* errors**
  - **Given:** Mesh handler files with corrected imports
  - **When:** Running `npx tsc --noEmit` on mesh handlers
  - **Then:** No TS2307 errors in `src/features/mesh/handlers/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/mesh/handlers" | grep "@/core"`

- [ ] **Test: Mesh UI components compile without @/core/* errors**
  - **Given:** ApiMeshStep.tsx with corrected UI imports
  - **When:** Running `npx tsc --noEmit` on mesh UI
  - **Then:** No TS2307 errors in `src/features/mesh/ui/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/mesh/ui" | grep "@/core"`

### Compilation Tests (Dashboard Module)

- [ ] **Test: Dashboard commands compile without @/core/* errors**
  - **Given:** Dashboard command files with corrected imports
  - **When:** Running `npx tsc --noEmit` on dashboard commands
  - **Then:** No TS2307 errors in `src/features/dashboard/commands/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/dashboard/commands" | grep "@/core"`

- [ ] **Test: Dashboard handlers compile without @/core/* errors**
  - **Given:** Dashboard handler files with corrected imports
  - **When:** Running `npx tsc --noEmit` on dashboard handlers
  - **Then:** No TS2307 errors in `src/features/dashboard/handlers/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/dashboard/handlers" | grep "@/core"`

- [ ] **Test: Dashboard UI components compile without @/core/* errors**
  - **Given:** Dashboard UI files with corrected imports
  - **When:** Running `npx tsc --noEmit` on dashboard UI
  - **Then:** No TS2307 errors in `src/features/dashboard/ui/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/dashboard/ui" | grep "@/core"`

### Compilation Tests (Lifecycle Module)

- [ ] **Test: Lifecycle commands compile without @/core/* errors**
  - **Given:** Lifecycle command files with corrected imports
  - **When:** Running `npx tsc --noEmit` on lifecycle commands
  - **Then:** No TS2307 errors in `src/features/lifecycle/commands/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/lifecycle/commands" | grep "@/core"`

- [ ] **Test: Lifecycle handlers compile without @/core/* errors**
  - **Given:** Lifecycle handler files with corrected imports
  - **When:** Running `npx tsc --noEmit` on lifecycle handlers
  - **Then:** No TS2307 errors in `src/features/lifecycle/handlers/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/lifecycle/handlers" | grep "@/core"`

### Compilation Tests (Updates Module)

- [ ] **Test: Updates commands compile without @/core/* errors**
  - **Given:** Updates command files with corrected imports
  - **When:** Running `npx tsc --noEmit` on updates commands
  - **Then:** No TS2307 errors in `src/features/updates/commands/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/updates/commands" | grep "@/core"`

- [ ] **Test: Updates services compile without @/core/* errors**
  - **Given:** Updates service files with corrected imports (including dynamic imports)
  - **When:** Running `npx tsc --noEmit` on updates services
  - **Then:** No TS2307 errors in `src/features/updates/services/`
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "features/updates/services" | grep "@/core"`

### Integration Verification

- [ ] **Test: Overall error count reduction verified**
  - **Given:** All imports fixed in 4 modules
  - **When:** Running full TypeScript compilation
  - **Then:** Error count reduced by 50-60 (from ~610 to ~550-560)
  - **Verification:** `npx tsc --noEmit 2>&1 | grep "error TS" | wc -l`

- [ ] **Test: No circular dependency warnings**
  - **Given:** Corrected imports in all 4 modules
  - **When:** Building extension with webpack
  - **Then:** No circular dependency warnings for mesh/dashboard/lifecycle/updates
  - **Verification:** `npm run build 2>&1 | grep -i "circular" | grep -E "(mesh|dashboard|lifecycle|updates)"`

- [ ] **Test: Dynamic imports resolve correctly**
  - **Given:** ServiceLocator and validation dynamic imports in updates/mesh
  - **When:** Extension activates and loads services
  - **Then:** No runtime module resolution errors in activation logs
  - **Note:** Manual verification during F5 debug session

---

## Files to Create/Modify

### Mesh Module Files (16 files)

**Commands (1 file):**
- [ ] `src/features/mesh/commands/deployMesh.ts`
  - Fix: `@/core/vscode/StatusBarManager` → TBD (need to locate StatusBarManager)
  - Fix: `@/core/di` → `@/services/serviceLocator`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `@/core/state` → `@/shared/state/stateManager`
  - Fix: `@/core/base` → `@/shared/base/BaseCommand`

**Handlers (4 files):**
- [ ] `src/features/mesh/handlers/checkHandler.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`
  - Fix: `@/core/validation/securityValidation` → `@/shared/validation/securityValidation`

- [ ] `src/features/mesh/handlers/createHandler.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`
  - Fix: `@/core/validation/securityValidation` → `@/shared/validation/securityValidation`

- [ ] `src/features/mesh/handlers/deleteHandler.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`

- [ ] `src/features/mesh/handlers/shared.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`

**Services (6 files):**
- [ ] `src/features/mesh/services/meshDeployer.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `@/core/validation` → `@/shared/validation/securityValidation`

- [ ] `src/features/mesh/services/meshDeployment.ts`
  - Fix: `@/core/shell` → `@/shared/command-execution/shellExecutor`

- [ ] `src/features/mesh/services/meshDeploymentVerifier.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`
  - Fix: `@/core/validation` → `@/shared/validation/securityValidation`

- [ ] `src/features/mesh/services/meshEndpoint.ts`
  - Fix: `@/core/shell` → `@/shared/command-execution/shellExecutor`
  - Fix: `@/core/validation` → `@/shared/validation/securityValidation`

- [ ] `src/features/mesh/services/meshVerifier.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`

- [ ] `src/features/mesh/services/stalenessDetector.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `@/core/state` → `@/shared/state/stateManager`
  - Fix: `@/core/utils/envVarExtraction` → TBD (need to locate envVarExtraction)
  - Fix: `await import('@/core/di')` → `await import('@/services/serviceLocator')`

**UI (1 file):**
- [ ] `src/features/mesh/ui/steps/ApiMeshStep.tsx`
  - Fix: `@/core/ui/vscode-api` → `@/webviews/vscode-api` (or appropriate location)
  - Fix: `@/core/ui/types` → `@/types/*` (appropriate type files)
  - Fix: `@/core/ui/components/*` → TBD (need to locate components)

### Dashboard Module Files (10 files)

**Commands (3 files):**
- [ ] `src/features/dashboard/commands/configure.ts`
  - Fix: `@/core/communication` → `@/shared/communication/WebviewCommunicationManager`
  - Fix: `@/core/base` → `@/shared/base/BaseWebviewCommand`
  - Fix: `@/core/utils/webviewHTMLBuilder` → `@/shared/utils/webviewHTMLBuilder`

- [ ] `src/features/dashboard/commands/configureQuickPick.ts`
  - Fix: `@/core/base` → `@/shared/base/BaseCommand`

- [ ] `src/features/dashboard/commands/showDashboard.ts`
  - Fix: `@/core/base` → `@/shared/base/BaseWebviewCommand`
  - Fix: `@/core/communication` → `@/shared/communication/WebviewCommunicationManager`
  - Fix: `@/core/utils/webviewHTMLBuilder` → `@/shared/utils/webviewHTMLBuilder`
  - Fix: `import('@/core/state').StateManager` → `import('@/shared/state/stateManager').StateManager`
  - Fix: `import('@/core/vscode/StatusBarManager').StatusBarManager` → TBD
  - Fix: `import('@/core/logging').Logger` → `import('@/shared/logging/debugLogger').debugLogger`

**Handlers (2 files):**
- [ ] `src/features/dashboard/handlers/HandlerRegistry.ts`
  - Fix: `@/core/base` → `@/shared/base/BaseHandlerRegistry`

- [ ] `src/features/dashboard/handlers/dashboardHandlers.ts`
  - Fix: `@/core/validation` → `@/shared/validation/securityValidation`
  - Fix: `@/core/di` → `@/services/serviceLocator`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`

**UI (5 files):**
- [ ] `src/features/dashboard/ui/ConfigureScreen.tsx`
  - Fix: `@/core/ui/types` → `@/types/*` (appropriate type files)
  - Fix: `@/core/ui/vscode-api` → `@/webviews/vscode-api`
  - Fix: `@/core/ui/hooks/useSelectableDefault` → TBD (locate hooks)
  - Fix: `@/core/ui/hooks` → TBD (locate hooks)
  - Fix: `@/core/ui/utils/classNames` → TBD (locate utils)

- [ ] `src/features/dashboard/ui/ProjectDashboardScreen.tsx`
  - Fix: `@/core/ui/vscode-api` → `@/webviews/vscode-api`
  - Fix: `@/core/ui/hooks` → TBD (locate hooks)

- [ ] `src/features/dashboard/ui/main/configure.tsx`
  - Fix: `@/core/ui/vscode-api` → `@/webviews/vscode-api`
  - Fix: `@/core/ui/types` → `@/types/*`
  - Fix: `@/core/ui/styles/*` → TBD (locate styles)

- [ ] `src/features/dashboard/ui/main/project-dashboard.tsx`
  - Fix: `@/core/ui/vscode-api` → `@/webviews/vscode-api`
  - Fix: `@/core/ui/types` → `@/types/*`
  - Fix: `@/core/ui/styles/*` → TBD (locate styles)

- [ ] `src/features/dashboard/ui/components/NavigationPanel.tsx`
  - **Note:** Check for any @/core/* imports (not found in grep but verify)

### Lifecycle Module Files (5 files)

**Commands (4 files):**
- [ ] `src/features/lifecycle/commands/deleteProject.ts`
  - Fix: `@/core/base` → `@/shared/base/BaseCommand`

- [ ] `src/features/lifecycle/commands/startDemo.ts`
  - Fix: `@/core/di` → `@/services/serviceLocator`
  - Fix: `@/core/state` → `@/shared/state/stateManager`
  - Fix: `@/core/base` → `@/shared/base/BaseCommand`

- [ ] `src/features/lifecycle/commands/stopDemo.ts`
  - Fix: `@/core/base` → `@/shared/base/BaseCommand`

- [ ] `src/features/lifecycle/commands/viewStatus.ts`
  - Fix: `@/core/base` → `@/shared/base/BaseCommand`

**Handlers (1 file):**
- [ ] `src/features/lifecycle/handlers/lifecycleHandlers.ts`
  - Fix: `@/core/validation` → `@/shared/validation/securityValidation`

### Updates Module Files (4 files)

**Commands (1 file):**
- [ ] `src/features/updates/commands/checkUpdates.ts`
  - Fix: `@/core/base` → `@/shared/base/BaseCommand`
  - Fix: `@/core/validation/securityValidation` → `@/shared/validation/securityValidation`

**Services (3 files):**
- [ ] `src/features/updates/services/componentUpdater.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `await import('@/core/validation/securityValidation')` → `await import('@/shared/validation/securityValidation')`
  - Fix: `await import('@/core/di')` → `await import('@/services/serviceLocator')`

- [ ] `src/features/updates/services/extensionUpdater.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `await import('@/core/validation/securityValidation')` → `await import('@/shared/validation/securityValidation')`

- [ ] `src/features/updates/services/updateManager.ts`
  - Fix: `@/core/logging` → `@/shared/logging/debugLogger`
  - Fix: `await import('@/core/validation/securityValidation')` → `await import('@/shared/validation/securityValidation')`

**Total Files:** 35 files to modify

---

## Implementation Details

### RED Phase: Write Failing Tests

**Create Compilation Test Script:**

```bash
# Create test script to verify compilation errors
cat > .rptc/plans/fix-compilation-errors/verify-step-5.sh << 'EOF'
#!/bin/bash

echo "=== Step 5 Compilation Verification ==="
echo ""

# Test 1: Mesh commands
echo "Test 1: Mesh commands compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/mesh/commands" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in mesh commands"
else
  echo "❌ FAIL: $ERRORS @/core errors in mesh commands"
fi
echo ""

# Test 2: Mesh services
echo "Test 2: Mesh services compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/mesh/services" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in mesh services"
else
  echo "❌ FAIL: $ERRORS @/core errors in mesh services"
fi
echo ""

# Test 3: Mesh handlers
echo "Test 3: Mesh handlers compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/mesh/handlers" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in mesh handlers"
else
  echo "❌ FAIL: $ERRORS @/core errors in mesh handlers"
fi
echo ""

# Test 4: Dashboard commands
echo "Test 4: Dashboard commands compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/dashboard/commands" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in dashboard commands"
else
  echo "❌ FAIL: $ERRORS @/core errors in dashboard commands"
fi
echo ""

# Test 5: Dashboard handlers
echo "Test 5: Dashboard handlers compile..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/dashboard/handlers" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in dashboard handlers"
else
  echo "❌ FAIL: $ERRORS @/core errors in dashboard handlers"
fi
echo ""

# Test 6: Lifecycle module
echo "Test 6: Lifecycle module compiles..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/lifecycle" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in lifecycle"
else
  echo "❌ FAIL: $ERRORS @/core errors in lifecycle"
fi
echo ""

# Test 7: Updates module
echo "Test 7: Updates module compiles..."
ERRORS=$(npx tsc --noEmit 2>&1 | grep "features/updates" | grep "@/core" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ PASS: No @/core errors in updates"
else
  echo "❌ FAIL: $ERRORS @/core errors in updates"
fi
echo ""

# Test 8: Total error reduction
echo "Test 8: Overall error count..."
TOTAL=$(npx tsc --noEmit 2>&1 | grep "error TS" | wc -l)
echo "Current errors: $TOTAL (target: ~550-560 or fewer)"
if [ "$TOTAL" -le 560 ]; then
  echo "✅ PASS: Error count reduced to acceptable level"
else
  echo "⚠️  PENDING: Error count still above target"
fi

echo ""
echo "=== Summary ==="
echo "Step 4 modules should still be clean..."
npx tsc --noEmit 2>&1 | grep -E "features/(authentication|prerequisites)" | grep "@/core" | wc -l
echo "Expected: 0 errors in authentication/prerequisites"
EOF

chmod +x .rptc/plans/fix-compilation-errors/verify-step-5.sh
```

**Run Initial Test (Expected: FAIL):**
```bash
./.rptc/plans/fix-compilation-errors/verify-step-5.sh
# Expected output: All tests FAIL with @/core import errors
```

---

### GREEN Phase: Minimal Implementation

**Systematic Import Replacement Process:**

Apply same methodology as Step 4:
1. **Open file** in editor
2. **Identify @/core/* imports** using find/replace or manual inspection
3. **Apply mapping** from import patterns below
4. **Save file**
5. **Verify compilation** for that specific file
6. **Mark checkbox complete**

**Common Import Replacements:**

| Incorrect Import | Correct Import |
|-----------------|----------------|
| `@/core/di` | `@/services/serviceLocator` |
| `@/core/logging` | `@/shared/logging/debugLogger` |
| `@/core/validation` | `@/shared/validation/securityValidation` |
| `@/core/shell` | `@/shared/command-execution/shellExecutor` |
| `@/core/base` | `@/shared/base/*` (BaseCommand, BaseWebviewCommand, BaseHandlerRegistry) |
| `@/core/communication` | `@/shared/communication/WebviewCommunicationManager` |
| `@/core/state` | `@/shared/state/stateManager` |
| `@/core/utils/webviewHTMLBuilder` | `@/shared/utils/webviewHTMLBuilder` |

**Special Cases:**

| Pattern | Replacement |
|---------|-------------|
| `await import('@/core/di')` | `await import('@/services/serviceLocator')` |
| `await import('@/core/validation/securityValidation')` | `await import('@/shared/validation/securityValidation')` |
| `import('@/core/state').StateManager` | `import('@/shared/state/stateManager').StateManager` |

**TBD Imports (Require Investigation):**

These imports need actual file location verification:
- `@/core/vscode/StatusBarManager` → Check if exists in `src/utils/` or `src/shared/`
- `@/core/utils/envVarExtraction` → Check if exists in `src/utils/` or `src/shared/utils/`
- `@/core/ui/*` → Likely should be `@/webviews/*` but verify actual location

**Implementation Order:**

**Phase 1: Lifecycle Module (5 files, ~10 min)**
- Simplest module with clear dependencies
- Good validation that import mapping works
```bash
# Fix lifecycle commands (4 files)
for file in deleteProject startDemo stopDemo viewStatus; do
  code src/features/lifecycle/commands/${file}.ts
  # Apply import mapping
  # Save and verify
done

# Fix lifecycle handler
code src/features/lifecycle/handlers/lifecycleHandlers.ts
# Apply import mapping
# Save and verify

# Verify: Run verification script
./.rptc/plans/fix-compilation-errors/verify-step-5.sh | grep "Lifecycle"
```

**Phase 2: Updates Module (4 files, ~15 min)**
- Contains dynamic imports (good pattern test)
- Security-critical code (careful verification needed)
```bash
# Fix updates command
code src/features/updates/commands/checkUpdates.ts
# Apply import mapping
# Save and verify

# Fix updates services (3 files with dynamic imports)
for file in componentUpdater extensionUpdater updateManager; do
  code src/features/updates/services/${file}.ts
  # Apply import mapping (including dynamic imports)
  # Save and verify
done

# Verify: Run verification script
./.rptc/plans/fix-compilation-errors/verify-step-5.sh | grep "Updates"
```

**Phase 3: Mesh Module - Backend (11 files, ~25 min)**
- Skip UI file initially (handle separately)
- Focus on commands, handlers, services
```bash
# Fix mesh command
code src/features/mesh/commands/deployMesh.ts
# Apply import mapping
# NOTE: StatusBarManager may need investigation
# Save and verify

# Fix mesh handlers (4 files)
for file in checkHandler createHandler deleteHandler shared; do
  code src/features/mesh/handlers/${file}.ts
  # Apply import mapping
  # Save and verify
done

# Fix mesh services (6 files)
for file in meshDeployer meshDeployment meshDeploymentVerifier meshEndpoint meshVerifier stalenessDetector; do
  code src/features/mesh/services/${file}.ts
  # Apply import mapping
  # NOTE: stalenessDetector has dynamic import + envVarExtraction
  # Save and verify
done

# Verify: Run verification script
./.rptc/plans/fix-compilation-errors/verify-step-5.sh | grep "Mesh"
```

**Phase 4: Dashboard Module - Backend (5 files, ~15 min)**
- Skip UI files initially (handle separately)
- Focus on commands and handlers
```bash
# Fix dashboard commands (3 files)
for file in configure configureQuickPick showDashboard; do
  code src/features/dashboard/commands/${file}.ts
  # Apply import mapping
  # Save and verify
done

# Fix dashboard handlers (2 files)
code src/features/dashboard/handlers/HandlerRegistry.ts
code src/features/dashboard/handlers/dashboardHandlers.ts
# Apply import mapping
# Save and verify

# Verify: Run verification script
./.rptc/plans/fix-compilation-errors/verify-step-5.sh | grep "Dashboard"
```

**Phase 5: UI Files (6 files, ~20 min)**
- Handle mesh + dashboard UI files together
- Requires investigation of @/core/ui/* locations
```bash
# Investigate UI import locations first
find src -name "vscode-api.ts" -o -name "vscode-api.tsx"
find src -name "*.css" | grep -E "(index|vscode-theme|custom-spectrum)"
find src/webviews -type d

# Fix mesh UI
code src/features/mesh/ui/steps/ApiMeshStep.tsx
# Apply mapping (likely @/core/ui/* → @/webviews/*)
# Save and verify

# Fix dashboard UI (5 files)
code src/features/dashboard/ui/ConfigureScreen.tsx
code src/features/dashboard/ui/ProjectDashboardScreen.tsx
code src/features/dashboard/ui/main/configure.tsx
code src/features/dashboard/ui/main/project-dashboard.tsx
# Apply mapping
# Save and verify

# Verify: Check UI compilation
npx tsc --noEmit 2>&1 | grep -E "features/(mesh|dashboard)/ui" | grep "@/core"
```

**Verification After Each Phase:**
```bash
# Run test script after each phase
./.rptc/plans/fix-compilation-errors/verify-step-5.sh

# Expected progression:
# After Phase 1: Lifecycle ✅
# After Phase 2: Updates ✅
# After Phase 3: Mesh backend ✅
# After Phase 4: Dashboard backend ✅
# After Phase 5: UI files ✅, error count ~550-560
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

   // Local imports
   import { localFunction } from './localModule';
   ```

3. **Remove unused imports**:
   ```bash
   # VS Code auto-fix
   # In each file: Cmd+Shift+P → "Organize Imports"
   ```

**Dynamic Import Pattern Consistency:**

Verify all dynamic imports follow consistent pattern:
```typescript
// BEFORE:
const { ServiceLocator } = await import('@/core/di');

// AFTER (consistent):
const { ServiceLocator } = await import('@/services/serviceLocator');
```

**Code Quality Checks:**

```bash
# Run linter to catch style issues
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix

# Re-run compilation to ensure refactor didn't break anything
npx tsc --noEmit

# Final verification
./.rptc/plans/fix-compilation-errors/verify-step-5.sh
```

---

## Expected Outcome

After completing this step:

**Compilation Success:**
- ✅ All mesh module files (commands, handlers, services, UI) compile without `@/core/*` errors
- ✅ All dashboard module files (commands, handlers, UI) compile without `@/core/*` errors
- ✅ All lifecycle module files (commands, handlers) compile without `@/core/*` errors
- ✅ All updates module files (commands, services) compile without `@/core/*` errors
- ✅ Overall TypeScript error count reduced from ~610 to ~550-560 (50-60 errors resolved)

**Module Verification:**
- ✅ Dynamic imports resolve correctly (updates, mesh)
- ✅ No circular dependencies in modified modules
- ✅ Extension activates successfully in debug mode (F5)

**Quality Metrics:**
- ✅ Imports organized alphabetically and grouped by category
- ✅ No linting errors in modified files
- ✅ Consistent import patterns across all modules

**What Can Be Demonstrated:**
- Run extension with F5 → Mesh deployment works correctly
- Dashboard opens without errors
- Project lifecycle commands (start/stop/delete) work
- Auto-update checks work without errors
- Compilation output shows reduced error count

---

## Acceptance Criteria

**Compilation Criteria:**
- [ ] Zero `@/core/*` import errors in `src/features/mesh/` (verified by grep)
- [ ] Zero `@/core/*` import errors in `src/features/dashboard/` (verified by grep)
- [ ] Zero `@/core/*` import errors in `src/features/lifecycle/` (verified by grep)
- [ ] Zero `@/core/*` import errors in `src/features/updates/` (verified by grep)
- [ ] `npx tsc --noEmit` shows ≤560 total errors (baseline: 610, target reduction: 50 errors)
- [ ] No new TypeScript errors introduced in modified files
- [ ] Step 4 modules (authentication, prerequisites) still compile cleanly

**Testing Criteria:**
- [ ] Verification script shows all checks passing: `./.rptc/plans/fix-compilation-errors/verify-step-5.sh`
- [ ] Extension activates in debug mode (F5) without module resolution errors
- [ ] No runtime errors when accessing mesh, dashboard, lifecycle, or updates features

**Code Quality Criteria:**
- [ ] All imports alphabetized and grouped by category
- [ ] Dynamic imports use consistent pattern
- [ ] No debug code (`console.log`, `debugger`) added
- [ ] `npm run lint` passes for modified files
- [ ] Import statements use consistent quote style (single quotes)

**Integration Criteria:**
- [ ] No circular dependency warnings in build output: `npm run build`
- [ ] All dynamic imports (updates, mesh) resolve correctly at runtime
- [ ] UI imports resolve correctly (vscode-api, types, components, styles)

**Documentation Criteria:**
- [ ] All 35 file checkboxes marked complete in "Files to Create/Modify" section
- [ ] Verification script created and tested
- [ ] Any TBD imports documented with actual locations found
- [ ] Any deviations from plan documented in implementation notes

---

## Dependencies from Other Steps

**Depends On:**
- **Step 1**: Error analysis provides error count baseline
- **Step 2**: Import mapping provides correct import paths
- **Step 3**: Missing exports added to shared infrastructure
- **Step 4**: Validated import fix approach, provides clean baseline

**Enables:**
- **Step 6**: Remaining errors will be primarily in components module and strict mode type fixes
- **Step 7**: Ensures core features stable for final integration testing

---

## Estimated Time

**Total Time: 90-110 minutes**

**Breakdown:**
- RED Phase (test script creation): 5 minutes
- GREEN Phase (import fixes):
  - Lifecycle module: 10 minutes
  - Updates module: 15 minutes
  - Mesh backend: 25 minutes
  - Dashboard backend: 15 minutes
  - UI files (investigation + fixes): 20 minutes
  - **Subtotal**: 85 minutes
- REFACTOR Phase (import organization): 15 minutes
- Verification (compilation + manual testing): 10 minutes

**Contingency:**
- +20 minutes for TBD import investigation (StatusBarManager, envVarExtraction, UI locations)
- +15 minutes if unexpected type errors surface
- +10 minutes for manual extension testing (F5 debug)

**Total with Contingency: 155 minutes maximum (~2.5 hours)**

---

## Implementation Notes

**Tips for Success:**

1. **Handle TBD imports early**: Investigate StatusBarManager, envVarExtraction, and UI import locations before starting fixes
2. **Work module-by-module**: Complete one module entirely before starting next
3. **Test after each module**: Run verification script after each phase
4. **Dynamic imports pattern**: Search for `await import('@/core/` to find all dynamic imports
5. **UI imports special care**: UI files may have multiple @/core/ui/* imports - investigate actual locations

**Common Pitfalls:**

- **Don't** assume UI imports are all in same location (verify each)
- **Don't** skip verification after each module (catches errors early)
- **Don't** forget dynamic imports (updates module has 3, mesh has 1)
- **Do** document TBD import locations when found (for future reference)
- **Do** verify extension still works in F5 debug after completing

**Recovery Strategy:**

If error count doesn't decrease as expected:
1. Run verification script to identify which module still has errors
2. Check for dynamic imports that were missed
3. Verify UI import locations are correct
4. Manually inspect files with remaining @/core/* imports
5. Check for typos in import paths (case-sensitivity)

**TBD Import Investigation:**

Before starting implementation, locate these files:
```bash
# Find StatusBarManager
find src -name "*StatusBar*" -type f

# Find envVarExtraction
find src -name "*envVar*" -type f

# Find vscode-api for UI
find src -name "vscode-api.ts" -o -name "vscode-api.tsx"

# Find UI components
find src -type d -name "components" | grep -v node_modules

# Find UI styles
find src -name "*.css" | grep -E "(index|vscode-theme|custom-spectrum)"
```

Document findings here:
- `StatusBarManager`: [ACTUAL LOCATION]
- `envVarExtraction`: [ACTUAL LOCATION]
- `vscode-api`: [ACTUAL LOCATION]
- `UI components`: [ACTUAL LOCATION]
- `UI styles`: [ACTUAL LOCATION]

---

_This step is ready for TDD implementation. Investigate TBD imports first, then run verification script to establish RED state, then systematically fix imports module-by-module to achieve GREEN state._
