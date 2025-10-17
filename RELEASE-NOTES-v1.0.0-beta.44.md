# Release Notes: v1.0.0-beta.44

**Release Date**: October 17, 2025

## 🎯 Focus: User-Facing Log Cleanup & Adobe CLI Detection Fix

This release dramatically reduces user-facing log verbosity (~85% reduction) and fixes a bug where Adobe I/O CLI appeared to be partially installed when it wasn't.

---

## 🔧 Fixes

### Adobe I/O CLI Detection

- **Fixed false positive detection**: When aio-cli wasn't installed in any project-required Node versions, the extension would fall back to checking Node 20 (even if not required), causing confusing UI where the check failed but sub-items showed green checkmarks with no versions
- **Proper early return**: Now correctly returns `installed=false` immediately when aio-cli is not found in any project-required Node versions

### Log Cleanup (~85% reduction)

Moved the following to debug channel only (still available in "Demo Builder: Debug"):

**Prerequisites Screen:**
- Individual prerequisite check results (✓ Homebrew is installed, ✓ Node.js is installed, etc.)
- "Starting prerequisites check"
- "Prerequisites check complete. All required installed: X"
- "Checking X..." for each prerequisite

**Installation Progress:**
- All fnm Node.js installation output (e.g., "Installing Node v24.10.0", "Downloading: 75%")
- Empty stderr warnings during installations
- CommandManager "Process exited with code X" warnings (for expected non-zero exits)

**Wizard Flow:**
- "Initializing wizard interface..."
- "Starting wizard from welcome screen"
- "Welcome screen shown successfully"

**Configuration:**
- "Configured aio-cli to opt out of telemetry"

---

## 📊 Before & After

### Before (v1.0.0-beta.43):
```
[10:04:45 PM] [Extension] Welcome screen shown successfully
[10:04:56 PM] [Project Creation] Starting wizard from welcome screen
[10:04:56 PM] [Project Creation] Initializing wizard interface...
[10:05:02 PM] [Prerequisites] Starting prerequisites check
[10:05:02 PM] [Prerequisites] ✓ Homebrew is installed: 4.6.17
[10:05:02 PM] [Prerequisites] ✓ Fast Node Manager is installed: 1.38.1
[10:05:03 PM] [Prerequisites] ✓ Node.js is installed: 18.20.8
[10:05:03 PM] ⚠️ [CommandManager] Process exited with code 1 after 18ms
[10:05:03 PM] ⚠️ [CommandManager] Process exited with code 127 after 11ms
[10:05:03 PM] [Telemetry] ✓ Configured aio-cli to opt out of telemetry
[10:05:03 PM] ⚠️ [CommandManager] Process exited with code 1 after 14ms
[10:05:03 PM] ⚠️ [Prerequisites] ✗ Adobe I/O CLI is not installed
[10:05:03 PM] [Prerequisites] ✓ Git is installed: 2.39.5
[10:05:03 PM] [Prerequisites] Prerequisites check complete. All required installed: false
[10:07:01 PM] [Install Node.js] Installing Node v24.10.0 (arm64)
[10:07:05 PM] ⚠️ [Install Node.js] 
[10:07:07 PM] ⚠️ [CommandManager] Process exited with code 1 after 29ms
```

### After (v1.0.0-beta.44):
```
(Only critical errors and user-actionable messages appear here)
```

All the detailed diagnostic information is still available in the "Demo Builder: Debug" channel.

---

## 🎨 UI/UX Improvements

- **Cleaner logs**: Main log channel now focuses exclusively on critical errors and user-actionable messages
- **Better signal-to-noise ratio**: Users can focus on what matters without being overwhelmed by technical details
- **Improved debugging**: All diagnostic information remains available in the debug channel for troubleshooting
- **Fixed confusing UI**: Adobe I/O CLI now correctly shows as "not installed" without misleading green checkmarks

---

## 📝 Technical Details

### Changed Files
- `src/commands/createProjectWebview.ts`: Moved prerequisite logging to debug
- `src/commands/welcomeWebview.ts`: Moved wizard start message to debug
- `src/extension.ts`: Moved welcome screen message to debug
- `src/utils/externalCommandManager.ts`: Moved process exit codes and telemetry to debug
- `src/utils/progressUnifier.ts`: Moved installation output to debug, filtered empty stderr
- `src/utils/prerequisitesManager.ts`: Fixed aio-cli detection logic, early return when not found

### Log Routing Strategy
- **Main "Demo Builder: Logs"**: Only critical errors, warnings that require action, and completion messages
- **"Demo Builder: Debug"**: All technical details, command outputs, timing information, and diagnostic data

---

## 🔄 Upgrade Notes

- No breaking changes
- No configuration changes required
- Existing projects are fully compatible
- **Important**: After upgrading, reload VS Code to see the cleaner logs

---

## 🐛 Known Issues

None specific to this release.

---

## 🙏 Credits

Thanks for the detailed feedback on log verbosity and the Adobe I/O CLI detection issue!

