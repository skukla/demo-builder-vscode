# Step 6: Migrate Components/Prerequisites/Mesh Features

## Purpose

Migrate the remaining wizard step components from `webview-ui/src/wizard/steps/` to their respective feature directories: Components, Prerequisites, and Mesh. These three features have parallel structure (each contributes one wizard step) and can be migrated together.

**What This Step Accomplishes:**
- ComponentSelectionStep → `src/features/components/ui/steps/`
- PrerequisitesStep → `src/features/prerequisites/ui/steps/`
- ApiMeshStep → `src/features/mesh/ui/steps/`
- Import paths updated in WizardContainer
- Tests migrated to tests/features/*/ui/ directories (mirror structure)
- Wizard continues to work with all steps from feature locations

**Criticality:** HIGH - These steps are part of core wizard flow, blocking project creation if broken.

---

## Prerequisites

**Completed Steps:**
- ✅ Step 1: Webpack + Config Setup
- ✅ Step 5: Authentication steps migrated (pattern established)

**Required Knowledge:**
- Understanding of component selection logic
- Familiarity with prerequisites checking system
- Knowledge of API Mesh configuration

**Existing Code to Review:**
- `webview-ui/src/wizard/steps/ComponentSelectionStep.tsx`
- `webview-ui/src/wizard/steps/ComponentConfigStep.tsx` (if exists)
- `webview-ui/src/wizard/steps/PrerequisitesStep.tsx`
- `webview-ui/src/wizard/steps/ApiMeshStep.tsx`
- Backend implementations in `src/features/{components,prerequisites,mesh}/`

---

## Tests to Write First

### Test Scenario 1: ComponentSelectionStep

**Given:** Component selection step at `src/features/components/ui/steps/ComponentSelectionStep.tsx`
**When:** Component renders with available components
**Then:**
- Component list displays (with descriptions)
- Multi-select checkboxes work
- Required components marked and checked by default
- Dependencies auto-selected when parent selected
- Continue button enabled when valid selection

**Test Type:** Unit test
**Coverage Target:** 85%
**Test File:** `src/features/components/ui/steps/ComponentSelectionStep.test.tsx`

### Test Scenario 2: PrerequisitesStep

**Given:** Prerequisites check step at `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`
**When:** Component renders and checks prerequisites
**Then:**
- Prerequisites list displays (Node.js, npm, Docker, etc.)
- Status indicators show (checking → passed/failed)
- Failed prerequisites show install instructions
- "Install" button triggers automatic installation
- Continue enabled only when all prerequisites met

**Test Type:** Unit test (mock prerequisite checks)
**Coverage Target:** 90% (critical validation)
**Test File:** `src/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx`

### Test Scenario 3: ApiMeshStep

**Given:** API Mesh configuration step at `src/features/mesh/ui/steps/ApiMeshStep.tsx`
**When:** Component renders with mesh options
**Then:**
- Mesh enablement toggle works
- Mesh configuration form shown when enabled
- Source configuration fields validate
- Sample queries section functional
- Skip option available

**Test Type:** Unit test
**Coverage Target:** 85%
**Test File:** `src/features/mesh/ui/steps/ApiMeshStep.test.tsx`

### Test Scenario 4: WizardContainer Imports All Steps

**Given:** WizardContainer imports all steps from feature locations
**When:** Wizard bundle builds
**Then:**
- All imports resolve correctly
- No missing step errors
- Bundle includes all step components
- Bundle size reasonable (vendors extracted)

**Test Type:** Integration test (build verification)
**Coverage Target:** 100%

---

## Edge Cases to Test

**Edge Case 1: Component Dependency Conflict**
- **Scenario:** Component A requires Component B, but B is incompatible with selected Component C
- **Expected:** Validation error shown, user must deselect conflicting component
- **Test:** Mock conflicting component selection

**Edge Case 2: Prerequisite Installation Failure**
- **Scenario:** Automatic Docker installation fails (permissions, network)
- **Expected:** Error message with manual installation instructions
- **Test:** Mock installation failure

**Edge Case 3: Mesh Configuration Timeout**
- **Scenario:** Mesh validation takes >30 seconds
- **Expected:** Timeout warning, option to skip validation
- **Test:** Mock delayed validation response

---

## Error Conditions to Test

**Error Condition 1: No Components Selected**
- **Trigger:** User deselects all components
- **Expected Behavior:** Continue button disabled, message: "Select at least one component"
- **Test:** Uncheck all components

**Error Condition 2: Prerequisite Check Failure**
- **Trigger:** Node.js version < 18 detected
- **Expected Behavior:** Failed status shown, upgrade instructions displayed
- **Test:** Mock outdated Node.js version

**Error Condition 3: Invalid Mesh Configuration**
- **Trigger:** Invalid GraphQL endpoint URL
- **Expected Behavior:** Validation error on field, Continue disabled
- **Test:** Enter malformed URL

---

## Files to Create/Modify

### Created Files - Components Feature

#### 1. `src/features/components/ui/steps/ComponentSelectionStep.tsx`

**Source:** `webview-ui/src/wizard/steps/ComponentSelectionStep.tsx`

**Migration Steps:**
1. Copy to `src/features/components/ui/steps/`
2. Update imports:
   ```typescript
   // OLD
   import { WizardStepProps } from '../WizardContainer';
   import { ComponentCard } from '@/components/ComponentCard';

   // NEW
   import { WizardStepProps } from '@/features/project-creation/ui/wizard/WizardContainer';
   import { ComponentCard } from '@/core/ui/components/ComponentCard';
   ```

#### 2. `tests/features/components/ui/steps/ComponentSelectionStep.test.tsx` (MIRRORED TEST)

**Test Coverage:**
- Component list renders
- Multi-select works
- Dependencies auto-selected
- Validation prevents invalid selections

### Created Files - Prerequisites Feature

#### 1. `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`

**Source:** `webview-ui/src/wizard/steps/PrerequisitesStep.tsx`

**Migration Steps:**
1. Copy to `src/features/prerequisites/ui/steps/`
2. Update imports (WizardStepProps, prerequisite checking utilities)
3. Verify message passing to backend for prerequisite checks

#### 2. `tests/features/prerequisites/ui/steps/PrerequisitesStep.test.tsx` (MIRRORED TEST)

**Test Coverage:**
- Prerequisites check runs on mount
- Status indicators update correctly
- Installation triggers work
- Continue enabled when all passed

### Created Files - Mesh Feature

#### 1. `src/features/mesh/ui/steps/ApiMeshStep.tsx`

**Source:** `webview-ui/src/wizard/steps/ApiMeshStep.tsx`

**Migration Steps:**
1. Copy to `src/features/mesh/ui/steps/`
2. Update imports
3. Verify mesh configuration validation logic

#### 2. `tests/features/mesh/ui/steps/ApiMeshStep.test.tsx` (MIRRORED TEST)

**Test Coverage:**
- Toggle enables/disables mesh
- Configuration form validates
- Skip option works
- Configuration saves correctly

### Modified Files

#### 1. `webview-ui/src/wizard/WizardContainer.tsx` (TEMPORARY UPDATE)

**Update imports for all three features:**
```typescript
// OLD
import { ComponentSelectionStep } from './steps/ComponentSelectionStep';
import { PrerequisitesStep } from './steps/PrerequisitesStep';
import { ApiMeshStep } from './steps/ApiMeshStep';

// NEW (temporary until Step 7)
import { ComponentSelectionStep } from '@/features/components/ui/steps/ComponentSelectionStep';
import { PrerequisitesStep } from '@/features/prerequisites/ui/steps/PrerequisitesStep';
import { ApiMeshStep } from '@/features/mesh/ui/steps/ApiMeshStep';
```

#### 2. Feature CLAUDE.md Files

**Update documentation in:**
- `src/features/components/CLAUDE.md`
- `src/features/prerequisites/CLAUDE.md`
- `src/features/mesh/CLAUDE.md`

Add UI sections documenting new step locations.

---

## Implementation Guidance

### IMPORTANT: Use WebviewApp (Not App.tsx)

The `src/features/project-creation/ui/App.tsx` file is dead code that predates the WebviewApp standardization.
Do NOT use it as a reference.

**Correct pattern** (established in Steps 2-4):
- Use `WebviewApp` from `@/webview-ui/shared/components/WebviewApp`
- WebviewApp handles: theme sync, handshake protocol, Spectrum Provider, initialization
- Entry point wraps content in `<WebviewApp>{(data) => ...}</WebviewApp>`

**See Examples:**
- `src/features/welcome/ui/index.tsx` (Step 2)
- `src/features/dashboard/ui/index.tsx` (Step 3)
- `src/features/dashboard/ui/configure/index.tsx` (Step 4)

### Migration Order (Parallel Features)

**For Each Feature (Components, Prerequisites, Mesh):**

1. **Create directory structure:**
   ```bash
   mkdir -p src/features/components/ui/steps
   mkdir -p src/features/prerequisites/ui/steps
   mkdir -p src/features/mesh/ui/steps
   ```

2. **Copy step components:**
   ```bash
   # Components
   cp webview-ui/src/wizard/steps/ComponentSelectionStep.tsx \
      src/features/components/ui/steps/

   # Prerequisites
   cp webview-ui/src/wizard/steps/PrerequisitesStep.tsx \
      src/features/prerequisites/ui/steps/

   # Mesh
   cp webview-ui/src/wizard/steps/ApiMeshStep.tsx \
      src/features/mesh/ui/steps/
   ```

3. **Update imports in all copied files**

4. **Update WizardContainer imports:**
   ```bash
   # Edit webview-ui/src/wizard/WizardContainer.tsx
   # Update all three step imports to @/features/*/ui/steps/*
   ```

5. **Compile TypeScript:**
   ```bash
   npx tsc --noEmit
   ```

6. **Build wizard bundle:**
   ```bash
   npm run build
   ```

7. **Write mirrored tests in tests/ directory for all three:**
   ```bash
   npm test -- tests/features/components/ui
   npm test -- tests/features/prerequisites/ui
   npm test -- tests/features/mesh/ui
   ```

8. **Manual verification:**
   - Launch Extension Development Host
   - Complete wizard through all steps
   - Test component selection (checkboxes, dependencies)
   - Test prerequisite checking (all prerequisites pass)
   - Test mesh configuration (enable/disable, validation)

9. **Delete old files:**
   ```bash
   rm webview-ui/src/wizard/steps/ComponentSelectionStep.tsx
   rm webview-ui/src/wizard/steps/PrerequisitesStep.tsx
   rm webview-ui/src/wizard/steps/ApiMeshStep.tsx
   ```

10. **Commit:**
    ```bash
    git add src/features/{components,prerequisites,mesh}/ui/
    git add webview-ui/src/wizard/WizardContainer.tsx
    git rm webview-ui/src/wizard/steps/{Component,Prerequisites,ApiMesh}*.tsx
    git commit -m "refactor(wizard): migrate component/prerequisite/mesh steps to features"
    ```

### Testing Strategy

**Component Selection Testing:**
- Test with various component combinations
- Verify dependency auto-selection logic
- Test validation (at least one component required)

**Prerequisites Testing:**
- Mock all prerequisite checks (Node.js, npm, Docker, Adobe CLI)
- Test both passed and failed states
- Test installation trigger (mock installation success/failure)

**Mesh Testing:**
- Test toggle on/off
- Test configuration validation (URL format, credentials)
- Test skip option (mesh should be optional)

---

## Files to Delete (Dead Code)

### `src/features/project-creation/ui/App.tsx`

- **Reason**: Duplicate of WebviewApp functionality (theme handling, message listeners, Provider setup)
- **When**: Delete during Step 7 migration (after all steps migrated)
- **Replacement**: Use WebviewApp from `@/webview-ui/shared/components/WebviewApp` (already established pattern in Steps 2-4)

---

## Expected Outcome

**After Step 6 Completion:**

✅ **All Three Features Migrated:**
- Components: ComponentSelectionStep in src/features/components/ui/steps/
- Prerequisites: PrerequisitesStep in src/features/prerequisites/ui/steps/
- Mesh: ApiMeshStep in src/features/mesh/ui/steps/
- Old wizard/steps/*.tsx deleted (except wizard-specific steps)
- Tests in tests/features/*/ui/ (mirrors source structure)
- Coverage maintained at 85%+

✅ **Wizard Still Works:**
- WizardContainer imports from new locations
- Wizard bundle builds successfully
- All three steps functional in wizard flow
- Backend communication working

✅ **Ready for Step 7:**
- All wizard steps migrated to features
- Only WizardContainer and wizard orchestration remain in webview-ui/
- Step 7 can migrate wizard itself to project-creation feature

**Next Step:** Step 7 - Migrate Project Creation Wizard (orchestrator + wizard-specific components)

---

## Acceptance Criteria

**Definition of Done for Step 6:**

- [ ] Directories created for all three features: `.../ui/steps/`
- [ ] ComponentSelectionStep migrated
- [ ] PrerequisitesStep migrated
- [ ] ApiMeshStep migrated
- [ ] All imports updated in copied files
- [ ] WizardContainer imports updated (temporary)
- [ ] Colocated tests created for all three steps
- [ ] All tests passing
- [ ] Coverage maintained at 85%+
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` generates wizard-bundle.js
- [ ] Component selection works in wizard
- [ ] Prerequisites checking works
- [ ] Mesh configuration works
- [ ] Entry points use WebviewApp (consistent with Steps 2-4)
- [ ] App.tsx confirmed as dead code (to delete in Step 7)
- [ ] Old step files deleted
- [ ] Git commit created
- [ ] Feature CLAUDE.md files updated

**Blocker Conditions:**

- ❌ If component dependencies broken, debug auto-selection logic
- ❌ If prerequisite checks fail, verify backend message passing
- ❌ If mesh config invalid, check validation logic migration

---

## Dependencies from Other Steps

**Depends On:**
- ✅ Step 1: Webpack + Config Setup
- ✅ Step 5: Authentication steps (pattern established)

**Enables:**
- Step 7: Project Creation Wizard (all steps now in features, can migrate orchestrator)

**Blocks:**
- Step 7: Cannot complete until all steps migrated

---

## Notes

**Why Migrate These Together?**
- Parallel structure (each contributes one wizard step)
- Similar complexity level
- No interdependencies between the three
- Efficient to test all three wizard steps together

**Prerequisite Step Specifics:**
- Prerequisites check involves backend communication
- Tests should mock prerequisite checking (don't actually check Node.js version)
- Auto-install features should be tested with mocks (don't actually install Docker)

**Component Selection Complexity:**
- Component dependency logic is complex (required, optional, conflicts)
- Ensure dependency calculation logic migrates correctly
- Test various component combinations thoroughly

**Mesh Configuration:**
- Mesh is optional (user can skip)
- Configuration validation is important (invalid mesh config blocks project creation)
- Test both enabled and disabled paths

---

_Step 6 completes wizard step migration. Step 7 will migrate the wizard orchestrator itself._
