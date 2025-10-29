# Step 5: Update Import Paths, Move Tests, Delete Orphaned Tests

**Purpose:** Update all imports from deleted paths to new function-based paths, move test files for MIGRATED components, DELETE tests for DELETED components

**Prerequisites:**

- [x] Step 1: Pre-Flight Verification complete
- [x] Step 1.5: Usage Analysis complete (orphaned tests identified)
- [x] Step 2: Directory structure created
- [x] Step 3: Components moved or deleted
- [x] Step 4: Old directories deleted
- [ ] Usage reports available (test alignment report)
- [ ] Git working tree clean (Step 4 committed)

## Tests to Write First

**NO NEW TESTS** - Import updates don't change functionality

- [ ] **Test:** TypeScript compilation succeeds after import updates
  - **Given:** All imports updated to new paths
  - **When:** Run `npm run compile:typescript`
  - **Then:** 0 new errors (14 pre-existing errors acceptable)
  - **File:** TypeScript compilation

- [ ] **Test:** Webpack build succeeds after import updates
  - **Given:** All feature UI imports updated
  - **When:** Run `npm run build`
  - **Then:** 4 bundles generated successfully, 0 webpack errors
  - **File:** Webpack build

- [ ] **Test:** All automated tests pass after import updates
  - **Given:** Test files moved and imports updated
  - **When:** Run `npm test`
  - **Then:** All 94 tests pass (or same pass/fail count as baseline)
  - **File:** Jest test suite

## Files to Create/Modify

**Source Files with Import Updates (15 files):**
- [ ] `src/features/authentication/ui/hooks/useSelectionStep.ts`
- [ ] `src/features/authentication/ui/steps/AdobeAuthStep.tsx`
- [ ] `src/features/project-creation/ui/steps/ProjectCreationStep.tsx`
- [ ] `src/features/project-creation/ui/wizard/WizardContainer.tsx`
- [ ] `src/features/project-creation/ui/App.tsx`
- [ ] `src/features/components/ui/steps/ComponentConfigStep.tsx`
- [ ] `src/features/components/ui/steps/ComponentSelectionStep.tsx`
- [ ] `src/features/dashboard/ui/ProjectDashboardScreen.tsx`
- [ ] `src/features/dashboard/ui/ConfigureScreen.tsx`
- [ ] `src/features/welcome/ui/WelcomeScreen.tsx`
- [ ] `src/features/prerequisites/ui/steps/PrerequisitesStep.tsx`
- [ ] `src/features/mesh/ui/steps/ApiMeshStep.tsx`

**Test Files to Move and Update (10 files):**
- [ ] Move `tests/core/ui/hooks/` → `tests/webview-ui/shared/hooks/` (9 files)
- [ ] Move `tests/core/ui/components/` → `tests/webview-ui/shared/components/feedback/` (1 file)
- [ ] Update imports in 2 feature test files

**Test Directories to Create:**
- [ ] `tests/webview-ui/` - New test directory root
- [ ] `tests/webview-ui/shared/` - Shared test directory
- [ ] `tests/webview-ui/shared/hooks/` - Hook tests
- [ ] `tests/webview-ui/shared/components/` - Component tests
- [ ] `tests/webview-ui/shared/components/feedback/` - Feedback component tests

## Implementation Details

### Phase 1: Update Source File Imports (Automated)

#### 1.1 Create Import Update Script

Create `.rptc/plans/frontend-architecture-cleanup/update-imports.sh`:

```bash
#!/bin/bash

# Update imports from @/core/ui/components/* to @/webview-ui/shared/components/*
# Handles all component import patterns

set -e

echo "=== Updating Source File Imports ==="

# Function to update imports in a file
update_file_imports() {
  local file="$1"
  echo "Processing: $file"

  # Backup file
  cp "$file" "$file.bak"

  # Update component imports - map to new function-based directories
  # FormField → forms/
  sed -i '' "s|from '@/core/ui/components/FormField'|from '@/webview-ui/shared/components/forms/FormField'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/FormField"|from "@/webview-ui/shared/components/forms/FormField"|g' "$file"

  # LoadingDisplay, StatusCard → feedback/
  sed -i '' "s|from '@/core/ui/components/LoadingDisplay'|from '@/webview-ui/shared/components/feedback/LoadingDisplay'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/LoadingDisplay"|from "@/webview-ui/shared/components/feedback/LoadingDisplay"|g' "$file"
  sed -i '' "s|from '@/core/ui/components/StatusCard'|from '@/webview-ui/shared/components/feedback/StatusCard'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/StatusCard"|from "@/webview-ui/shared/components/feedback/StatusCard"|g' "$file"

  # Modal, FadeTransition, NumberedInstructions → ui/
  sed -i '' "s|from '@/core/ui/components/Modal'|from '@/webview-ui/shared/components/ui/Modal'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/Modal"|from "@/webview-ui/shared/components/ui/Modal"|g' "$file"
  sed -i '' "s|from '@/core/ui/components/FadeTransition'|from '@/webview-ui/shared/components/ui/FadeTransition'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/FadeTransition"|from "@/webview-ui/shared/components/ui/FadeTransition"|g' "$file"
  sed -i '' "s|from '@/core/ui/components/NumberedInstructions'|from '@/webview-ui/shared/components/ui/NumberedInstructions'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/NumberedInstructions"|from "@/webview-ui/shared/components/ui/NumberedInstructions"|g' "$file"

  # TwoColumnLayout, GridLayout → layout/
  sed -i '' "s|from '@/core/ui/components/TwoColumnLayout'|from '@/webview-ui/shared/components/layout/TwoColumnLayout'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/TwoColumnLayout"|from "@/webview-ui/shared/components/layout/TwoColumnLayout"|g' "$file"
  sed -i '' "s|from '@/core/ui/components/GridLayout'|from '@/webview-ui/shared/components/layout/GridLayout'|g" "$file"
  sed -i '' 's|from "@/core/ui/components/GridLayout"|from "@/webview-ui/shared/components/layout/GridLayout"|g' "$file"

  # Generic component barrel import
  sed -i '' "s|from '@/core/ui/components'|from '@/webview-ui/shared/components'|g" "$file"
  sed -i '' 's|from "@/core/ui/components"|from "@/webview-ui/shared/components"|g' "$file"

  # Hook imports
  sed -i '' "s|from '@/core/ui/hooks|from '@/webview-ui/shared/hooks|g" "$file"
  sed -i '' 's|from "@/core/ui/hooks|from "@/webview-ui/shared/hooks|g' "$file"

  # Styles imports
  sed -i '' "s|from '@/core/ui/styles|from '@/webview-ui/shared/styles|g" "$file"
  sed -i '' 's|from "@/core/ui/styles|from "@/webview-ui/shared/styles|g' "$file"

  # Types imports
  sed -i '' "s|from '@/core/ui/types|from '@/webview-ui/shared/types|g" "$file"
  sed -i '' 's|from "@/core/ui/types|from "@/webview-ui/shared/types|g' "$file"

  # Utils imports
  sed -i '' "s|from '@/core/ui/utils|from '@/webview-ui/shared/utils|g" "$file"
  sed -i '' 's|from "@/core/ui/utils|from "@/webview-ui/shared/utils|g' "$file"

  # vscode-api import
  sed -i '' "s|from '@/core/ui/vscode-api'|from '@/webview-ui/shared/vscode-api'|g" "$file"
  sed -i '' 's|from "@/core/ui/vscode-api"|from "@/webview-ui/shared/vscode-api"|g' "$file"

  # Verify changes made
  if ! diff -q "$file" "$file.bak" >/dev/null 2>&1; then
    echo "  ✓ Updated"
  else
    echo "  - No changes needed"
  fi
}

# Update all source files with @/core/ui imports
while IFS= read -r file; do
  update_file_imports "$file"
done < <(grep -r "from ['\"]@/core/ui" src/features --include="*.ts" --include="*.tsx" -l 2>/dev/null || true)

echo ""
echo "=== Verification ==="

# Count remaining @/core/ui imports in source files
remaining=$(grep -r "from ['\"]@/core/ui" src/features --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "Remaining @/core/ui imports in src/features: $remaining"

if [ "$remaining" -eq 0 ]; then
  echo "✓ All source imports updated successfully"

  # Remove backup files
  find src/features -name "*.bak" -delete

  exit 0
else
  echo "⚠️  Some imports remain - manual review needed"
  echo "Run: grep -r \"from.*@/core/ui\" src/features"
  exit 1
fi
```

#### 1.2 Run Import Update Script

```bash
# Make script executable
chmod +x .rptc/plans/frontend-architecture-cleanup/update-imports.sh

# Run script
./.rptc/plans/frontend-architecture-cleanup/update-imports.sh

# Verify output
# Expected: "✓ All source imports updated successfully"
```

#### 1.3 Manual Review of Updated Files

```bash
# Review changes in git
git diff src/features

# Check specific files
git diff src/features/components/ui/steps/ComponentConfigStep.tsx
git diff src/features/dashboard/ui/ProjectDashboardScreen.tsx
```

### Phase 2: Move and Update Test Files

#### 2.0 Delete Orphaned Tests First (Based on Step 1.5 Analysis)

```bash
# Review test alignment report
cat .rptc/plans/frontend-architecture-cleanup/usage-report-tests.txt

# Identify tests marked "DELETE (orphaned)" or "DELETE (no source)"
# For each orphaned test:
#   - Verify component was deleted in Step 3
#   - Delete test file

# EXAMPLE: If Badge component was deleted in Step 3, delete its test
# if grep -q "Badge.*DELETE" .rptc/plans/frontend-architecture-cleanup/usage-report-components.txt; then
#   echo "Deleting orphaned test for Badge component"
#   git rm tests/webview-ui/shared/components/Badge.test.tsx
# fi

# Manual review and deletion (adjust paths based on actual orphaned tests)
# Replace these examples with actual orphaned tests from report:

# git rm tests/path/to/orphaned-test.test.tsx
# git rm tests/path/to/another-orphaned-test.test.ts

# Verify deletions
git status | grep "deleted:.*test\."
```

#### 2.1 Create Test Directory Structure

```bash
# Create test directories
mkdir -p tests/webview-ui/shared/hooks
mkdir -p tests/webview-ui/shared/components/feedback

# Verify creation
find tests/webview-ui -type d
```

#### 2.2 Move Hook Test Files

```bash
cd tests/core/ui/hooks

# Move all hook tests
git mv useVSCodeRequest.test.ts ../../../webview-ui/shared/hooks/
git mv useLoadingState.test.ts ../../../webview-ui/shared/hooks/
git mv useSearchFilter.test.ts ../../../webview-ui/shared/hooks/
git mv useSelectableDefault.test.ts ../../../webview-ui/shared/hooks/
git mv useSelection.test.ts ../../../webview-ui/shared/hooks/
git mv useVSCodeMessage.test.ts ../../../webview-ui/shared/hooks/
git mv useAutoScroll.test.ts ../../../webview-ui/shared/hooks/
git mv useFocusTrap.test.ts ../../../webview-ui/shared/hooks/
git mv useAsyncData.test.ts ../../../webview-ui/shared/hooks/

cd ../../../..

# Verify moves
git status | grep "renamed:.*test.ts"
```

#### 2.3 Move Component Test File

```bash
cd tests/core/ui/components

# Move LoadingDisplay test
git mv LoadingDisplay.test.tsx ../../../webview-ui/shared/components/feedback/

cd ../../../..

# Verify move
git status | grep "renamed:.*LoadingDisplay.test.tsx"
```

#### 2.4 Delete Empty test/core/ui Directory

```bash
# Verify empty
find tests/core/ui -type f
# Expected: 0 results (or only .gitkeep)

# Delete directory
git rm -r tests/core/ui

# Verify deletion
ls tests/core/ui 2>&1
# Expected: "No such file or directory"
```

#### 2.5 Update Test File Imports

Create `.rptc/plans/frontend-architecture-cleanup/update-test-imports.sh`:

```bash
#!/bin/bash

# Update imports in test files

set -e

echo "=== Updating Test File Imports ==="

# Update moved hook tests
for test_file in tests/webview-ui/shared/hooks/*.test.ts; do
  echo "Processing: $test_file"

  # Backup
  cp "$test_file" "$test_file.bak"

  # Update imports from @/core/ui to @/webview-ui/shared
  sed -i '' "s|from '@/core/ui/hooks|from '@/webview-ui/shared/hooks|g" "$test_file"
  sed -i '' 's|from "@/core/ui/hooks|from "@/webview-ui/shared/hooks|g' "$test_file"
  sed -i '' "s|from '@/core/ui/components|from '@/webview-ui/shared/components|g" "$test_file"
  sed -i '' 's|from "@/core/ui/components|from "@/webview-ui/shared/components"|g' "$test_file"

  echo "  ✓ Updated"
done

# Update LoadingDisplay test
test_file="tests/webview-ui/shared/components/feedback/LoadingDisplay.test.tsx"
if [ -f "$test_file" ]; then
  echo "Processing: $test_file"

  cp "$test_file" "$test_file.bak"

  sed -i '' "s|from '@/core/ui/components/LoadingDisplay'|from '@/webview-ui/shared/components/feedback/LoadingDisplay'|g" "$test_file"
  sed -i '' 's|from "@/core/ui/components/LoadingDisplay"|from "@/webview-ui/shared/components/feedback/LoadingDisplay"|g' "$test_file"

  echo "  ✓ Updated"
fi

# Update feature test files
for test_file in tests/features/components/ui/steps/*.test.tsx; do
  if grep -q "@/core/ui" "$test_file" 2>/dev/null; then
    echo "Processing: $test_file"

    cp "$test_file" "$test_file.bak"

    # Update component imports
    sed -i '' "s|from '@/core/ui/components/FormField'|from '@/webview-ui/shared/components/forms/FormField'|g" "$test_file"
    sed -i '' 's|from "@/core/ui/components/FormField"|from "@/webview-ui/shared/components/forms/FormField"|g' "$test_file"
    sed -i '' "s|from '@/core/ui/components|from '@/webview-ui/shared/components|g" "$test_file"
    sed -i '' 's|from "@/core/ui/components|from "@/webview-ui/shared/components"|g' "$test_file"

    echo "  ✓ Updated"
  fi
done

echo ""
echo "=== Verification ==="

# Count remaining @/core/ui imports in tests
remaining=$(grep -r "from ['\"]@/core/ui" tests/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "Remaining @/core/ui imports in tests/: $remaining"

if [ "$remaining" -eq 0 ]; then
  echo "✓ All test imports updated successfully"

  # Remove backup files
  find tests/ -name "*.bak" -delete

  exit 0
else
  echo "⚠️  Some imports remain - manual review needed"
  echo "Run: grep -r \"from.*@/core/ui\" tests/"
  exit 1
fi
```

#### 2.6 Run Test Import Update Script

```bash
# Make executable
chmod +x .rptc/plans/frontend-architecture-cleanup/update-test-imports.sh

# Run script
./.rptc/plans/frontend-architecture-cleanup/update-test-imports.sh

# Expected: "✓ All test imports updated successfully"
```

### Phase 3: Verify Import Updates

#### 3.1 Verify No Remaining @/core/ui Imports

```bash
# Search entire codebase
grep -r "from ['\"]@/core/ui" src/ tests/ webview-ui/ 2>/dev/null
# Expected: 0 results

# Double-check with different quote styles
grep -r "@/core/ui" src/ tests/ webview-ui/ --include="*.ts" --include="*.tsx" 2>/dev/null
# Expected: Only comments/documentation, no actual imports
```

#### 3.2 TypeScript Compilation Check

```bash
# Run TypeScript compiler
npm run compile:typescript 2>&1 | tee /tmp/step5-typescript.txt

# Count errors
errors=$(grep "error TS" /tmp/step5-typescript.txt | wc -l | tr -d ' ')
echo "TypeScript errors: $errors"

# Expected: 14 errors (same as baseline from Step 1)
# If more errors, investigate
```

#### 3.3 Webpack Build Check

```bash
# Build all webview bundles
npm run build 2>&1 | tee /tmp/step5-webpack.txt

# Check for errors
if grep -q "ERROR" /tmp/step5-webpack.txt; then
  echo "⚠️  Webpack errors found - review output"
  grep "ERROR" /tmp/step5-webpack.txt
  exit 1
else
  echo "✓ Webpack build successful"
fi

# Verify bundles created
ls -lh dist/webview/*.js
# Expected: wizard-bundle.js, welcome-bundle.js, dashboard-bundle.js, configure-bundle.js
```

#### 3.4 Run Test Suite

```bash
# Run all tests
npm test 2>&1 | tee /tmp/step5-tests.txt

# Count pass/fail
passed=$(grep -E "PASS" /tmp/step5-tests.txt | wc -l | tr -d ' ')
failed=$(grep -E "FAIL" /tmp/step5-tests.txt | wc -l | tr -d ' ')

echo "Tests passed: $passed"
echo "Tests failed: $failed"

# Compare to baseline (from Step 1)
# Expected: Same pass/fail count as baseline
```

### Phase 4: Update TypeScript Path Alias

#### 4.1 Update tsconfig.json

Edit `tsconfig.json` to remove @/core/ui alias:

```json
{
  "compilerOptions": {
    "baseUrl": "./",
    "paths": {
      "@/features/*": ["src/features/*"],
      "@/shared/*": ["src/shared/*"],
      "@/services/*": ["src/services/*"],
      "@/types": ["src/types"],
      "@/types/*": ["src/types/*"],
      "@/providers/*": ["src/providers/*"],
      "@/utils/*": ["src/utils/*"],
      "@/webview-ui/*": ["webview-ui/src/*"],
      "@/design-system/*": ["webview-ui/src/shared/components/*"]
      // REMOVED: "@/core/*": ["src/core/*"] - no longer needed
    }
  }
}
```

**Note:** Only remove `@/core/*` if `src/core/` has no other subdirectories. If `src/core/` still has other modules, keep the alias.

#### 4.2 Verify TypeScript After Alias Removal

```bash
# Recompile
npm run compile:typescript 2>&1 | tee /tmp/step5-typescript-final.txt

# Should have same error count as before
```

### Phase 5: Create Commit Checkpoint

```bash
# Stage all changes
git add .

# Commit
git commit -m "refactor: update all imports from @/core/ui to @/webview-ui/shared

- Update 15 source files in src/features/*/ui/ with new import paths
- Map imports to function-based directories:
  - FormField → forms/
  - LoadingDisplay, StatusCard → feedback/
  - Modal, FadeTransition, NumberedInstructions → ui/
  - TwoColumnLayout, GridLayout → layout/
  - Hooks → shared/hooks/
- Move test files from tests/core/ui/ → tests/webview-ui/shared/
  - 9 hook tests → tests/webview-ui/shared/hooks/
  - 1 component test → tests/webview-ui/shared/components/feedback/
- Update all test imports to new paths
- Delete tests/core/ui/ directory
- Remove @/core/ui path alias from tsconfig.json (if applicable)

Verified:
- 0 remaining @/core/ui imports
- TypeScript compilation: 14 errors (baseline)
- Webpack build: SUCCESS (4 bundles)
- Test suite: [pass/fail count]

Part of frontend-architecture-cleanup plan
Refs: .rptc/plans/frontend-architecture-cleanup/"

# Verify commit
git log -1 --stat
```

## Expected Outcome

- [ ] All 30 imports updated from @/core/ui to @/webview-ui/shared/*
- [ ] 10 test files moved to tests/webview-ui/shared/
- [ ] All test imports updated
- [ ] tests/core/ui/ directory deleted
- [ ] TypeScript compilation clean (14 baseline errors only)
- [ ] Webpack build succeeds (4 bundles)
- [ ] Test suite passes (or matches baseline)
- [ ] 0 remaining @/core/ui references
- [ ] Git commit created

## Acceptance Criteria

- [ ] No @/core/ui imports remain in codebase
- [ ] TypeScript error count matches baseline (14 errors)
- [ ] Webpack build generates 4 bundles successfully
- [ ] Test suite pass/fail count matches Step 1 baseline
- [ ] All test files in tests/webview-ui/shared/
- [ ] tsconfig.json updated (if applicable)
- [ ] Git commit documents all changes

**Estimated Time:** 2-3 hours

---

## Rollback Strategy

**If import updates fail:**

```bash
# Rollback commit
git reset --hard HEAD~1

# Restore backup files if needed
find src/ tests/ -name "*.bak" | while read backup; do
  original="${backup%.bak}"
  mv "$backup" "$original"
done

# Verify @/core/ui imports restored
grep -r "from.*@/core/ui" src/ tests/ | wc -l
# Expected: 30 imports (original count)
```

**Cost:** Medium (automated updates are reversible, but time-consuming to redo)
