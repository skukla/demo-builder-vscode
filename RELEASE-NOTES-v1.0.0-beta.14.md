# Adobe Demo Builder v1.0.0-beta.14

**Release Date**: October 14, 2025

> **Note**: This is the fourteenth beta iteration toward v1.0.0 stable release.

## 🐛 Bug Fixes

### Fixed Per-Node-Version Plugin Checks

Fixed a critical bug where aio-cli plugin checks (like `api-mesh`) were running under the wrong Node version.

### Improved Authentication Error Logging

Added detailed error logging for Adobe authentication failures to help diagnose login issues.

### The Problem

When checking aio-cli under Node 20 (for per-node-version prerequisites):
- The main aio-cli check correctly used Node 20  ✓
- But the plugin check (`aio plugins`) incorrectly auto-detected and used Node 14 ✗
- This caused plugin checks to fail or check the wrong installation

**Example from logs:**
```
[Prereq Check] aio-cli: Checking under fnm's Node v20  ← Correct!
[Prereq Check] aio-cli: ✓ Found under fnm's Node v20
[Adobe CLI] Found in Node v14.17.0, using version family: 14  ← Wrong!
```

### The Fix

Plugin checks now use the same Node version as their parent prerequisite:
- If aio-cli is checked under Node 20, plugins are also checked under Node 20
- Consistent Node version throughout the entire prerequisite check process
- No more switching to unexpected Node versions

---

## 📝 Changes

### Bug Fix
- **Fixed plugin checks for per-node-version prerequisites**
  - Plugin checks now inherit the Node version from parent prerequisite
  - Prevents auto-detection from finding wrong Node versions
  - Ensures aio-cli and its plugins are checked in the same Node environment

### Technical Details
- Modified `checkPrerequisite()` to pass Node version to `checkPlugin()`
- Updated `checkPlugin()` to accept and use the specified Node version
- Falls back to 'auto' detection only for non-per-node-version prerequisites

---

## 📦 Installation

### From VSIX

1. Download `adobe-demo-builder-1.0.0-beta.14.vsix` from the [Releases page](https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.14)
2. Install via VS Code:
   ```bash
   code --install-extension adobe-demo-builder-1.0.0-beta.14.vsix
   ```
3. Reload VS Code

### Upgrading from v1.0.0-beta.11

**Option 1: Use Auto-Update** (Recommended)
1. Open Command Palette (`Cmd+Shift+P`)
2. Run: "Demo Builder: Check for Updates"
3. Click "Update All"
4. Reload when prompted

**Option 2: Manual Install**
```bash
code --uninstall-extension adobe-demo-team.adobe-demo-builder
code --install-extension adobe-demo-builder-1.0.0-beta.14.vsix
```

---

## 🔍 Verification Steps

After installation and VS Code reload:

### Check Version
- Look at extension's status bar (bottom right)
- Should show: `Adobe Demo Builder v1.0.0-beta.14`

### Verify Plugin Checks
- Run "Demo Builder: Create Project"
- Go to Prerequisites step
- Check aio-cli - logs should show consistent Node version for CLI and plugins

---

## 🚀 What's Next?

Future beta releases will focus on:
- Additional feature improvements
- Performance optimizations
- Bug fixes as reported
- Path to v1.0.0 stable

---

## 🔗 Quick Links

- **Release**: https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.14
- **Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.11...v1.0.0-beta.14
- **Issues**: https://github.com/skukla/demo-builder-vscode/issues

---

**Thank you for beta testing! Your feedback helps make Demo Builder better.** 🙏

