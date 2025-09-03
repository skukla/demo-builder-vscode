# Claude Code Enhanced Hook System

## Overview

This enhanced Python-based hook system combines intelligent sub-agents with automated workflow enforcement to improve code quality and maintain documentation synchronization.

## Features

### 🔍 Assumption Verifier
- Verifies library availability before imports
- Checks file structure conventions
- Validates API endpoints and configurations
- Caches verification results to avoid redundant checks

### ✅ Quality Enforcer
- Runs systematic quality checks after modifications
- Detects high complexity and overengineering
- Enforces build/lint/type checking
- Treats warnings as errors for better code quality

### 🚀 Tool Optimizer
- Automatically replaces `grep` with `rg` (ripgrep)
- Converts `find` to `fd` when available
- Falls back gracefully if modern tools aren't installed
- Transparent optimization with no user intervention needed

### 📚 Enhanced Documentation System

#### Auto Documentation Updater
- **Automatic Validation**: Checks if code references in docs still exist
- **Link Verification**: Validates all file paths and cross-references
- **Code Example Checking**: Detects outdated patterns (like Flex width issue)
- **Real-time Feedback**: Shows issues immediately after file modifications

#### Smart Documentation Sync
- **Auto-generates Documentation Drafts**: Creates documentation templates for new functions/classes
- **Change Analysis**: Detects added/removed/modified functions and signatures
- **Impact Assessment**: Identifies breaking changes requiring doc updates
- **Semi-automatic Updates**: Generates suggestions ready for review and application

#### Link Validator
- **Cross-reference Validation**: Checks all markdown links are valid
- **File Path Verification**: Ensures referenced files exist
- **Orphaned Doc Detection**: Finds documentation not linked from anywhere
- **Configurable Blocking**: Can block on broken links if configured

#### Documentation Coverage Analyzer
- **Coverage Metrics**: Tracks % of code with documentation
- **Directory-level Reports**: Shows coverage by module/directory
- **Undocumented Item Detection**: Lists all functions/classes lacking docs
- **Visual Coverage Bars**: Color-coded progress indicators

### 💾 Commit Reminder
- Tracks modified files in session
- Shows git status at session end
- Configurable reminder thresholds
- Helps maintain clean commit history

## Installation

```bash
# Run the setup script
python3 .claude/hooks/setup.py

# To uninstall
python3 .claude/hooks/setup.py uninstall
```

## Configuration

Edit `.claude/hooks/config.json` to customize behavior:

```json
{
  "verification": {
    "enabled": true,
    "sensitivity": "medium",  // conservative, medium, thorough
    "max_verifications_per_session": 5
  },
  "quality_checks": {
    "enabled": true,
    "systematic_verification": true,
    "treat_warnings_as_errors": true
  },
  "tool_optimization": {
    "enabled": true,
    "use_modern_tools": true
  }
}
```

## Sub-Agent Integration

The hook system works seamlessly with sub-agents:

### Quality Guardian
- Reviews code for overengineering
- Detects unnecessary complexity
- Suggests simplifications
- Auto-invoked when complexity thresholds are hit

### Docs Sync
- Maintains documentation synchronization
- Updates CLAUDE.md hierarchy
- Syncs technical docs with code changes
- Auto-invoked after multiple commits

## Hook Types

### PreToolUse Hooks
- **tool_optimizer.py**: Optimizes commands before execution
- **assumption_verifier.py**: Verifies assumptions before changes

### PostToolUse Hooks
- **quality_enforcer.py**: Enforces quality after modifications

### Stop Hooks
- **documentation_sync.py**: Checks documentation needs
- **commit_reminder.py**: Reminds about uncommitted changes

## State Management

The system maintains persistent state across sessions:

- **Session tracking**: Files modified, verifications performed
- **Cache management**: Avoid redundant verifications
- **Metrics collection**: Track patterns and improvements
- **Auto-cleanup**: Old state files removed after 7 days

## Sensitivity Levels

### Conservative
- Minimal interruptions
- Only critical verifications
- Best for experienced developers

### Medium (Default)
- Balanced approach
- Key assumption checks
- Standard quality enforcement

### Thorough
- Maximum verification
- All quality checks
- Best for critical projects

## Documentation Coverage Report

Generate a comprehensive coverage report for your codebase:

```bash
# Full project coverage
python3 .claude/hooks/doc_coverage_report.py

# Specific directory coverage
python3 .claude/hooks/doc_coverage_report.py src/webviews
python3 .claude/hooks/doc_coverage_report.py src/commands
```

The report shows:
- Overall coverage percentage with visual bars
- Directory-by-directory breakdown
- List of undocumented functions/classes
- Actionable suggestions for improvement

## Examples

### Assumption Verification in Action
```python
# You write:
import pandas as pd

# Hook blocks and asks:
"Please verify pandas is installed with: pip list | grep pandas"
```

### Quality Check Enforcement
```typescript
// After modifying multiple files
// Hook blocks and asks:
"Please run: npm run build && npm run lint"
```

### Tool Optimization
```bash
# You type: grep -r "function" .
# Hook silently converts to: rg "function"
```

## Troubleshooting

### Hooks Not Triggering
1. Check if hooks are registered: `cat ~/.claude/settings.json`
2. Verify Python 3 is available: `python3 --version`
3. Check hook permissions: `ls -la .claude/hooks/*/`

### Too Many Interruptions
1. Adjust sensitivity in config.json
2. Increase thresholds for triggers
3. Disable specific hook categories

### Modern Tools Not Working
1. Install ripgrep: `brew install ripgrep` (macOS)
2. Install fd: `brew install fd` (macOS)
3. Set `fallback_on_error: true` in config

## Best Practices

1. **Start with Medium Sensitivity**: Adjust based on your workflow
2. **Cache Verifications**: Reduces redundant checks
3. **Use Sub-Agents**: Leverage quality-guardian and docs-sync
4. **Regular Commits**: Keep commit sizes manageable
5. **Update Documentation**: Use docs-sync agent regularly

## Contributing

To add new hooks:

1. Create hook script in appropriate directory (pre/, post/, stop/)
2. Use the lib/ modules for common functionality
3. Update config.json with new settings
4. Run setup.py to register

## License

Internal use only - Adobe Demo Builder VS Code Extension