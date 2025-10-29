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

echo "Hook Usage Report" > "$HOOK_REPORT"
echo "=================" >> "$HOOK_REPORT"
echo "" >> "$HOOK_REPORT"
echo "Generated: $(date)" >> "$HOOK_REPORT"
echo "" >> "$HOOK_REPORT"

echo "Test Alignment Report" > "$TEST_REPORT"
echo "=====================" >> "$TEST_REPORT"
echo "" >> "$TEST_REPORT"
echo "Generated: $(date)" >> "$TEST_REPORT"
echo "" >> "$TEST_REPORT"

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
find webview-ui/src/shared/components -name "*.tsx" -type f 2>/dev/null | while read -r file; do
    # Skip index files
    if [[ "$file" != *"index.tsx" ]]; then
        analyze_component "$file"
    fi
done || echo "No components found in webview-ui/src/shared/components/"

echo ""
echo "Analyzing Hooks..."
echo "=================="

# Analyze hooks in webview-ui/src/shared/hooks/
if [ -d "webview-ui/src/shared/hooks" ]; then
    find webview-ui/src/shared/hooks -name "*.ts" -type f 2>/dev/null | while read -r file; do
        # Skip index files
        if [[ "$file" != *"index.ts" ]]; then
            analyze_hook "$file"
        fi
    done || echo "No hooks found"
else
    echo "No hooks directory found at webview-ui/src/shared/hooks/"
fi

echo ""
echo "Analyzing Tests..."
echo "=================="

# Analyze tests in tests/ directory
find tests -name "*.test.ts" -o -name "*.test.tsx" 2>/dev/null | while read -r file; do
    analyze_test "$file"
done || echo "No tests found"

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
