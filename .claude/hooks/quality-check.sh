#!/bin/bash
# Quality Guardian Auto-Check Hook
# Triggered after Write/Edit operations to suggest quality checks

# Only run if we're in a git repository
if [ ! -d .git ]; then
    exit 0
fi

# Get modified files (unstaged changes)
MODIFIED_FILES=$(git diff --name-only 2>/dev/null)
MODIFIED_COUNT=$(echo "$MODIFIED_FILES" | grep -c "^" 2>/dev/null || echo 0)

# Check for TypeScript/JavaScript files
TS_FILES=$(echo "$MODIFIED_FILES" | grep -E "\.(tsx?|jsx?)$" | head -5)

# Only show reminder if we have significant changes
if [ "$MODIFIED_COUNT" -ge 3 ] && [ ! -z "$TS_FILES" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔍 Code Quality Reminder"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "You've modified $MODIFIED_COUNT files. Consider running:"
    echo ""
    echo "  💡 'Use quality-guardian to review recent changes'"
    echo ""
    echo "Check for:"
    echo "  • Functions longer than 50 lines"
    echo "  • Excessive nesting (>3 levels)"
    echo "  • Unnecessary abstractions"
    echo "  • Overengineering patterns"
    echo ""
    echo "Modified TypeScript/React files:"
    echo "$TS_FILES" | sed 's/^/  • /'
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

# Track changes for threshold monitoring
CHANGES_FILE="$CLAUDE_PROJECT_DIR/.claude/pending-changes.txt"
if [ ! -z "$CLAUDE_TOOL_INPUT_file_path" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S'): $CLAUDE_TOOL_INPUT_file_path" >> "$CHANGES_FILE" 2>/dev/null
fi