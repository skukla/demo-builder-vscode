# Adobe Demo Builder v1.0.0-beta.11

**Release Date**: October 14, 2025

> **Note**: This is the eleventh beta iteration toward v1.0.0 stable release.

## 🎨 Updated Extension Icon

This release updates the visual identity of the Adobe Demo Builder extension with a refreshed icon design.

## 🐛 Fixed Update Checker

Fixed a critical bug where the update checker couldn't find newer releases due to GitHub's pagination and sorting behavior. The extension now fetches the 20 most recent releases and sorts them by semver to find the true latest version, regardless of GitHub's internal ordering.

---

## 📝 Changes

### Visual Update

- **Updated Extension Icon** (`media/icon.png`)
  - New icon design for better visibility and brand alignment
  - Improved appearance in VS Code marketplace and extensions panel
  - Enhanced visual identity across all VS Code surfaces

---

## 📦 Installation

### From VSIX

1. Download `adobe-demo-builder-1.0.0-beta.11.vsix` from the [Releases page](https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.11)
2. Install via VS Code:
   ```bash
   code --install-extension adobe-demo-builder-1.0.0-beta.11.vsix
   ```
3. Reload VS Code

### Upgrading from v1.0.0-beta.10

**Option 1: Use Auto-Update** (Recommended)
1. Open Command Palette (`Cmd+Shift+P`)
2. Run: "Demo Builder: Check for Updates"
3. Click "Update All"
4. Reload when prompted

**Option 2: Manual Install**
```bash
code --uninstall-extension adobe-demo-team.adobe-demo-builder
code --install-extension adobe-demo-builder-1.0.0-beta.11.vsix
```

---

## 🔍 Verification Steps

After installation and VS Code reload:

### Check Version
- Look at extension's status bar (bottom right)
- Should show: `Adobe Demo Builder v1.0.0-beta.11`

### Verify New Icon
- Check Extensions panel in VS Code
- New icon should be visible next to Adobe Demo Builder
- Icon appears in marketplace listing

---

## 🚀 What's Next?

Future beta releases will focus on:
- Additional feature improvements
- Performance optimizations
- Bug fixes as reported
- Path to v1.0.0 stable

---

## 🔗 Quick Links

- **Release**: https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.11
- **Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.10...v1.0.0-beta.11
- **Issues**: https://github.com/skukla/demo-builder-vscode/issues

---

**Thank you for beta testing! Your feedback helps make Demo Builder better.** 🙏

