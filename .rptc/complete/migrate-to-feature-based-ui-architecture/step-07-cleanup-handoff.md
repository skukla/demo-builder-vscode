# Step 7 Cleanup Handoff Document

## Executive Summary

**Status:** Step 7 TDD implementation (RED-GREEN-REFACTOR) is complete with all quality gates passed. The cleanup phase remains to complete the migration.

**Decision:** Proceed with **Option 1 - Complete Shared Code Migration** to achieve full architectural refactoring as planned.

**Rationale:** The original plan calls for complete migration from centralized `webview-ui/` to feature-based architecture. Stopping short would leave architectural inconsistency and fail to achieve the stated goal of eliminating the webview-ui/ directory.

---

## Current State

### ✅ Completed (TDD Phase)

**Step 7 Implementation:**
- Wizard orchestrator migrated to `src/features/project-creation/ui/wizard/`
- All wizard tests passing: 98/98 (100%)
- Quality gates complete:
  - ✅ Efficiency Agent review
  - ✅ Security review (N/A - UI migration)
  - ✅ Documentation Specialist review
- TypeScript: 0 errors
- ESLint: 0 warnings (WizardContainer.tsx)

**Test Coverage:**
```
tests/features/project-creation/ui/wizard/
├── WizardContainer.test.tsx       - 17 tests ✅
├── components/TimelineNav.test.tsx - 6 tests ✅
└── steps/
    ├── WelcomeStep.test.tsx       - 19 tests ✅
    ├── ReviewStep.test.tsx        - 18 tests ✅
    └── ProjectCreationStep.test.tsx - 38 tests ✅
```

### ❌ Remaining (Cleanup Phase)

**Incomplete Tasks from Step 7 Acceptance Criteria:**

1. **78 imports** still reference `@/webview-ui/shared/*`
2. **webview-ui/ directory** still exists (NOT deleted)
3. **tsconfig.json** still has `@/webview-ui/*` path alias (line 32)
4. **webpack.config.js** still has `@/webview-ui/*` alias (line 55)
5. **jest.config.js** still has webview-ui mappings
6. **tsconfig.webview.json** still exists

---

## Decision: Option 1 - Complete Shared Code Migration

### Approach

**Migrate all shared code from `webview-ui/src/shared/` to feature-appropriate locations:**

1. **Shared UI Components** → `src/core/ui/components/`
2. **Shared Hooks** → `src/core/ui/hooks/`
3. **Shared Types** → `src/types/webview.ts` or feature-specific types
4. **Shared Utils** → `src/core/ui/utils/`
5. **Shared Styles** → `src/core/ui/styles/`

### Rationale

**Why Option 1 (Complete Migration):**

✅ **Aligns with Original Plan:**
- Step 1 explicitly planned `@/shared/*` alias and src/shared/ directory
- Overview states: "Import paths migrated from @/webview-ui/* to @/features/* and @/shared/*"
- Acceptance criteria: "webview-ui/ directory DELETED"

✅ **Achieves Stated Goals:**
- "Eliminate architectural inconsistency between backend and frontend"
- "Remove 7,045 lines of dead code duplication"
- "Backend and frontend both use feature-based organization"

✅ **Industry Best Practice:**
- GitLens pattern: shared code in core/ui/, not separate webview directory
- Screaming architecture: folder structure communicates purpose
- No special-case webview directory

✅ **Clean Final State:**
- Zero references to webview-ui/
- All UI code in src/features/*/ui/ or src/core/ui/
- Consistent path aliases (@/features, @/core, @/types)

**Why NOT Option 2 (Keep webview-ui/shared/):**

❌ Leaves architectural inconsistency (webview-ui/ directory persists)
❌ Fails to achieve stated acceptance criteria
❌ Creates confusion (why does webview-ui/ still exist?)
❌ Breaks symmetry (backend uses src/core/, frontend uses webview-ui/src/shared/)

---

## Implementation Plan

### Phase 1: Analyze & Categorize Shared Code

**Shared Code Inventory (from grep analysis):**

```
17 imports - shared/types (WizardState, ComponentSelection, etc.)
 8 imports - shared/utils/WebviewClient
 8 imports - shared/utils/classNames
 6 imports - shared/components/feedback/LoadingDisplay
 4 imports - shared/vscode-api
 4 imports - shared/styles/*.css
 4 imports - shared/components/WebviewApp
 3 imports - shared/hooks/useSelectableDefault
 3 imports - shared/components/ui/FadeTransition
 2 imports - shared/hooks (generic)
 2 imports - shared/components/layout
 1 import  - shared/components/ui/NumberedInstructions
 1 import  - shared/components/ui/Modal
 1 import  - shared/components/navigation
 1 import  - shared/components/layout/TwoColumnLayout
 1 import  - shared/components/forms
 1 import  - shared/components/feedback
```

**Categorization:**

1. **Core Infrastructure** (move to `src/core/ui/`):
   - WebviewClient (message protocol)
   - WebviewApp (base component)
   - vscode-api (VS Code integration)

2. **Shared Components** (move to `src/core/ui/components/`):
   - LoadingDisplay, FadeTransition, Modal, NumberedInstructions
   - Layout components (TwoColumnLayout, GridLayout)
   - Form components
   - Feedback components
   - Navigation components

3. **Shared Hooks** (move to `src/core/ui/hooks/`):
   - useSelectableDefault
   - useFocusTrap
   - Other generic hooks

4. **Shared Utilities** (move to `src/core/ui/utils/`):
   - classNames utility

5. **Shared Types** (stay in `src/types/`):
   - WizardState, ComponentSelection, etc.
   - Already have `src/types/` directory

6. **Shared Styles** (move to `src/core/ui/styles/`):
   - index.css, vscode-theme.css, custom-spectrum.css, wizard.css

### Phase 2: Create Target Directory Structure

```
src/core/ui/
├── components/          # Shared UI components
│   ├── feedback/
│   │   └── LoadingDisplay.tsx
│   ├── forms/
│   ├── layout/
│   │   └── TwoColumnLayout.tsx
│   ├── navigation/
│   ├── ui/
│   │   ├── FadeTransition.tsx
│   │   ├── Modal.tsx
│   │   └── NumberedInstructions.tsx
│   └── WebviewApp.tsx
├── hooks/               # Shared React hooks
│   ├── useSelectableDefault.ts
│   └── useFocusTrap.ts
├── styles/              # Shared CSS
│   ├── index.css
│   ├── vscode-theme.css
│   ├── custom-spectrum.css
│   └── wizard.css
└── utils/               # UI utilities
    ├── WebviewClient.ts
    ├── vscode-api.ts
    └── classNames.ts
```

### Phase 3: Migration Steps

**Step-by-step execution:**

1. **Create directory structure:**
   ```bash
   mkdir -p src/core/ui/{components/{feedback,forms,layout,navigation,ui},hooks,styles,utils}
   ```

2. **Move files systematically:**
   ```bash
   # Utils
   mv webview-ui/src/shared/utils/WebviewClient.ts src/core/ui/utils/
   mv webview-ui/src/shared/utils/classNames.ts src/core/ui/utils/
   mv webview-ui/src/shared/vscode-api.ts src/core/ui/utils/

   # Components
   mv webview-ui/src/shared/components/WebviewApp.tsx src/core/ui/components/
   mv webview-ui/src/shared/components/feedback/ src/core/ui/components/
   mv webview-ui/src/shared/components/forms/ src/core/ui/components/
   mv webview-ui/src/shared/components/layout/ src/core/ui/components/
   mv webview-ui/src/shared/components/navigation/ src/core/ui/components/
   mv webview-ui/src/shared/components/ui/ src/core/ui/components/

   # Hooks
   mv webview-ui/src/shared/hooks/ src/core/ui/hooks/

   # Styles
   mv webview-ui/src/shared/styles/ src/core/ui/styles/

   # Types (already in src/types/, just update imports)
   ```

3. **Update all imports (78 files):**
   ```bash
   # Find and replace across codebase
   find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
     's/@\/webview-ui\/shared\/utils\/WebviewClient/@\/core\/ui\/utils\/WebviewClient/g' {} +

   find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
     's/@\/webview-ui\/shared\/utils\/classNames/@\/core\/ui\/utils\/classNames/g' {} +

   find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
     's/@\/webview-ui\/shared\/vscode-api/@\/core\/ui\/utils\/vscode-api/g' {} +

   find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
     's/@\/webview-ui\/shared\/components\/WebviewApp/@\/core\/ui\/components\/WebviewApp/g' {} +

   find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
     's/@\/webview-ui\/shared\/components/@\/core\/ui\/components/g' {} +

   find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
     's/@\/webview-ui\/shared\/hooks/@\/core\/ui\/hooks/g' {} +

   find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
     's/@\/webview-ui\/shared\/styles/@\/core\/ui\/styles/g' {} +

   find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
     's/@\/webview-ui\/shared\/types/@\/types\/webview/g' {} +
   ```

4. **Update path aliases:**

   **tsconfig.json:**
   ```json
   {
     "paths": {
       "@/core/*": ["src/core/*"],
       "@/features/*": ["src/features/*"],
       "@/types": ["src/types"],
       "@/types/*": ["src/types/*"]
       // REMOVE: "@/webview-ui/*": ["webview-ui/src/*"]
       // REMOVE: "@/design-system/*": ["webview-ui/src/shared/components/*"]
     }
   }
   ```

   **webpack.config.js:**
   ```javascript
   resolve: {
     alias: {
       '@/features': path.resolve(__dirname, 'src/features'),
       '@/core': path.resolve(__dirname, 'src/core'),
       '@/types': path.resolve(__dirname, 'src/types')
       // REMOVE all @/webview-ui, @/design-system, @/components, @/hooks aliases
     }
   }
   ```

   **jest.config.js:**
   ```javascript
   moduleNameMapper: {
     '^@/features/(.*)$': '<rootDir>/src/features/$1',
     '^@/core/(.*)$': '<rootDir>/src/core/$1',
     '^@/types/(.*)$': '<rootDir>/src/types/$1',
     '^@/types$': '<rootDir>/src/types'
     // REMOVE all @/webview-ui, @/components, @/hooks mappings
   }
   ```

5. **Delete old directories:**
   ```bash
   # Verify no imports remain
   grep -r "@/webview-ui" src/ --include="*.ts" --include="*.tsx"
   # Should return ZERO results

   # Delete webview-ui directory
   rm -rf webview-ui/

   # Delete tsconfig.webview.json
   rm tsconfig.webview.json
   ```

6. **Final verification:**
   ```bash
   npm run build          # All bundles build successfully
   npm test               # All tests pass
   npx tsc --noEmit       # TypeScript clean
   npx eslint src/**/*.ts # No new linting issues
   ```

### Phase 4: Test Strategy

**Verification Checklist:**

- [ ] All 98 wizard tests still passing
- [ ] All other feature tests still passing
- [ ] Webpack builds all 4 bundles (wizard, welcome, dashboard, configure)
- [ ] Code splitting working (vendors bundle extracted)
- [ ] TypeScript compilation clean (0 errors)
- [ ] ESLint clean (0 new warnings)
- [ ] No `@/webview-ui` imports in codebase
- [ ] webview-ui/ directory deleted
- [ ] tsconfig.webview.json deleted
- [ ] All path aliases updated

**Risk Mitigation:**

1. **Incremental Testing:** Test after each category of moves
2. **Automated Find/Replace:** Use sed scripts for consistency
3. **Import Verification:** Grep for remaining @/webview-ui imports before deletion
4. **Rollback Plan:** Git commit after each phase for easy rollback

---

## Expected Outcome

### Final Directory Structure

```
src/
├── core/
│   └── ui/
│       ├── components/          # All shared UI components
│       ├── hooks/               # All shared React hooks
│       ├── styles/              # All shared CSS
│       └── utils/               # WebviewClient, classNames, vscode-api
├── features/
│   ├── authentication/ui/
│   ├── components/ui/
│   ├── dashboard/ui/
│   ├── mesh/ui/
│   ├── prerequisites/ui/
│   ├── project-creation/ui/
│   └── welcome/ui/
└── types/
    └── webview.ts               # Shared webview types
```

### Deleted Directories

- ❌ `webview-ui/` (entire directory deleted)
- ❌ `tsconfig.webview.json` (deleted)

### Updated Configurations

- ✅ `tsconfig.json` - `@/webview-ui/*` removed, only `@/core/*`, `@/features/*`, `@/types`
- ✅ `webpack.config.js` - `@/webview-ui/*` removed
- ✅ `jest.config.js` - `@/webview-ui/*` mappings removed

### Import Path Examples

**Before:**
```typescript
import { WebviewClient } from '@/webview-ui/shared/utils/WebviewClient';
import { LoadingDisplay } from '@/webview-ui/shared/components/feedback/LoadingDisplay';
import { WizardState } from '@/webview-ui/shared/types';
```

**After:**
```typescript
import { WebviewClient } from '@/core/ui/utils/WebviewClient';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { WizardState } from '@/types/webview';
```

---

## Acceptance Criteria (Final)

**From Step 7 Plan - All Must Be Met:**

- [x] Directory created: `src/features/project-creation/ui/wizard/`
- [x] WizardContainer migrated with all imports updated
- [x] Wizard-specific steps migrated (Welcome, Review, ProjectCreation)
- [x] Wizard components migrated (TimelineNav)
- [x] Entry point migrated (index.tsx)
- [x] All imports updated (feature steps use absolute paths)
- [x] Comprehensive tests created and passing (98/98)
- [x] `npx tsc --noEmit` passes
- [x] `npm run build` generates all 4 bundles successfully
- [x] Entry point uses WebviewApp
- [ ] **NO remaining webview-ui imports in codebase** ← PENDING
- [ ] **webview-ui/ directory DELETED** ← PENDING
- [ ] **tsconfig.json updated (webview-ui references removed)** ← PENDING
- [ ] **jest.config.js updated (webview-ui mappings removed)** ← PENDING
- [ ] **All tests passing across entire codebase** ← PENDING (will verify after cleanup)

**From Overall Plan - All Must Be Met:**

- [ ] **Functionality:** All 4 webviews functional from new locations
- [ ] **Architecture:** Backend and frontend both use feature-based organization
- [ ] **Code Quality:** No dead code (webview-ui/ removed)
- [ ] **Webpack:** All bundles build with code splitting
- [ ] **Zero duplication** between src/ and webview-ui/ (webview-ui/ deleted)
- [ ] **Import paths migrated** from @/webview-ui/* to @/core/* and @/features/*

---

## Risk Assessment

### High Risk Areas

1. **Import Path Updates (78 files):**
   - **Risk:** Typos in sed scripts could break imports
   - **Mitigation:** Test after each category, use grep verification

2. **CSS Import Paths:**
   - **Risk:** CSS imports might break if not updated correctly
   - **Mitigation:** Update CSS imports separately, test bundles build

3. **Type Import Conflicts:**
   - **Risk:** Moving types might cause circular dependency
   - **Mitigation:** Keep types in src/types/, only update import paths

### Medium Risk Areas

1. **Webpack Bundle Size:**
   - **Risk:** Moving files might affect code splitting
   - **Mitigation:** Verify bundle sizes before/after

2. **Test Compatibility:**
   - **Risk:** Test imports might break
   - **Mitigation:** Update test imports in same sed passes

### Low Risk Areas

1. **Component Functionality:**
   - **Risk:** Components unlikely to break from file moves
   - **Mitigation:** Components are already tested, just path changes

---

## Rollback Plan

**If cleanup fails:**

1. **Git Revert:** Revert to commit before cleanup started
2. **Verify Tests:** Confirm 98/98 tests still passing
3. **Document Issue:** Update this handoff with failure details
4. **Re-plan:** Create new approach based on failure root cause

**Git Strategy:**

```bash
# Commit after each phase
git add .
git commit -m "refactor(ui): Phase 1 - move shared utils to src/core/ui/utils"

git add .
git commit -m "refactor(ui): Phase 2 - move shared components to src/core/ui/components"

# etc.
```

---

## Timeline Estimate

**Cleanup Phase Breakdown:**

- Phase 1 (Analysis): 15 minutes (COMPLETE - this document)
- Phase 2 (Create dirs): 5 minutes
- Phase 3 (Move files): 30 minutes
- Phase 4 (Update imports): 45 minutes
- Phase 5 (Update configs): 15 minutes
- Phase 6 (Delete old): 5 minutes
- Phase 7 (Verify): 30 minutes

**Total Estimated Time:** ~2.5 hours

---

## Next Actions

**Immediate Next Steps:**

1. **PM Approval:** Confirm decision to proceed with Option 1 (complete migration)
2. **Execute Phase 2:** Create src/core/ui/ directory structure
3. **Execute Phase 3:** Move files from webview-ui/src/shared/
4. **Execute Phase 4:** Update 78 import statements
5. **Execute Phase 5:** Update configuration files
6. **Execute Phase 6:** Delete webview-ui/ directory
7. **Execute Phase 7:** Final verification (tests, build, TypeScript)
8. **Final Commit:** Create BREAKING CHANGE commit as specified in Step 7 plan

**Success Criteria:**

- ✅ Zero `@/webview-ui` imports in src/
- ✅ webview-ui/ directory deleted
- ✅ All tests passing (98/98 wizard + all other tests)
- ✅ All bundles building successfully
- ✅ TypeScript compilation clean
- ✅ ESLint clean

---

## References

- **Step 7 Plan:** `.rptc/plans/migrate-to-feature-based-ui-architecture/step-07.md`
- **Overall Plan:** `.rptc/plans/migrate-to-feature-based-ui-architecture/overview.md`
- **Step 1 Config:** `.rptc/plans/migrate-to-feature-based-ui-architecture/step-01.md` (planned @/shared/* alias)
- **Current Code:** `src/features/project-creation/ui/wizard/WizardContainer.tsx`
- **Current Tests:** `tests/features/project-creation/ui/wizard/`

---

**Document Created:** 2025-01-08
**Author:** Claude (RPTC TDD Workflow)
**Status:** Ready for PM Approval and Execution
