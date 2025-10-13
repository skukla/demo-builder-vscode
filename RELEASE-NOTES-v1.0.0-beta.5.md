# Adobe Demo Builder v1.0.0-beta.5

**Release Date**: October 13, 2025

> **Note**: This is the fifth beta iteration toward v1.0.0 stable release.

## 🔒 Critical Fixes

This release includes two critical fixes:

1. **fnm/nvm Isolation**: Extension now verifies prerequisites are in fnm's directory structure
2. **Update Checker Repository URL**: Fixed repository URL so "Check for Updates" works correctly

### Fix 1: fnm Isolation

The extension would detect and use Node packages from the user's existing nvm (or other) installations instead of maintaining its own isolated fnm-managed setup.

### The Problem

**Scenario**: User has both nvm and fnm with Node v20:
```
~/.nvm/versions/node/v20.5.0/bin/aio          ← User's existing aio-cli
~/.local/share/fnm/node-versions/v20.19.5/... ← Extension's fnm (no aio yet)
```

**Previous behavior (v1.0.0-beta.2)**:
1. Extension checks: "Is aio-cli installed under Node v20?"
2. Runs: `fnm use 20 && aio --version`
3. Finds user's nvm aio-cli in PATH ✓
4. Marks as "installed" ✓
5. Tries to use it later → May fail or interfere with user's setup ❌

**Impact**:
- Extension could use outdated versions from nvm
- Extension could interfere with user's existing Node setup
- Version mismatches between what extension expects vs what it finds
- Breaking the principle: **extension should be self-contained**

### The Solution (Fix 1)

**New behavior (v1.0.0-beta.5)**:

The extension now verifies that prerequisites are **actually located in fnm's directory**:

```typescript
// 1. Check if prerequisite works
await execute('aio --version', { useNodeVersion: '20' });

// 2. Verify it's in fnm's directory (NEW!)
const whichResult = await execute('which aio', { useNodeVersion: '20' });
const binPath = whichResult.stdout.trim();

if (!binPath.startsWith('~/.local/share/fnm/node-versions')) {
    // Found, but NOT in fnm → treat as not installed
    // Extension will install its own copy
}
```

**Result**:
- ✅ Extension installs its own `aio-cli` under fnm's Node v20
- ✅ User's nvm Node v20 with `aio-cli` remains completely untouched
- ✅ No interference between extension and user's existing setup
- ✅ Extension is fully self-contained with its own dependency versions

---

### Fix 2: Update Checker Repository URL

**Problem**:
The update checker was hardcoded to look for releases at `adobe/demo-builder-vscode`, but the actual repository is `skukla/demo-builder-vscode`.

**Impact**:
- "Demo Builder: Check for Updates" command would fail
- Logs showed: "No releases found for adobe/demo-builder-vscode"
- Auto-update system couldn't find new releases
- Users couldn't be notified of updates

**Solution**:
Updated `updateManager.ts` to use the correct repository URL:
```typescript
// Before:
private readonly EXTENSION_REPO = 'adobe/demo-builder-vscode';  // ❌

// After:
private readonly EXTENSION_REPO = 'skukla/demo-builder-vscode';  // ✅
```

**Result**:
- ✅ "Check for Updates" now works correctly
- ✅ Auto-update notifications will appear when new versions are released
- ✅ Extension can update itself from the correct GitHub repository

## 🐛 What This Fixes

### Issue: Extension Using User's nvm Packages

**Symptoms**:
- Adobe I/O CLI commands fail with version-related errors
- Extension detects prerequisites as "installed" but they don't work
- Conflicts between extension's expected versions and user's installed versions

**Root Cause**:
The extension only checked if a command existed when fnm's Node was active, but didn't verify WHERE the command was located. Commands from nvm (or other sources) in PATH would be found and used.

**Fix**:
Added path verification to ensure all `perNodeVersion` prerequisites (like `aio-cli`) are:
1. Installed under the target Node version (Node v20)
2. Located inside fnm's directory structure
3. Isolated from any other Node version managers

## 🔧 Technical Details

### Changes to `prerequisitesManager.ts`

**New Logic**:
```typescript
if (prereq.perNodeVersion && prereq.id !== 'node' && prereq.id !== 'npm') {
    const targetNodeVersion = '20';
    const fnmBase = path.join(os.homedir(), '.local/share/fnm/node-versions');
    
    // Step 1: Check if prerequisite exists
    const checkResult = await execute(prereq.check.command, {
        useNodeVersion: targetNodeVersion
    });
    
    // Step 2: Verify location (NEW!)
    const commandName = prereq.check.command.split(' ')[0];  // 'aio' from 'aio --version'
    const whichResult = await execute(`which ${commandName}`, {
        useNodeVersion: targetNodeVersion
    });
    
    const binPath = whichResult.stdout.trim();
    
    if (!binPath.startsWith(fnmBase)) {
        // Found outside fnm → treat as not installed
        // Extension will install its own isolated copy
        return { installed: false };
    }
}
```

### Isolation Guarantees

The extension now ensures:

1. **Scoped Checking**: Prerequisites are checked under fnm's Node version
2. **Path Verification**: Binaries must be in fnm's directory structure  
3. **No Cross-Contamination**: nvm/other installations are completely ignored
4. **Self-Contained**: Extension has its own copies of all dependencies
5. **No User Impact**: User's existing Node setup remains untouched

## 📦 Installation

### From VSIX

1. Download `adobe-demo-builder-1.0.0-beta.5.vsix` from the [Releases page](https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.5)
2. Install via VS Code:
   ```bash
   code --install-extension adobe-demo-builder-1.0.0-beta.5.vsix
   ```
3. Reload VS Code

### Upgrading from Previous Versions

If you're on v1.0.0-beta.2, beta.3, or beta.4:

1. Uninstall the old version:
   ```bash
   code --uninstall-extension adobe-demo-team.adobe-demo-builder
   ```
2. Install v1.0.0-beta.5 from the VSIX file (see above)
3. Reload VS Code

**Note**: After upgrading, the extension may re-check prerequisites and install its own copies under fnm if it detects they're currently coming from nvm or other sources.

### Auto-Update from beta.4

If you're on v1.0.0-beta.4 (the accidental build), you can now use auto-update:
1. Run: "Demo Builder: Check for Updates"
2. Extension will detect beta.5 is available
3. Click "Update" to install automatically

---

## 🧪 Verification

After installing, check the logs to verify isolation:

1. Open Demo Builder → Create New Project
2. Check Output Panel → "Demo Builder: Logs"
3. Look for:
   ```
   [Prereq Check] aio-cli: Checking under fnm's Node v20 (perNodeVersion=true, must be in fnm directory)
   [Prereq Check] aio-cli: ✓ Found in fnm directory: /Users/you/.local/share/fnm/node-versions/v20.../bin/aio
   ```

Or if it needs to install:
   ```
   [Prereq Check] aio-cli: Found at /Users/you/.nvm/.../bin/aio, but NOT in fnm directory. Treating as not installed to avoid interference.
   [Prerequisites] Installing Adobe I/O CLI globally
   ```

---

## 🙏 Acknowledgments

Thanks to beta testers who helped identify this isolation issue:
- J. Britts - for providing detailed logs showing the nvm/fnm conflict

---

## 📝 Full Changelog

**v1.0.0-beta.5** (Oct 13, 2025)
- Same as beta.3, re-released to fix version numbering after accidental beta.4 build
- fix: verify perNodeVersion prerequisites are in fnm directory (complete isolation from nvm/other)
- fix: correct repository URL in updateManager (adobe → skukla) for update checker
- docs: add os import to prerequisitesManager

**v1.0.0-beta.4** (Oct 13, 2025)
- ❌ Accidental build with wrong version number (not released)

**v1.0.0-beta.3** (Oct 13, 2025)
- ❌ Released but missing compiled TypeScript changes in VSIX

**v1.0.0-beta.2** (Oct 13, 2025)
- fix: restore missing commands in package.json
- fix: ensure fnm is found and used for Node version management
- fix: correct repository URL to skukla/demo-builder-vscode
- fix: add author Steve Kukla
- docs: document fnm path detection in ExternalCommandManager

**v1.0.0-beta.1** (Oct 10, 2025)
- Initial beta release
- Component-based architecture
- Adobe I/O integration
- API Mesh deployment
- Multi-component project wizard
- Auto-update system
- VSIX packaging fixes

