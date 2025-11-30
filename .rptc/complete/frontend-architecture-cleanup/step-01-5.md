# Step 1.5: Usage Analysis and Dead Code Identification

**Purpose:** Analyze every component, hook, and test to determine actual usage in the codebase. Identify dead code for deletion instead of migration. This prevents wasting effort moving unused components.

**Prerequisites:**

- [x] Step 1: Pre-Flight Verification complete
- [ ] Git working tree clean
- [ ] All assumptions verified

## Tests to Write First

**NO NEW TESTS** - This is analysis and verification only

- [ ] **Verification:** Usage analysis script executes successfully
  - **Given:** Analysis script created
  - **When:** Execute `bash .rptc/plans/frontend-architecture-cleanup/usage-analyzer.sh`
  - **Then:** Script completes without errors, generates all 4 report files
  - **File:** Manual verification

- [ ] **Verification:** Component usage counts are accurate
  - **Given:** Component usage report generated
  - **When:** Manually verify 3 random components from report
  - **Then:** Import counts match actual grep results
  - **File:** Manual verification

- [ ] **Verification:** Test alignment report identifies all orphaned tests
  - **Given:** Test alignment report generated
  - **When:** Check for tests of non-existent components
  - **Then:** All orphaned tests identified correctly
  - **File:** Manual verification

## Files to Create/Modify

- [ ] `.rptc/plans/frontend-architecture-cleanup/usage-analyzer.sh` - Automated analysis script
- [ ] `.rptc/plans/frontend-architecture-cleanup/usage-report-components.txt` - Component usage analysis
- [ ] `.rptc/plans/frontend-architecture-cleanup/usage-report-hooks.txt` - Hook usage analysis
- [ ] `.rptc/plans/frontend-architecture-cleanup/usage-report-tests.txt` - Test alignment analysis
- [ ] `.rptc/plans/frontend-architecture-cleanup/dead-code-summary.txt` - Dead code summary
- [ ] `.rptc/plans/frontend-architecture-cleanup/deletion-checklist.md` - Manual review checklist

## Implementation Details

### 1. Create Usage Analysis Script

Create `.rptc/plans/frontend-architecture-cleanup/usage-analyzer.sh`:

```bash
#!/bin/bash

# Usage Analyzer - Identify dead code before migration
# Analyzes all components, hooks, and tests for actual usage

set -e

PLAN_DIR=".rptc/plans/frontend-architecture-cleanup"
OUTPUT_DIR="$PLAN_DIR"

echo "========================================="
echo "Frontend Architecture - Usage Analysis"
echo "========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Counters
TOTAL_COMPONENTS=0
UNUSED_COMPONENTS=0
TOTAL_HOOKS=0
UNUSED_HOOKS=0
TOTAL_TESTS=0
ORPHANED_TESTS=0

# Output files
COMPONENT_REPORT="$OUTPUT_DIR/usage-report-components.txt"
HOOK_REPORT="$OUTPUT_DIR/usage-report-hooks.txt"
TEST_REPORT="$OUTPUT_DIR/usage-report-tests.txt"
SUMMARY_REPORT="$OUTPUT_DIR/dead-code-summary.txt"

# Clear previous reports
> "$COMPONENT_REPORT"
> "$HOOK_REPORT"
> "$TEST_REPORT"
> "$SUMMARY_REPORT"

echo "Component Usage Report" > "$COMPONENT_REPORT"
echo "=====================" >> "$COMPONENT_REPORT"
echo "" >> "$COMPONENT_REPORT"
echo "Generated: $(date)" >> "$COMPONENT_REPORT"
echo "" >> "$COMPONENT_REPORT"

# Function to analyze component usage
analyze_component() {
    local file="$1"
    local component_name=$(basename "$file" .tsx)
    local dir=$(dirname "$file")

    TOTAL_COMPONENTS=$((TOTAL_COMPONENTS + 1))

    # Count imports (excluding self-references and test files)
    local usage_count=0
    local used_in=""

    # Search for imports across codebase (excluding the file itself and its tests)
    while IFS= read -r line; do
        usage_count=$((usage_count + 1))
        local using_file=$(echo "$line" | cut -d: -f1)
        used_in+="  - $using_file\n"
    done < <(grep -r "from.*['\"].*$component_name['\"]" \
        src/ webview-ui/ \
        --include="*.ts" --include="*.tsx" \
        2>/dev/null | \
        grep -v "$file" | \
        grep -v "test.tsx" | \
        grep -v "test.ts" || true)

    # Also check for direct name usage (might be imported via barrel)
    while IFS= read -r line; do
        local using_file=$(echo "$line" | cut -d: -f1)
        # Only count if not already counted
        if ! echo -e "$used_in" | grep -q "$using_file"; then
            usage_count=$((usage_count + 1))
            used_in+="  - $using_file (via barrel export)\n"
        fi
    done < <(grep -r "\b$component_name\b" \
        src/ webview-ui/ \
        --include="*.ts" --include="*.tsx" \
        2>/dev/null | \
        grep -v "$file" | \
        grep -v "test.tsx" | \
        grep -v "test.ts" | \
        grep -v "index.ts" | \
        grep -v "//$component_name" || true)

    # Determine decision
    local decision="MIGRATE ✓"
    local decision_color="$GREEN"
    if [ $usage_count -eq 0 ]; then
        decision="DELETE ✗"
        decision_color="$RED"
        UNUSED_COMPONENTS=$((UNUSED_COMPONENTS + 1))
    elif [ $usage_count -le 2 ]; then
        decision="REVIEW ⚠️"
        decision_color="$YELLOW"
    fi

    # Write to report
    echo "Component: $component_name" >> "$COMPONENT_REPORT"
    echo "File: $file" >> "$COMPONENT_REPORT"
    echo "Usage Count: $usage_count" >> "$COMPONENT_REPORT"
    if [ $usage_count -gt 0 ]; then
        echo "Used In:" >> "$COMPONENT_REPORT"
        echo -e "$used_in" >> "$COMPONENT_REPORT"
    else
        echo "Used In: (none)" >> "$COMPONENT_REPORT"
    fi
    echo "Decision: $decision" >> "$COMPONENT_REPORT"
    echo "" >> "$COMPONENT_REPORT"
    echo "---" >> "$COMPONENT_REPORT"
    echo "" >> "$COMPONENT_REPORT"

    # Console output
    echo -e "${decision_color}$component_name${NC}: $usage_count usages → $decision"
}

# Function to analyze hook usage
analyze_hook() {
    local file="$1"
    local hook_name=$(basename "$file" .ts)

    TOTAL_HOOKS=$((TOTAL_HOOKS + 1))

    # Count imports (excluding self-references and test files)
    local usage_count=0
    local used_in=""

    while IFS= read -r line; do
        usage_count=$((usage_count + 1))
        local using_file=$(echo "$line" | cut -d: -f1)
        used_in+="  - $using_file\n"
    done < <(grep -r "from.*['\"].*$hook_name['\"]" \
        src/ webview-ui/ \
        --include="*.ts" --include="*.tsx" \
        2>/dev/null | \
        grep -v "$file" | \
        grep -v "test.tsx" | \
        grep -v "test.ts" || true)

    # Also check for direct usage (imported via barrel)
    while IFS= read -r line; do
        local using_file=$(echo "$line" | cut -d: -f1)
        if ! echo -e "$used_in" | grep -q "$using_file"; then
            usage_count=$((usage_count + 1))
            used_in+="  - $using_file (via barrel export)\n"
        fi
    done < <(grep -r "\b$hook_name\b" \
        src/ webview-ui/ \
        --include="*.ts" --include="*.tsx" \
        2>/dev/null | \
        grep -v "$file" | \
        grep -v "test.tsx" | \
        grep -v "test.ts" | \
        grep -v "index.ts" || true)

    # Determine decision
    local decision="MIGRATE ✓"
    local decision_color="$GREEN"
    if [ $usage_count -eq 0 ]; then
        decision="DELETE ✗"
        decision_color="$RED"
        UNUSED_HOOKS=$((UNUSED_HOOKS + 1))
    elif [ $usage_count -le 2 ]; then
        decision="REVIEW ⚠️"
        decision_color="$YELLOW"
    fi

    # Write to report
    echo "Hook: $hook_name" >> "$HOOK_REPORT"
    echo "File: $file" >> "$HOOK_REPORT"
    echo "Usage Count: $usage_count" >> "$HOOK_REPORT"
    if [ $usage_count -gt 0 ]; then
        echo "Used In:" >> "$HOOK_REPORT"
        echo -e "$used_in" >> "$HOOK_REPORT"
    else
        echo "Used In: (none)" >> "$HOOK_REPORT"
    fi
    echo "Decision: $decision" >> "$HOOK_REPORT"
    echo "" >> "$HOOK_REPORT"
    echo "---" >> "$HOOK_REPORT"
    echo "" >> "$HOOK_REPORT"

    # Console output
    echo -e "${decision_color}$hook_name${NC}: $usage_count usages → $decision"
}

# Function to analyze test alignment
analyze_test() {
    local test_file="$1"
    local test_name=$(basename "$test_file" .test.tsx)
    test_name=$(basename "$test_name" .test.ts)

    TOTAL_TESTS=$((TOTAL_TESTS + 1))

    # Infer source file path
    local source_file=""
    local source_exists="NO"
    local source_used="N/A"
    local decision="KEEP"

    # Check in same directory structure (replace tests/ with src/ or webview-ui/)
    local potential_src=$(echo "$test_file" | sed 's|^tests/|src/|' | sed 's|\.test\.tsx$|.tsx|' | sed 's|\.test\.ts$|.ts|')
    local potential_webview=$(echo "$test_file" | sed 's|^tests/|webview-ui/src/|' | sed 's|\.test\.tsx$|.tsx|' | sed 's|\.test\.ts$|.ts|')

    if [ -f "$potential_src" ]; then
        source_file="$potential_src"
        source_exists="YES"
    elif [ -f "$potential_webview" ]; then
        source_file="$potential_webview"
        source_exists="YES"
    fi

    # Check if source is used (if it exists)
    if [ "$source_exists" = "YES" ]; then
        local usage_count=$(grep -r "from.*['\"].*$test_name['\"]" \
            src/ webview-ui/ \
            --include="*.ts" --include="*.tsx" \
            2>/dev/null | \
            grep -v "$source_file" | \
            grep -v "test." | \
            wc -l)

        if [ $usage_count -gt 0 ]; then
            source_used="YES"
            decision="KEEP"
        else
            source_used="NO"
            decision="DELETE (orphaned)"
            ORPHANED_TESTS=$((ORPHANED_TESTS + 1))
        fi
    else
        decision="DELETE (no source)"
        ORPHANED_TESTS=$((ORPHANED_TESTS + 1))
    fi

    # Write to report
    echo "Test: $test_name" >> "$TEST_REPORT"
    echo "Test File: $test_file" >> "$TEST_REPORT"
    echo "Source File: ${source_file:-NOT FOUND}" >> "$TEST_REPORT"
    echo "Source Exists: $source_exists" >> "$TEST_REPORT"
    echo "Source Used: $source_used" >> "$TEST_REPORT"
    echo "Decision: $decision" >> "$TEST_REPORT"
    echo "" >> "$TEST_REPORT"
    echo "---" >> "$TEST_REPORT"
    echo "" >> "$TEST_REPORT"

    # Console output
    if [ "$decision" = "KEEP" ]; then
        echo -e "${GREEN}$test_name${NC}: $decision"
    else
        echo -e "${RED}$test_name${NC}: $decision"
    fi
}

echo ""
echo "Analyzing Components..."
echo "======================="

# Analyze components in webview-ui/src/shared/components/
find webview-ui/src/shared/components -name "*.tsx" -type f | while read -r file; do
    # Skip index files
    if [[ "$file" != *"index.tsx" ]]; then
        analyze_component "$file"
    fi
done

echo ""
echo "Analyzing Hooks..."
echo "=================="

# Analyze hooks in webview-ui/src/shared/hooks/
if [ -d "webview-ui/src/shared/hooks" ]; then
    find webview-ui/src/shared/hooks -name "*.ts" -type f | while read -r file; do
        # Skip index files
        if [[ "$file" != *"index.ts" ]]; then
            analyze_hook "$file"
        fi
    done
fi

echo ""
echo "Analyzing Tests..."
echo "=================="

# Analyze tests in tests/ directory
find tests -name "*.test.ts" -o -name "*.test.tsx" | while read -r file; do
    analyze_test "$file"
done

# Generate summary report
echo "Dead Code Summary" > "$SUMMARY_REPORT"
echo "=================" >> "$SUMMARY_REPORT"
echo "" >> "$SUMMARY_REPORT"
echo "Generated: $(date)" >> "$SUMMARY_REPORT"
echo "" >> "$SUMMARY_REPORT"
echo "Components Analysis:" >> "$SUMMARY_REPORT"
echo "  Total Components: $TOTAL_COMPONENTS" >> "$SUMMARY_REPORT"
echo "  Unused Components: $UNUSED_COMPONENTS" >> "$SUMMARY_REPORT"
echo "" >> "$SUMMARY_REPORT"
echo "Hooks Analysis:" >> "$SUMMARY_REPORT"
echo "  Total Hooks: $TOTAL_HOOKS" >> "$SUMMARY_REPORT"
echo "  Unused Hooks: $UNUSED_HOOKS" >> "$SUMMARY_REPORT"
echo "" >> "$SUMMARY_REPORT"
echo "Tests Analysis:" >> "$SUMMARY_REPORT"
echo "  Total Tests: $TOTAL_TESTS" >> "$SUMMARY_REPORT"
echo "  Orphaned Tests: $ORPHANED_TESTS" >> "$SUMMARY_REPORT"
echo "" >> "$SUMMARY_REPORT"
echo "Total Dead Code:" >> "$SUMMARY_REPORT"
echo "  Files to Delete: $((UNUSED_COMPONENTS + UNUSED_HOOKS + ORPHANED_TESTS))" >> "$SUMMARY_REPORT"
echo "" >> "$SUMMARY_REPORT"
echo "Recommended Action:" >> "$SUMMARY_REPORT"
echo "  DELETE $UNUSED_COMPONENTS unused components before migration" >> "$SUMMARY_REPORT"
echo "  DELETE $UNUSED_HOOKS unused hooks before migration" >> "$SUMMARY_REPORT"
echo "  DELETE $ORPHANED_TESTS orphaned tests before migration" >> "$SUMMARY_REPORT"
echo "" >> "$SUMMARY_REPORT"

# Console summary
echo ""
echo "========================================="
echo "Dead Code Summary"
echo "========================================="
echo ""
echo "Components:"
echo "  Total: $TOTAL_COMPONENTS"
echo -e "  ${RED}Unused: $UNUSED_COMPONENTS${NC}"
echo ""
echo "Hooks:"
echo "  Total: $TOTAL_HOOKS"
echo -e "  ${RED}Unused: $UNUSED_HOOKS${NC}"
echo ""
echo "Tests:"
echo "  Total: $TOTAL_TESTS"
echo -e "  ${RED}Orphaned: $ORPHANED_TESTS${NC}"
echo ""
echo "========================================="
echo "Total Dead Code: $((UNUSED_COMPONENTS + UNUSED_HOOKS + ORPHANED_TESTS)) files"
echo "========================================="
echo ""
echo "Reports generated:"
echo "  - $COMPONENT_REPORT"
echo "  - $HOOK_REPORT"
echo "  - $TEST_REPORT"
echo "  - $SUMMARY_REPORT"
echo ""
echo "Next step: Review reports and update Step 3 to delete unused code"
echo ""
```

Make script executable:

```bash
chmod +x .rptc/plans/frontend-architecture-cleanup/usage-analyzer.sh
```

### 2. Run Usage Analysis

```bash
# Execute analysis script
bash .rptc/plans/frontend-architecture-cleanup/usage-analyzer.sh

# Expected output: Color-coded analysis with summary statistics
```

### 3. Review Component Usage Report

```bash
# Review component usage report
cat .rptc/plans/frontend-architecture-cleanup/usage-report-components.txt

# Look for components marked "DELETE ✗" (0 usages)
# Look for components marked "REVIEW ⚠️" (1-2 usages for manual verification)
```

### 4. Review Hook Usage Report

```bash
# Review hook usage report
cat .rptc/plans/frontend-architecture-cleanup/usage-report-hooks.txt

# Identify unused hooks for deletion
```

### 5. Review Test Alignment Report

```bash
# Review test alignment report
cat .rptc/plans/frontend-architecture-cleanup/usage-report-tests.txt

# Identify orphaned tests (source doesn't exist or source unused)
```

### 6. Manual Verification of Flagged Items

Create `.rptc/plans/frontend-architecture-cleanup/deletion-checklist.md`:

```markdown
# Deletion Checklist - Manual Review

## Components Flagged for Review (1-2 usages)

### [Component Name]
- **File:** [path]
- **Usage Count:** [count]
- **Used In:** [files]
- **Decision:** [ ] DELETE / [ ] MIGRATE
- **Rationale:** [Why deleting or keeping]

[Repeat for each flagged component]

## Hooks Flagged for Review (1-2 usages)

[Same structure as components]

## Verification Steps

### Dynamic Imports Check
- [ ] Searched for `import(` statements that might construct paths dynamically
- [ ] Command: `grep -r "import(" src/ webview-ui/ --include="*.ts" --include="*.tsx"`
- [ ] Result: [findings]

### Template Literals Check
- [ ] Searched for template literal imports
- [ ] Command: `grep -r "from \`" src/ webview-ui/ --include="*.ts" --include="*.tsx"`
- [ ] Result: [findings]

### Node Modules Check
- [ ] Verified no false positives from node_modules
- [ ] All analysis excluded node_modules directory
- [ ] Confirmed: [ ] YES

### Documentation References Check
- [ ] Searched documentation for component references
- [ ] Command: `grep -r "ComponentName" docs/ --include="*.md"`
- [ ] Result: [findings]

## Final Decision

**Total Unused Components:** [count]
**Total Unused Hooks:** [count]
**Total Orphaned Tests:** [count]
**Total Files to Delete:** [count]

**Confidence Level:** [ ] HIGH / [ ] MEDIUM / [ ] LOW

**Action:** PROCEED to Step 3 with deletion list
```

Execute verification:

```bash
# Check for dynamic imports
grep -r "import(" src/ webview-ui/ --include="*.ts" --include="*.tsx" || echo "None found"

# Check for template literal imports
grep -r 'from `' src/ webview-ui/ --include="*.ts" --include="*.tsx" || echo "None found"

# Verify node_modules excluded
# (analysis script should already exclude, but verify no false positives)
```

### 7. Update Step 3 with Deletion List

Based on usage analysis, update `step-03.md` to include conditional logic:

For each component in the move list, add:

```bash
# Before moving, check usage report
if grep -q "ComponentName.*DELETE" .rptc/plans/frontend-architecture-cleanup/usage-report-components.txt; then
    echo "Deleting unused component: ComponentName"
    git rm webview-ui/src/shared/components/path/ComponentName.tsx
else
    echo "Migrating used component: ComponentName"
    git mv webview-ui/src/shared/components/old/ComponentName.tsx webview-ui/src/shared/components/new/ComponentName.tsx
fi
```

### 8. Create Summary Checkpoint

```bash
# Review summary report
cat .rptc/plans/frontend-architecture-cleanup/dead-code-summary.txt

# Expected output:
# - Component counts (total, unused)
# - Hook counts (total, unused)
# - Test counts (total, orphaned)
# - Total dead code count
# - Recommended action
```

## Expected Outcome

- [ ] Usage analysis script created and executable
- [ ] Component usage report generated with decision for each component (MIGRATE/DELETE/REVIEW)
- [ ] Hook usage report generated with decision for each hook
- [ ] Test alignment report identifies orphaned tests
- [ ] Dead code summary shows total files to delete
- [ ] Manual verification checklist completed for flagged items (1-2 usages)
- [ ] Deletion list ready for Step 3 integration
- [ ] High confidence in usage analysis accuracy

## Acceptance Criteria

- [ ] All 4 report files generated successfully
- [ ] Component usage counts verified (spot-check 3 random components)
- [ ] Hook usage counts verified (spot-check 3 random hooks)
- [ ] Test alignment correct (all orphaned tests identified)
- [ ] Manual review completed for items with 1-2 usages
- [ ] No false positives (dynamic imports and template literals checked)
- [ ] Dead code summary shows realistic numbers
- [ ] Deletion checklist completed with rationale for each decision
- [ ] Step 3 ready to be updated with conditional delete logic

## Decision Criteria Reference

| Usage Count | Decision | Action |
|-------------|----------|---------|
| 0 usages | DELETE ✗ | Do not migrate, delete component + test |
| 1-2 usages | REVIEW ⚠️ | Manual verification (might be critical) |
| 3+ usages | MIGRATE ✓ | Proceed with migration as planned |

## Risk Mitigation

**Risk: False Negative (Component marked unused but actually used)**

**Mitigations:**
1. Manual review of all 1-2 usage components (REVIEW ⚠️)
2. Dynamic import detection (grep for `import(` patterns)
3. Template literal import detection (grep for template strings)
4. Documentation reference check (component might be documented but not imported)
5. Conservative approach: When in doubt, MIGRATE (don't DELETE)

**Contingency:**
- If component deleted incorrectly, git history preserves it
- Rollback with `git checkout HEAD~1 -- path/to/file.tsx`
- Re-add to migration list

**Risk: False Positive (Component marked used but actually dead)**

**Mitigations:**
1. Only count actual import statements (exclude comments)
2. Exclude test files from usage counts
3. Exclude barrel file re-exports from usage counts (count final usage)
4. Verify imports resolve (not just grep matches)

**Contingency:**
- Less risky (migrating unused code just wastes effort)
- Can delete later after migration if discovered unused

## Estimated Time

- Script creation: 30 minutes
- Running analysis: 15 minutes
- Manual review of flagged items: 30 minutes
- Updating Step 3 based on findings: 15 minutes
- **Total: 1.5 hours**

---

## Rollback Strategy

**If analysis reveals unexpected results:**

1. Review script logic for correctness
2. Adjust grep patterns if false positives/negatives found
3. Re-run analysis after script fixes
4. If major issues discovered (e.g., 50%+ components unused), STOP and reassess plan

**No rollback needed** - This step is analysis only, no files modified.

**Cost:** Zero (analysis only)

---

## Integration with Subsequent Steps

**Step 3 Enhancement:**
- Before each `git mv`, check usage report
- If component marked DELETE, use `git rm` instead
- If component marked REVIEW, proceed with migration (conservative)

**Step 5 Enhancement:**
- Only update imports for components that were MIGRATED
- Skip import updates for components that were DELETED
- Delete tests for components that were DELETED

**Verification:**
- After Step 3, verify all DELETE-marked files actually deleted
- After Step 5, verify no imports reference deleted components
