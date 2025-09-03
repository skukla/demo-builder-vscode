#!/bin/bash
# Context Enhancer Hook
# Triggered on UserpromptSubmit to add sub-agent awareness

# Check if this is the first prompt of the session
SESSION_FILE="$CLAUDE_PROJECT_DIR/.claude/session-started.txt"
FIRST_PROMPT=false

if [ ! -f "$SESSION_FILE" ]; then
    FIRST_PROMPT=true
    date > "$SESSION_FILE" 2>/dev/null
    
    # Clean up after 24 hours
    (sleep 86400 && rm -f "$SESSION_FILE" 2>/dev/null) &
fi

# Check current context - what files are being worked on
CURRENT_FILE=$(git diff --name-only 2>/dev/null | head -1)
WORKING_ON_CODE=false

if echo "$CURRENT_FILE" | grep -E "\.(tsx?|jsx?|py|java|go)$" > /dev/null; then
    WORKING_ON_CODE=true
fi

# Provide contextual reminders based on activity
if [ "$FIRST_PROMPT" = true ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🤖 Sub-Agents Available"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "You have specialized sub-agents for this project:"
    echo ""
    echo "  📝 docs-sync"
    echo "     Updates CLAUDE.md hierarchy after code changes"
    echo ""
    echo "  🔍 quality-guardian"
    echo "     Checks for overengineering and complexity"
    echo ""
    echo "Invoke with: 'Use [agent-name] to...'"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
elif [ "$WORKING_ON_CODE" = true ]; then
    # Check if we should suggest quality check
    CHANGES=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
    if [ "$CHANGES" -ge 5 ]; then
        echo "💡 Tip: You have $CHANGES changed files. Consider using quality-guardian to check for complexity."
    fi
fi

# Check for specific patterns that might benefit from sub-agents
if echo "$CLAUDE_PROMPT" | grep -iE "refactor|simplify|clean|improve" > /dev/null 2>&1; then
    echo "💡 Tip: For refactoring, consider using quality-guardian to identify complexity issues first."
elif echo "$CLAUDE_PROMPT" | grep -iE "document|readme|claude\.md|explain" > /dev/null 2>&1; then
    echo "💡 Tip: Use docs-sync agent to ensure documentation stays synchronized with code."
fi