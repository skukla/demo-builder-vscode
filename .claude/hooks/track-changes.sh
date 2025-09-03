#!/bin/bash
# Change Tracking System
# Monitors file modifications and triggers sub-agent reminders at thresholds

CHANGES_FILE="$CLAUDE_PROJECT_DIR/.claude/pending-changes.txt"
QUALITY_THRESHOLD=5
DOC_THRESHOLD=10

# Initialize changes file if it doesn't exist
if [ ! -f "$CHANGES_FILE" ]; then
    touch "$CHANGES_FILE" 2>/dev/null
fi

# Track the current change
if [ ! -z "$CLAUDE_TOOL_INPUT_file_path" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S'): $CLAUDE_TOOL_INPUT_file_path" >> "$CHANGES_FILE"
    
    # Count unique files changed
    UNIQUE_FILES=$(cat "$CHANGES_FILE" | awk '{print $3}' | sort -u | wc -l | tr -d ' ')
    
    # Quality check threshold
    if [ "$UNIQUE_FILES" -eq "$QUALITY_THRESHOLD" ]; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "🚨 Quality Check Recommended"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "You've modified $UNIQUE_FILES different files"
        echo ""
        echo "RECOMMENDED: 'Use quality-guardian to review changes'"
        echo ""
        echo "This will check for:"
        echo "  • Overengineering"
        echo "  • Complex functions"
        echo "  • Unnecessary abstractions"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    fi
    
    # Documentation update threshold
    if [ "$UNIQUE_FILES" -eq "$DOC_THRESHOLD" ]; then
        echo ""
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "📚 Documentation Update Needed"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "You've modified $UNIQUE_FILES different files"
        echo ""
        echo "REQUIRED: 'Use docs-sync to update documentation'"
        echo ""
        echo "This will:"
        echo "  • Update CLAUDE.md files"
        echo "  • Sync examples"
        echo "  • Document new patterns"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        # Reset counter after doc threshold
        > "$CHANGES_FILE"
    fi
fi

# Clean old entries (older than 24 hours)
if [ -f "$CHANGES_FILE" ]; then
    TEMP_FILE="$CHANGES_FILE.tmp"
    CUTOFF=$(date -d '24 hours ago' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -v-24H '+%Y-%m-%d %H:%M:%S' 2>/dev/null)
    
    if [ ! -z "$CUTOFF" ]; then
        while IFS= read -r line; do
            LINE_DATE=$(echo "$line" | cut -d':' -f1-3)
            if [[ "$LINE_DATE" > "$CUTOFF" ]]; then
                echo "$line"
            fi
        done < "$CHANGES_FILE" > "$TEMP_FILE" 2>/dev/null
        
        mv "$TEMP_FILE" "$CHANGES_FILE" 2>/dev/null
    fi
fi