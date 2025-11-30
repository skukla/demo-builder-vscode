# Step 1: Analyze and Categorize Errors

## Purpose

This step establishes the foundation for systematic error resolution by:
- Capturing the complete error baseline (644 TypeScript compilation errors)
- Categorizing errors by type (module not found, missing exports, strict mode, other)
- Distinguishing between correct @/core/* imports (config, ui, commands, validation) and incorrect imports
- Creating a structured error analysis document to guide Steps 2-7

**Why First**: Cannot fix errors without understanding error patterns and root causes. This analysis prevents shotgun debugging.

---

## Prerequisites

- [x] TypeScript compiler accessible via `npx tsc`
- [x] Project tsconfig.json correctly configured (verified in overview)
- [x] Working directory: `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode`

---

## Tests to Write First

### Compilation Baseline Tests

- [ ] **Test: Capture complete error list from TypeScript compiler**
  - **Given:** Project with 644 compilation errors
  - **When:** Running `npx tsc --noEmit`
  - **Then:** Output contains all errors in parseable format
  - **File:** Manual verification via terminal output

- [ ] **Test: Verify baseline error count is 644**
  - **Given:** Compiler output captured
  - **When:** Counting total errors in output
  - **Then:** Error count equals 644 (±10 acceptable variance)
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

- [ ] **Test: Confirm error format is parseable**
  - **Given:** Compiler error output
  - **When:** Parsing error messages for file paths, line numbers, error codes
  - **Then:** All errors follow format: `[file](line,col): error TS[code]: [message]`
  - **File:** Manual verification via sample inspection

### Error Categorization Tests

- [ ] **Test: Categorize errors by primary type**
  - **Given:** Complete error list
  - **When:** Grouping errors by error code and message pattern
  - **Then:** All 644 errors assigned to exactly one category:
    - **Module Not Found** (`TS2307`, "Cannot find module")
    - **Missing Exports** (`TS2305`, "has no exported member")
    - **Strict Mode Violations** (`TS2532`, `TS2345`, strict null checks)
    - **Other** (miscellaneous errors)
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

- [ ] **Test: Count errors per category**
  - **Given:** Categorized errors
  - **When:** Summing errors in each category
  - **Then:** Category totals sum to 644
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

- [ ] **Test: Calculate percentage distribution**
  - **Given:** Error counts per category
  - **When:** Computing percentage of total
  - **Then:** Percentages sum to 100% (±0.5% rounding)
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

### Module Location Analysis Tests

- [ ] **Test: Identify all @/core/* import paths in errors**
  - **Given:** "Cannot find module" errors
  - **When:** Extracting module paths starting with `@/core/`
  - **Then:** List of all attempted @/core/* imports
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

- [ ] **Test: Verify correct @/core/* locations exist**
  - **Given:** List of @/core/* imports
  - **When:** Checking actual filesystem for `src/core/config`, `src/core/ui`, `src/core/commands`, `src/core/validation`
  - **Then:** These directories exist and should be marked as CORRECT
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

- [ ] **Test: Identify incorrect @/core/* imports**
  - **Given:** List of @/core/* imports
  - **When:** Checking filesystem for non-existent paths (e.g., `@/core/results`, `@/core/di`, `@/core/errors`)
  - **Then:** Non-existent paths marked as INCORRECT with count of affected files
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

- [ ] **Test: Document actual locations for incorrect imports**
  - **Given:** Incorrect @/core/* imports (e.g., `@/core/results`)
  - **When:** Searching filesystem for actual location (e.g., `src/types/results.ts`)
  - **Then:** Mapping table: incorrect import → actual file location
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

### Affected File Analysis Tests

- [ ] **Test: List all files with compilation errors**
  - **Given:** Complete error list
  - **When:** Extracting unique file paths from errors
  - **Then:** Sorted list of files with error counts per file
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

- [ ] **Test: Group files by feature module**
  - **Given:** List of affected files
  - **When:** Grouping by directory structure (authentication, prerequisites, mesh, etc.)
  - **Then:** Feature-based breakdown showing errors per module
  - **File:** `.rptc/plans/fix-compilation-errors/error-analysis.md`

---

## Files to Create/Modify

### Files to Create

- [ ] `.rptc/plans/fix-compilation-errors/error-analysis.md` - Comprehensive error categorization document
- [ ] `.rptc/plans/fix-compilation-errors/errors-raw.txt` - Raw compiler output (for reference)

### Files to Analyze (Read-Only)

- `tsconfig.json` - Path alias configuration
- All files in `src/` directory tree (via compiler output)

---

## Implementation Details

### RED Phase: Write Tests

Since this is an analysis step, tests are verification checkpoints rather than code tests. Each test above represents a validation criterion for the analysis document.

**Verification Approach:**
```bash
# Test 1-3: Baseline verification
npx tsc --noEmit 2>&1 | tee .rptc/plans/fix-compilation-errors/errors-raw.txt
# Count: errors=$(grep "error TS" errors-raw.txt | wc -l)
# Verify: $errors ≈ 644

# Test 4-6: Categorization verification
# Open error-analysis.md and verify:
# - All errors assigned to category
# - Category totals sum to 644
# - Categories are: Module Not Found, Missing Exports, Strict Mode, Other

# Test 7-10: Module location verification
# Verify in error-analysis.md:
# - Table of @/core/* imports with CORRECT/INCORRECT status
# - Correct imports: config, ui, commands, validation
# - Incorrect imports with actual locations documented
```

---

### GREEN Phase: Implementation

**Step-by-Step Instructions:**

#### 1. Capture Raw Compiler Output

```bash
# Navigate to project root
cd /Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode

# Run TypeScript compiler and save output
npx tsc --noEmit 2>&1 | tee .rptc/plans/fix-compilation-errors/errors-raw.txt

# Count total errors
grep "error TS" .rptc/plans/fix-compilation-errors/errors-raw.txt | wc -l
```

**Expected:** ~644 errors (verify baseline)

---

#### 2. Parse Errors by Category

**Error Categories to Create:**

| Category | Error Codes | Pattern | Example |
|----------|-------------|---------|---------|
| **Module Not Found** | `TS2307` | "Cannot find module '@/core/*'" | `Cannot find module '@/core/results'` |
| **Missing Exports** | `TS2305`, `TS2694` | "has no exported member" | `Module '"@/core/ui"' has no exported member 'Button'` |
| **Strict Mode Violations** | `TS2532`, `TS2345`, `TS2322` | Null checks, type mismatches | `Object is possibly 'undefined'` |
| **Other** | Various | Miscellaneous errors | `Cannot find name 'x'` |

**Parsing Strategy:**

```bash
# Count Module Not Found errors
grep -c "error TS2307" errors-raw.txt

# Count Missing Export errors
grep -c "error TS2305\|error TS2694" errors-raw.txt

# Count Strict Mode errors
grep -c "error TS2532\|error TS2345\|error TS2322" errors-raw.txt

# List all unique error codes for "Other" category
grep "error TS" errors-raw.txt | sed -E 's/.*error (TS[0-9]+).*/\1/' | sort | uniq -c | sort -rn
```

---

#### 3. Analyze @/core/* Import Patterns

**Distinguish Correct vs Incorrect:**

```bash
# Extract all @/core/* imports from errors
grep "Cannot find module '@/core" errors-raw.txt | sed -E "s/.*'(@\/core\/[^']+)'.*/\1/" | sort | uniq -c | sort -rn

# Check which directories actually exist in src/core/
ls -la src/core/
# Expected: config/, ui/, commands/, validation/ (CORRECT)
# Missing: results/, di/, errors/, types/ (INCORRECT - moved to @/shared or @/types)
```

**For each incorrect import, document actual location:**

```bash
# Example: Find where "results" actually lives
find src -name "results.ts" -o -name "results.d.ts"
# Expected: src/types/results.ts

# Example: Find where validation functions live
find src -name "*validation.ts" | grep -v test
# Expected: src/shared/validation/securityValidation.ts
```

---

#### 4. Create Error Analysis Document

**Template Structure:**

```markdown
# TypeScript Compilation Error Analysis

**Generated:** [Date]
**Baseline Error Count:** 644 errors
**Analysis Scope:** All files in src/ directory

---

## Error Summary by Category

| Category | Count | Percentage | Error Codes |
|----------|-------|------------|-------------|
| Module Not Found | [count] | [%] | TS2307 |
| Missing Exports | [count] | [%] | TS2305, TS2694 |
| Strict Mode Violations | [count] | [%] | TS2532, TS2345, TS2322 |
| Other | [count] | [%] | Various |
| **TOTAL** | **644** | **100%** | |

---

## Module Not Found Errors (Category 1)

### @/core/* Import Analysis

| Import Path | Status | Actual Location | Affected Files | Notes |
|-------------|--------|-----------------|----------------|-------|
| `@/core/config` | ✅ CORRECT | `src/core/config/` | [count] | Keep as-is |
| `@/core/ui` | ✅ CORRECT | `src/core/ui/` | [count] | Keep as-is |
| `@/core/commands` | ✅ CORRECT | `src/core/commands/` | [count] | Keep as-is |
| `@/core/validation` | ✅ CORRECT | `src/core/validation/` | [count] | Keep as-is |
| `@/core/results` | ❌ INCORRECT | `src/types/results.ts` | [count] | Change to @/types/results |
| `@/core/di` | ❌ INCORRECT | NON-EXISTENT | [count] | Remove or implement |
| [additional incorrect imports] | | | | |

**Total Module Not Found Errors:** [count]

---

## Missing Export Errors (Category 2)

### Export Issues by Module

| Module | Missing Export | Affected Files | Resolution |
|--------|----------------|----------------|------------|
| `@/core/validation` | Multiple functions | [count] | Add index.ts barrel export |
| `@/types` | `DataResult` | [count] | Add export to results.ts |
| [additional issues] | | | |

**Total Missing Export Errors:** [count]

---

## Strict Mode Violations (Category 3)

### Breakdown by Type

- **TS2532** (Possibly undefined): [count] errors
- **TS2345** (Type mismatch): [count] errors
- **TS2322** (Type assignment): [count] errors

**Note:** These will likely resolve automatically after fixing import paths. Reassess in Step 7.

**Total Strict Mode Errors:** [count]

---

## Other Errors (Category 4)

[List unique error patterns not fitting above categories]

**Total Other Errors:** [count]

---

## Affected Files by Feature Module

| Feature Module | Files with Errors | Total Errors |
|----------------|-------------------|--------------|
| authentication | [count] files | [count] errors |
| prerequisites | [count] files | [count] errors |
| mesh | [count] files | [count] errors |
| project-creation | [count] files | [count] errors |
| dashboard | [count] files | [count] errors |
| updates | [count] files | [count] errors |
| lifecycle | [count] files | [count] errors |
| core | [count] files | [count] errors |
| shared | [count] files | [count] errors |
| tests | [count] files | [count] errors |
| **TOTAL** | **[count] files** | **644 errors** |

---

## Key Findings

### Root Cause
- Incomplete refactoring: @/core/* imports added but files never moved to src/core/
- Majority of errors from incorrect @/core/* paths that should be @/shared/* or @/types/*

### Correct @/core/* Structure (Preserve These)
- ✅ `@/core/config` → `src/core/config/`
- ✅ `@/core/ui` → `src/core/ui/`
- ✅ `@/core/commands` → `src/core/commands/`
- ✅ `@/core/validation` → `src/core/validation/`

### Incorrect @/core/* Imports (Fix These)
- ❌ `@/core/results` → Should be `@/types/results`
- ❌ `@/core/di` → Non-existent, remove or implement
- ❌ [additional incorrect imports]

### Priority Fixes
1. **Step 2:** Create comprehensive import mapping (incorrect → correct)
2. **Step 3:** Add missing index.ts exports for validation and types
3. **Steps 4-5:** Batch fix all incorrect @/core/* imports
4. **Step 6:** Handle any non-existent modules
5. **Step 7:** Verify 0 errors remaining

---

## Next Actions

- [x] Error analysis complete
- [ ] Proceed to Step 2: Create Import Mapping Document
- [ ] Use this analysis to guide systematic path corrections in Steps 3-6
```

**Implementation:**
- Manually fill in counts from parsing step
- Use grep/find commands to populate tables
- Ensure all 644 errors accounted for in categories

---

### REFACTOR Phase

**Analysis Optimization:**

1. **Script Creation** (Optional): If error parsing is complex, create a Node.js script:

```javascript
// scripts/analyze-errors.js
const fs = require('fs');

const rawErrors = fs.readFileSync('.rptc/plans/fix-compilation-errors/errors-raw.txt', 'utf8');
const errors = rawErrors.split('\n').filter(line => line.includes('error TS'));

const categories = {
  moduleNotFound: errors.filter(e => e.includes('TS2307')),
  missingExports: errors.filter(e => e.match(/TS2305|TS2694/)),
  strictMode: errors.filter(e => e.match(/TS2532|TS2345|TS2322/)),
  other: []
};

// Populate 'other' category
categories.other = errors.filter(e =>
  !categories.moduleNotFound.includes(e) &&
  !categories.missingExports.includes(e) &&
  !categories.strictMode.includes(e)
);

// Output categorized counts
console.log('Error Analysis:');
console.log(`Module Not Found: ${categories.moduleNotFound.length}`);
console.log(`Missing Exports: ${categories.missingExports.length}`);
console.log(`Strict Mode: ${categories.strictMode.length}`);
console.log(`Other: ${categories.other.length}`);
console.log(`TOTAL: ${errors.length}`);
```

**Run:** `node scripts/analyze-errors.js`

2. **Validation Script**: Verify analysis completeness

```bash
# Ensure all errors categorized
total_categorized=$(grep -E "^(Module Not Found|Missing Exports|Strict Mode|Other):" error-analysis.md | sed 's/.*: //' | paste -sd+ | bc)
echo "Total categorized: $total_categorized (should be 644)"
```

---

## Expected Outcome

After completing this step:

- **Document Created:** `.rptc/plans/fix-compilation-errors/error-analysis.md` with complete categorization
- **Raw Output Saved:** `.rptc/plans/fix-compilation-errors/errors-raw.txt` for reference
- **Understanding Achieved:** Clear distinction between correct @/core/* imports (preserve) and incorrect imports (fix)
- **Error Counts:** Accurate count per category summing to 644
- **Foundation Laid:** Comprehensive data to guide Steps 2-7

**Compilation Status:** Still 644 errors (no fixes yet, analysis only)

---

## Acceptance Criteria

- [ ] `.rptc/plans/fix-compilation-errors/error-analysis.md` created and comprehensive
- [ ] All 644 errors categorized into exactly one category (Module Not Found, Missing Exports, Strict Mode, Other)
- [ ] Category totals sum to 644 (±1% rounding acceptable)
- [ ] Table of @/core/* imports distinguishes CORRECT (config, ui, commands, validation) from INCORRECT
- [ ] For each incorrect @/core/* import, actual file location documented
- [ ] Affected files grouped by feature module with error counts
- [ ] Raw compiler output saved in `errors-raw.txt`
- [ ] Key findings section identifies root cause and priority fixes
- [ ] Manual verification: spot-check 10 random errors to confirm categorization accuracy

---

## Dependencies from Other Steps

**None** - This is the first step, no dependencies.

**Blocks:**
- Step 2 (Import Mapping) depends on this analysis
- All subsequent steps depend on understanding error patterns

---

## Estimated Time

**30-45 minutes**

- 5 min: Capture compiler output
- 10 min: Parse and categorize errors
- 15 min: Analyze @/core/* patterns and verify filesystem
- 10 min: Create error-analysis.md document
- 5 min: Validation and spot-checks

---

## Risk Mitigation

**Risk:** Error count significantly different than 644
- **Mitigation:** Accept ±10% variance (578-708 errors), document actual count
- **Contingency:** If >20% variance, verify baseline with PM before proceeding

**Risk:** Unable to determine correct locations for some incorrect imports
- **Mitigation:** Mark as "TBD - requires investigation" in analysis
- **Contingency:** Address in Step 6 (Missing/Nonexistent Module Imports)

**Risk:** Categorization ambiguous for some errors
- **Mitigation:** Create "Multiple Categories" section for ambiguous errors
- **Contingency:** Document rationale for categorization decisions

---

**Status:** ⏳ Ready to execute
**Next Step After Completion:** Step 2 - Create Import Mapping Document
