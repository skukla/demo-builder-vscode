# Adobe Demo Builder v1.0.0-beta.16

**Release Date**: October 14, 2025

> **Note**: This is the sixteenth beta iteration toward v1.0.0 stable release.

## 🐛 Bug Fixes

### 1. Homebrew-Specific Git Requirement

Changed git prerequisite to require **Homebrew's git** specifically, not Xcode or system git.

**Why:**
- Ensures consistent git version across all users
- Extension controls and manages the git version
- No surprises from Xcode git (which may be outdated or missing)
- Aligns with extension's philosophy of managing all prerequisites

**What Changed:**
- Check command: `git --version` → `brew list git --versions`
- Only passes if git is installed via Homebrew
- Users with only Xcode git will see it as "not installed"

### 2. Per-Node-Version UI Without fnm

Fixed UI showing incorrect green checkmarks for Node versions when fnm is not installed.

**Before (Broken):**
```
Adobe I/O CLI ✗
  Node 20 ✓  ← Wrong! Shows green when fnm isn't even installed
  Node 24 ✓  ← Wrong!
```

**After (Fixed):**
```
Adobe I/O CLI ✗
  ⚠️ Adobe I/O CLI requires fnm to be installed first
  Node 20 ✗  ← Correctly shows red X
  Node 24 ✗  ← Correctly shows red X
```

### 3. Dynamic Node Version Detection

No more hardcoded Node versions! The extension now:
- Tests ALL fnm Node versions by running `aio --version`
- Picks the highest working version automatically
- Works with any Node version combination (14, 20, 22, 24, etc.)

### 4. Strict fnm Requirement

Per-node-version prerequisites (like aio-cli) now REQUIRE fnm:
- No fallback to nvm or global Node
- Clear error message: "requires fnm to be installed first"
- Ensures proper isolation and version management

---

## 📝 Summary of Changes

### Git
- **Check**: Now specifically checks for Homebrew's git (`brew list git --versions`)
- **Install**: Already installs via Homebrew (`brew install git`)
- **Result**: Consistent git version for all users

### Adobe I/O CLI
- **Dynamic detection**: Finds highest working Node version automatically
- **fnm required**: Skip checks if fnm not installed, show proper errors in UI
- **Consistent version**: All aio commands use same Node version

### UI/UX
- Per-node-version status now shows correct red X icons when fnm is missing
- Clear warning messages about missing prerequisites
- No more false positive green checkmarks

---

## 📦 Installation

### From VSIX

1. Download `adobe-demo-builder-1.0.0-beta.16.vsix` from the [Releases page](https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.16)
2. Install via VS Code:
   ```bash
   code --install-extension adobe-demo-builder-1.0.0-beta.16.vsix
   ```
3. Reload VS Code

### Upgrading from Previous Beta

**Option 1: Use Auto-Update** (Recommended)
1. Open Command Palette (`Cmd+Shift+P`)
2. Run: "Demo Builder: Check for Updates"
3. Click "Update All"
4. Reload when prompted

**Option 2: Manual Install**
```bash
code --uninstall-extension adobe-demo-team.adobe-demo-builder
code --install-extension adobe-demo-builder-1.0.0-beta.16.vsix
```

---

## 🔍 Verification Steps

After installation and VS Code reload:

### Check Version
- Run "Demo Builder: Check for Updates"
- Should show: `Demo Builder is up to date ✓ (v1.0.0-beta.16)`

### Verify Git Check
- Run "Demo Builder: Create Project"
- Go to Prerequisites step
- Git should only pass if installed via Homebrew

### Verify fnm Requirements
- If fnm is not installed:
  - aio-cli should show red X
  - Per-node-version status should show red X for all Node versions
  - Warning: "Adobe I/O CLI requires fnm to be installed first"

---

## 🚀 What's Next?

Future beta releases will focus on:
- Additional feature improvements
- Performance optimizations
- Bug fixes as reported
- Path to v1.0.0 stable

---

## 🔗 Quick Links

- **Release**: https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.16
- **Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.15...v1.0.0-beta.16
- **Issues**: https://github.com/skukla/demo-builder-vscode/issues

---

**Thank you for beta testing! Your feedback helps make Demo Builder better.** 🙏
