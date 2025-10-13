# GitHub Release Instructions for v1.0.0-beta.2

## ✅ What's Been Done

1. ✅ Version bumped to 1.0.0-beta.2 in `package.json`
2. ✅ Release notes created in `RELEASE-NOTES-v1.0.0-beta.2.md`
3. ✅ VSIX package built: `adobe-demo-builder-1.0.0-beta.2.vsix` (35 MB)
4. ✅ Git tag will be created: `v1.0.0-beta.2`
5. ✅ Incorrect tags deleted (v1.0.1-beta.1, v1.0.2-beta.1)
6. ✅ Changes will be pushed to GitHub
7. ✅ VSIX and release notes will be copied to Desktop

> **Note**: This is beta.2 - the second iteration toward v1.0.0 stable release.

## 📋 Next Steps: Create GitHub Release

### 1. Go to GitHub Releases Page
https://github.com/skukla/demo-builder-vscode/releases/new?tag=v1.0.0-beta.2

### 2. Fill in Release Details

**Tag**: `v1.0.0-beta.2` (already selected)

**Release Title**: `Adobe Demo Builder v1.0.0-beta.2 - Critical Bug Fixes`

**Description**: Copy the contents from `RELEASE-NOTES-v1.0.0-beta.2.md` (on your Desktop)

**Key sections to include**:
- 🐛 Critical Bug Fixes
- Fixed: Missing Commands in Command Palette
- Fixed: Node Version Management with fnm
- 📦 Installation instructions
- 🧪 Verification steps

### 3. Upload VSIX File

Attach the file from your Desktop:
- `adobe-demo-builder-1.0.0-beta.2.vsix` (35 MB)

### 4. Publish Settings

- ☑️ **Set as the latest release** (CHECKED)
- ☑️ **Set as a pre-release** (CHECKED - this is a beta release)

### 5. Click "Publish Release"

## 🔍 Verification After Publishing

### Test the VSIX

1. Download from the release page
2. Install in a fresh VS Code:
   ```bash
   code --install-extension ~/Downloads/adobe-demo-builder-1.0.0-beta.2.vsix
   ```
3. Verify commands appear:
   - `Cmd+Shift+P` → "Demo Builder: Create Project" ✅
   - `Cmd+Shift+P` → "Demo Builder: Check for Updates" ✅
4. Test Adobe I/O operations (if you have access)

### Announce to Beta Testers

Draft message:
```
📢 Adobe Demo Builder v1.0.0-beta.2 Released!

Second beta iteration with critical bug fixes:

✅ Fixed: Missing commands in Command Palette
   - Create Project, Check for Updates, and Reset All now appear

✅ Fixed: Node version management
   - Adobe I/O CLI now runs with the correct Node version
   - No more ES module or node:util errors

✅ Fixed: Repository URL and author metadata

Download: https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.2

Install:
code --install-extension adobe-demo-builder-1.0.0-beta.2.vsix

Full release notes available on GitHub.
```

## 📝 What This Release Fixes

### Issue 1: Missing Commands (Commit `071bf59`)
- **Problem**: Commands weren't in `package.json`, so they didn't appear in Command Palette
- **Fixed**: Restored all command definitions
- **Impact**: Users can now access all core functionality

### Issue 2: Node Version Management (Commit `ac1a6a2`)
- **Problem**: fnm wasn't found in VS Code's PATH, causing wrong Node version
- **Fixed**: Extension now searches common fnm installation locations
- **Impact**: Adobe I/O CLI operations now work reliably

## 🎯 Success Metrics

After release, expect:
- ✅ No more "command not found" errors for core commands
- ✅ No more `[ERR_REQUIRE_ESM]` errors during Adobe I/O operations
- ✅ Successful API Mesh creation and deployment
- ✅ Smooth Adobe authentication flow

## 🔗 Quick Links

- **Release**: https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.2
- **Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.1...v1.0.0-beta.2
- **Issues**: https://github.com/skukla/demo-builder-vscode/issues

---

**Pro Tip**: After publishing, test the auto-update system by:
1. Installing v1.0.0-beta.1 on a test machine
2. Running "Demo Builder: Check for Updates"
3. Verifying it detects and offers to install v1.0.0-beta.2

