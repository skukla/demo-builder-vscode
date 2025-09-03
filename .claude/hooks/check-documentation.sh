#!/bin/bash
# Documentation Sync Reminder Hook
# Triggered on Stop event to remind about documentation updates

# Only run if we're in a git repository
if [ ! -d .git ]; then
    exit 0
fi

# Count uncommitted changes
UNCOMMITTED=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
STAGED=$(git diff --staged --name-only 2>/dev/null | wc -l | tr -d ' ')

# Count recent commits (last 2 hours)
RECENT_COMMITS=$(git log --oneline --since="2 hours ago" 2>/dev/null | wc -l | tr -d ' ')

# Check if any CLAUDE.md files are outdated
CHANGED_SOURCE=$(git diff HEAD --name-only 2>/dev/null | grep -E "\.(tsx?|jsx?|py|md)$" | wc -l | tr -d ' ')

# Determine if documentation update is needed
NEEDS_DOC_UPDATE=false

if [ "$RECENT_COMMITS" -ge 3 ]; then
    NEEDS_DOC_UPDATE=true
    REASON="You've made $RECENT_COMMITS commits recently"
elif [ "$UNCOMMITTED" -ge 5 ]; then
    NEEDS_DOC_UPDATE=true
    REASON="You have $UNCOMMITTED uncommitted changes"
elif [ "$CHANGED_SOURCE" -ge 3 ]; then
    NEEDS_DOC_UPDATE=true
    REASON="You've modified $CHANGED_SOURCE source files"
fi

if [ "$NEEDS_DOC_UPDATE" = true ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📚 Documentation Sync Reminder"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$REASON"
    echo ""
    echo "Consider updating documentation:"
    echo "  💡 'Use docs-sync agent to update CLAUDE.md files'"
    echo ""
    echo "This will:"
    echo "  • Update hierarchical CLAUDE.md structure"
    echo "  • Sync examples with current code"
    echo "  • Document new patterns or changes"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Optional: Make it blocking (uncomment to enforce)
    # echo ""
    # read -p "Press Enter to acknowledge..."
fi

# Log session activity
SESSION_LOG="$CLAUDE_PROJECT_DIR/.claude/session-log.txt"
if [ -f "$SESSION_LOG" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S'): Session ended - Commits: $RECENT_COMMITS, Changes: $UNCOMMITTED" >> "$SESSION_LOG" 2>/dev/null
fi