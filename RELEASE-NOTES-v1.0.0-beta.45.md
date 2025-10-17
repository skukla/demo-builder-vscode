# Release Notes: v1.0.0-beta.45

**Release Date**: October 17, 2025

## 🔧 Fix: Restore Prerequisite Status Messages

This release restores the prerequisite status messages to the main log channel after feedback that v1.0.0-beta.44 was too aggressive in hiding them.

---

## Changes

### Restored to Main Logs
- ✓ Individual prerequisite check results (e.g., `✓ Homebrew is installed: 4.6.17`, `✗ Adobe I/O CLI is not installed`)

These messages are useful for users to track progress during prerequisite checks.

### Still in Debug Channel Only
- "Starting prerequisites check"
- "Prerequisites check complete"
- "Checking X..." for each prerequisite
- CommandManager process exit codes
- Telemetry configuration messages
- Node.js installation output (fnm progress)
- "Initializing wizard interface..."
- "Welcome screen shown successfully"

---

## Result

The main log channel now shows a balanced view:
- **Visible**: Each prerequisite check result with ✓/✗ status and version
- **Hidden**: Internal technical details, timing, and noise

Example logs now show:
```
[Prerequisites] ✓ Homebrew is installed: 4.6.17
[Prerequisites] ✓ Fast Node Manager is installed: 1.38.1
[Prerequisites] ✓ Node.js is installed: 18.20.8
[Prerequisites] ✗ Adobe I/O CLI is not installed
[Prerequisites] ✓ Git is installed: 2.39.5
```

---

## Included from v1.0.0-beta.44

- Fixed Adobe I/O CLI false positive detection (no more confusing green checkmarks when not installed)
- Proper Node version filtering (no fallback to Node 20 when not in project requirements)

---

## Upgrade Notes

- No breaking changes
- Existing projects are fully compatible
- Reload VS Code after upgrading to see the changes

