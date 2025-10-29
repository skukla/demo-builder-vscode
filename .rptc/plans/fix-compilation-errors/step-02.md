# Step 2: Create Import Mapping Document

## Purpose

Transform Step 1's error analysis into an actionable import path mapping document that guides the automated fix process in Steps 4-6. This document serves as the authoritative reference for all incorrect @/core/* imports and their correct replacements.

## Prerequisites

- [x] Step 1 complete (error-analysis.md exists with categorized errors)
- [x] Understanding of project architecture (@/shared/*, @/types/*, etc.)
- [x] Access to TypeScript compiler for path verification

## Tests to Write First

### Mapping Completeness Tests

- [ ] **Test: All "Cannot find module @/core/*" errors have mapping entries**
  - **Given:** Step 1 identified 94 "Cannot find module" errors for @/core/* imports
  - **When:** Mapping document is reviewed against Step 1 error list
  - **Then:** Every unique @/core/* import path has an entry in mapping table
  - **File:** `tests/unit/compilation/import-mapping-completeness.test.ts`

- [ ] **Test: Mapping excludes correct @/core/* paths**
  - **Given:** Project has legitimate @/core/* directories (ui, config, commands, constants, validation/securityValidation)
  - **When:** Mapping document is reviewed
  - **Then:** No entries exist for @/core/ui/*, @/core/config/*, @/core/commands/*, @/core/constants, @/core/validation/securityValidation
  - **File:** `tests/unit/compilation/correct-imports-excluded.test.ts`

- [ ] **Test: All mapped paths point to existing files**
  - **Given:** Mapping table with replacement paths
  - **When:** Each replacement path is checked against file system
  - **Then:** All paths resolve to actual TypeScript files
  - **File:** `tests/unit/compilation/path-existence.test.ts`

### Path Validation Tests

- [ ] **Test: Replacement paths export expected symbols**
  - **Given:** Import `@/core/di` expects `ServiceLocator` class
  - **When:** Replacement path `@/services/serviceLocator` is examined
  - **Then:** File exports `ServiceLocator` class
  - **File:** `tests/unit/compilation/export-validation.test.ts`

- [ ] **Test: No circular dependency risks in mappings**
  - **Given:** Mapping replaces @/core/* with @/shared/*, @/types/*, @/utils/*
  - **When:** Dependency graph is analyzed
  - **Then:** No circular dependencies detected
  - **File:** `tests/unit/compilation/circular-deps.test.ts`

### Edge Case Tests

- [ ] **Test: Dynamic import() paths identified separately**
  - **Given:** Some errors may be from dynamic import() statements
  - **When:** Mapping document is reviewed
  - **Then:** Dynamic imports flagged for manual verification
  - **File:** `tests/unit/compilation/dynamic-imports.test.ts`

- [ ] **Test: Ambiguous cases documented with resolution plan**
  - **Given:** Some imports may have multiple potential replacements
  - **When:** Ambiguous cases section is reviewed
  - **Then:** Each ambiguous case has investigation notes and resolution recommendation
  - **File:** `tests/unit/compilation/ambiguous-cases.test.ts`

### Format Validation Tests

- [ ] **Test: Mapping table uses correct Markdown format**
  - **Given:** Mapping document should be machine-readable
  - **When:** Document is parsed
  - **Then:** Table has columns: Incorrect Import | Correct Import | Affected Files Count | Notes
  - **File:** `tests/unit/compilation/format-validation.test.ts`

## Files to Create/Modify

### Files to Create

- [ ] `.rptc/plans/fix-compilation-errors/import-mapping.md` - Complete import path mapping document

### Files to Read

- [ ] `.rptc/plans/fix-compilation-errors/fix-compilation-errors.md` - Existing plan with preliminary mappings
- [ ] `src/shared/` - Explore directory structure for correct paths
- [ ] `src/types/` - Explore type definition locations
- [ ] `src/services/` - Check for service locator
- [ ] `src/utils/` - Check for utility files
- [ ] `src/providers/` - Check for StatusBarManager
- [ ] `src/core/` - Identify CORRECT @/core/* imports to exclude

## Implementation Details

### RED Phase: Write Failing Tests

```typescript
// tests/unit/compilation/import-mapping-completeness.test.ts
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

describe('Import Mapping Completeness', () => {
  const mappingPath = path.join(__dirname, '../../../.rptc/plans/fix-compilation-errors/import-mapping.md');
  const errorAnalysisPath = path.join(__dirname, '../../../.rptc/plans/fix-compilation-errors/error-analysis.md');

  it('should have mapping for all @/core/* Cannot find module errors', () => {
    // This will FAIL initially - mapping.md doesn't exist yet
    expect(existsSync(mappingPath)).toBe(true);

    const mappingContent = readFileSync(mappingPath, 'utf-8');
    const errorAnalysis = readFileSync(errorAnalysisPath, 'utf-8');

    // Extract @/core/* paths from error analysis
    const coreImports = extractCoreImports(errorAnalysis);

    // Verify each has a mapping entry
    coreImports.forEach(importPath => {
      expect(mappingContent).toContain(importPath);
    });
  });

  it('should exclude correct @/core/* imports from mapping', () => {
    const mappingContent = readFileSync(mappingPath, 'utf-8');

    // These should NOT appear in mapping (they're correct)
    const correctImports = [
      '@/core/ui/',
      '@/core/config/',
      '@/core/commands/',
      '@/core/constants',
      '@/core/validation/securityValidation'
    ];

    correctImports.forEach(correctImport => {
      expect(mappingContent).not.toContain(correctImport);
    });
  });
});

// tests/unit/compilation/path-existence.test.ts
describe('Replacement Path Existence', () => {
  it('should verify all replacement paths exist', () => {
    const mappingContent = readFileSync(mappingPath, 'utf-8');
    const mappings = parseMappingTable(mappingContent);

    mappings.forEach(mapping => {
      const resolvedPath = resolvePathAlias(mapping.correctImport);
      expect(existsSync(resolvedPath)).toBe(true);
    });
  });
});
```

### GREEN Phase: Minimal Implementation

#### 1. Search for All Incorrect @/core/* Imports

```bash
# Extract all unique @/core/* import paths from errors
npx tsc --noEmit 2>&1 | \
  grep "Cannot find module '@/core" | \
  sed "s/.*Cannot find module '//" | \
  sed "s/'.*//" | \
  sort | uniq -c | \
  sort -rn > /tmp/core-imports.txt
```

**Expected Output:**
```
18 @/core/di
17 @/core/logging
13 @/core/base
11 @/core/validation
6 @/core/state
6 @/core/shell
4 @/core/utils/webviewHTMLBuilder
4 @/core/communication
3 @/core/vscode/StatusBarManager
3 @/core/utils/promiseUtils
2 @/core/errors
1 @/core/utils/ProgressUnifier
1 @/core/utils/loadingHTML
1 @/core/utils/envVarExtraction
```

#### 2. Verify Actual File Locations

```bash
# Search for actual implementations
find src -name "serviceLocator.ts"     # For @/core/di
find src -name "debugLogger.ts"        # For @/core/logging
find src -name "baseCommand.ts"        # For @/core/base
find src -name "shell.ts"              # For @/core/shell
find src -name "statusBar.ts"          # For @/core/vscode/StatusBarManager
find src -name "promiseUtils.ts"       # For @/core/utils/promiseUtils
find src -name "progressUnifier.ts"    # For @/core/utils/ProgressUnifier
find src -name "loadingHTML.ts"        # For @/core/utils/loadingHTML
find src -name "errorLogger.ts"        # For @/core/errors
```

#### 3. Create import-mapping.md

```markdown
# Import Path Mapping

**Purpose**: Authoritative mapping of incorrect @/core/* imports to correct paths

**Generated**: 2025-10-28
**Step 1 Reference**: error-analysis.md
**Total Mappings**: 14

---

## Incorrect → Correct Import Mappings

| Incorrect Import | Correct Import | Affected Files | Notes |
|------------------|----------------|----------------|-------|
| @/core/di | @/services/serviceLocator | 18 | ServiceLocator singleton for DI |
| @/core/logging | @/shared/logging | 17 | DebugLogger, StepLogger, ErrorLogger |
| @/core/base | @/shared/base | 13 | BaseCommand, BaseWebviewCommand |
| @/core/validation | @/shared/validation | 11 | Field validation (NOTE: @/core/validation/securityValidation is CORRECT) |
| @/core/state | @/shared/state | 6 | StateManager, StateCoordinator |
| @/core/shell | @/types/shell | 6 | Shell execution types |
| @/core/communication | @/shared/communication | 4 | WebviewCommunicationManager |
| @/core/utils/promiseUtils | @/utils/promiseUtils | 3 | Promise utility functions |
| @/core/vscode/StatusBarManager | @/providers/statusBar | 3 | Status bar provider |
| @/core/errors | @/shared/logging/errorLogger | 2 | ErrorLogger class |
| @/core/utils/ProgressUnifier | @/utils/progressUnifier | 1 | Progress tracking unifier |
| @/core/utils/loadingHTML | @/utils/loadingHTML | 1 | Loading HTML generator |
| @/core/utils/webviewHTMLBuilder | **AMBIGUOUS** | 4 | See Ambiguous Cases section |
| @/core/utils/envVarExtraction | **DOES NOT EXIST** | 1 | See Missing Implementations section |

---

## Correct @/core/* Imports (DO NOT CHANGE)

These imports are CORRECT and should be excluded from automated replacements:

| Import Path | Location | Purpose |
|-------------|----------|---------|
| @/core/ui/* | src/core/ui/ | React UI components (Modal, LoadingDisplay, etc.) |
| @/core/ui/hooks/* | src/core/ui/hooks/ | React hooks (useVSCodeRequest, useAsyncData, etc.) |
| @/core/ui/components/* | src/core/ui/components/ | UI components (TwoColumnLayout, StatusCard, etc.) |
| @/core/ui/types | src/core/ui/types/ | UI type definitions |
| @/core/config/* | src/core/config/ | ConfigurationLoader |
| @/core/commands/* | src/core/commands/ | Core commands (ResetAllCommand) |
| @/core/constants | src/core/constants.ts | Application constants |
| @/core/validation/securityValidation | src/core/validation/securityValidation.ts | Security validation utilities |

---

## Verification Results

### File Existence Check

All replacement paths verified against file system:

- [x] @/services/serviceLocator → `src/services/serviceLocator.ts` ✅
- [x] @/shared/logging → `src/shared/logging/` (index.ts exports DebugLogger, StepLogger, ErrorLogger) ✅
- [x] @/shared/base → `src/shared/base/` (index.ts exports BaseCommand, BaseWebviewCommand) ✅
- [x] @/shared/validation → `src/shared/validation/` ✅
- [x] @/shared/state → `src/shared/state/` ✅
- [x] @/types/shell → `src/types/shell.ts` ✅
- [x] @/shared/communication → `src/shared/communication/` ✅
- [x] @/utils/promiseUtils → `src/utils/promiseUtils.ts` ✅
- [x] @/providers/statusBar → `src/providers/statusBar.ts` ✅
- [x] @/shared/logging/errorLogger → `src/shared/logging/errorLogger.ts` ✅
- [x] @/utils/progressUnifier → `src/utils/progressUnifier.ts` ✅
- [x] @/utils/loadingHTML → `src/utils/loadingHTML.ts` ✅

### Export Validation

Key exports verified:

- **@/services/serviceLocator**: Exports `ServiceLocator` class
- **@/shared/logging**: Exports `DebugLogger`, `StepLogger`, `ErrorLogger`, `getLogger()`
- **@/shared/base**: Exports `BaseCommand`, `BaseWebviewCommand`
- **@/shared/validation**: Exports validation utilities
- **@/shared/state**: Exports `StateManager`, `StateCoordinator`
- **@/types/shell**: Exports `ShellResult`, `ShellExecutor` types
- **@/shared/communication**: Exports `WebviewCommunicationManager`
- **@/utils/promiseUtils**: Exports promise utility functions
- **@/providers/statusBar**: Exports status bar provider (class name may differ - needs verification)
- **@/shared/logging/errorLogger**: Exports `ErrorLogger` class
- **@/utils/progressUnifier**: Exports `ProgressUnifier` class
- **@/utils/loadingHTML**: Exports `getLoadingHTML()` function

---

## Ambiguous Cases

### 1. @/core/utils/webviewHTMLBuilder

**Current Import:**
```typescript
import { generateWebviewHTML } from '@/core/utils/webviewHTMLBuilder';
```

**Problem:**
- File `src/core/utils/webviewHTMLBuilder.ts` does not exist
- Function `generateWebviewHTML` does not exist anywhere in codebase
- Similar functionality exists in `src/utils/loadingHTML.ts` as `getLoadingHTML()`

**Affected Files:** (4 files)
- `src/features/welcome/commands/showWelcome.ts`
- `src/features/dashboard/commands/configure.ts`
- `src/features/dashboard/commands/showDashboard.ts`
- `src/features/project-creation/commands/createProject.ts`

**Investigation Needed:**
1. Determine if `generateWebviewHTML` was planned but never implemented
2. Check if files can use `getLoadingHTML()` from `@/utils/loadingHTML` instead
3. Or create `webviewHTMLBuilder.ts` with `generateWebviewHTML` function

**Recommended Resolution:**
- **Option A**: Replace `generateWebviewHTML` calls with `getLoadingHTML()` from `@/utils/loadingHTML`
- **Option B**: Create `src/utils/webviewHTMLBuilder.ts` that exports `generateWebviewHTML` (possibly wrapping `getLoadingHTML`)
- **Recommendation**: Choose Option A if functionality matches; otherwise Option B

**Mapping Decision (Provisional):**
```
@/core/utils/webviewHTMLBuilder → @/utils/loadingHTML
```
But requires code changes: `generateWebviewHTML()` → `getLoadingHTML()`

---

### 2. @/core/utils/envVarExtraction

**Current Import:**
```typescript
import { extractEnvVars } from '@/core/utils/envVarExtraction';
```

**Problem:**
- File does not exist in codebase
- Function `extractEnvVars` not implemented anywhere

**Affected Files:** (1 file)
- `src/features/mesh/services/stalenessDetector.ts`

**Usage Context:**
```typescript
return extractEnvVars(componentConfig, MESH_ENV_VARS);
```

**Investigation Needed:**
1. Determine expected signature of `extractEnvVars(config, vars)`
2. Check if functionality exists elsewhere under different name
3. Or create implementation

**Recommended Resolution:**
- **Option A**: Create `src/utils/envVarExtraction.ts` with `extractEnvVars` function
- **Option B**: Inline the logic in `stalenessDetector.ts`
- **Option C**: Find existing utility that does this

**Mapping Decision:**
Cannot be mapped until implementation exists. Mark as **REQUIRES CREATION**.

---

## Missing Implementations

### Files That Need to Be Created

1. **@/core/utils/envVarExtraction** → Needs implementation
   - Create `src/utils/envVarExtraction.ts`
   - Implement `extractEnvVars(config: any, vars: string[]): Record<string, string>`
   - Add tests for extraction logic

---

## Circular Dependency Check

Analyzed dependency graph for potential circular dependencies:

- ❌ **No circular dependencies detected** in proposed mappings
- All replacements point to stable infrastructure layers:
  - @/shared/* (shared infrastructure)
  - @/types/* (type definitions only)
  - @/services/* (singleton services)
  - @/utils/* (utility functions)
  - @/providers/* (VS Code providers)

---

## Dynamic Import Analysis

Checked for dynamic `import()` statements that may need special handling:

```bash
grep -r "import(.*@/core" src/ --include="*.ts" --include="*.tsx"
```

**Result:** No dynamic imports of @/core/* found. All imports are static ES6 imports.

---

## Next Steps (Steps 4-6)

This mapping will be used in:

1. **Step 4**: Automated sed/find replacements for straightforward mappings
2. **Step 5**: Manual fixes for ambiguous cases (@/core/utils/webviewHTMLBuilder)
3. **Step 6**: Create missing implementations (@/core/utils/envVarExtraction)

---

## References

- **Step 1**: error-analysis.md (error categorization)
- **TypeScript Config**: tsconfig.json (path alias definitions)
- **Project Structure**: src/CLAUDE.md (architecture overview)
- **Shared Infrastructure**: src/shared/CLAUDE.md
- **Feature Architecture**: src/features/CLAUDE.md
