# Adobe Demo Builder v1.0.2-beta.1

**Release Date**: October 13, 2025

## 🐛 Critical Bug Fixes

This release addresses two critical issues that prevented the extension from functioning correctly after VSIX installation.

### Fixed: Missing Commands in Command Palette

**Issue**: Several core commands were missing from `package.json`, causing them to not appear in the VS Code Command Palette after installing the VSIX.

**Impact**: Users couldn't access:
- Demo Builder: Create Project
- Demo Builder: Check for Updates  
- Demo Builder: Reset All (Dev Only)

**Resolution**: Restored all missing command definitions to `package.json`.

**Commit**: `071bf59` - fix: restore missing commands in package.json

---

### Fixed: Node Version Management with fnm

**Issue**: When the extension spawned child processes to run Adobe I/O CLI commands, `fnm` (Fast Node Manager) wasn't in the PATH, causing commands to run with the wrong Node version.

**Symptoms**:
```
[ERR_REQUIRE_ESM] Error Plugin: @adobe/aio-cli-plugin-commerce
Must use import to load ES Module
```
```
[MODULE_NOT_FOUND] Error Plugin: @adobe/aio-cli: Cannot find module 'node:util'
```

**Root Cause**: 
- VS Code's inherited environment didn't always include fnm in PATH
- Extension checked for `fnm` availability by running `fnm --version`
- When fnm wasn't found, commands ran without Node version switching
- Commands used whatever Node version the shell found first (often an old nvm-managed version)
- Old Node versions (v14) couldn't run modern Adobe I/O CLI packages

**Impact**: 
Users experienced errors when:
- Creating API Mesh configurations
- Authenticating with Adobe I/O
- Selecting Adobe organizations/projects
- Any operation requiring Adobe I/O CLI

**Resolution**: 
The extension now **actively searches for fnm** in common installation locations instead of relying on PATH:

1. **New `findFnmPath()` method** checks:
   - `/opt/homebrew/bin/fnm` (Homebrew on Apple Silicon)
   - `/usr/local/bin/fnm` (Homebrew on Intel Mac)
   - `~/.local/bin/fnm` (manual install)
   - `~/.fnm/fnm` (fnm self-install)
   - Falls back to `which fnm` if in PATH

2. **All fnm commands now use full path**:
   - Before: `fnm use 20 && aio console where`
   - After: `/opt/homebrew/bin/fnm use 20 && aio console where`

3. **Works in all scenarios**:
   - ✅ fnm not in VS Code's inherited PATH
   - ✅ User has multiple Node managers (nvm + fnm)
   - ✅ Shell hasn't initialized fnm environment
   - ✅ VS Code started before fnm was installed

**Commits**: 
- `ac1a6a2` - fix: ensure fnm is found and used for Node version management
- `de39ae6` - docs: document fnm path detection in ExternalCommandManager

---

## 🔧 Technical Details

### Changes to `externalCommandManager.ts`

**New Method**: `findFnmPath()`
```typescript
private findFnmPath(): string | null {
    // Check common installation locations
    const commonPaths = [
        '/opt/homebrew/bin/fnm',
        '/usr/local/bin/fnm',
        path.join(os.homedir(), '.local/bin/fnm'),
        path.join(os.homedir(), '.fnm/fnm'),
    ];
    
    for (const fnmPath of commonPaths) {
        if (fs.existsSync(fnmPath)) {
            return fnmPath;
        }
    }
    
    // Fallback to 'which fnm'
    try {
        const result = execSync('which fnm', { encoding: 'utf8' });
        return result.trim().split('\n')[0];
    } catch {
        return null;
    }
}
```

**Updated Methods**:
- `isFnmAvailable()` - Now uses `findFnmPath()` before checking version
- `getCurrentFnmVersion()` - Uses full fnm path
- `execute()` - Uses full fnm path for version switching
- `doNodeVersionSetup()` - Uses full fnm path for Adobe CLI setup

---

## 📦 Installation

### From VSIX

1. Download `adobe-demo-builder-1.0.2-beta.1.vsix` from the [Releases page](https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.2-beta.1)
2. Install via VS Code:
   ```bash
   code --install-extension adobe-demo-builder-1.0.2-beta.1.vsix
   ```
3. Reload VS Code

### Upgrading from v1.0.1-beta.1

If you're on v1.0.1-beta.1:

1. Uninstall the old version:
   ```bash
   code --uninstall-extension adobe-demo-team.adobe-demo-builder
   ```
2. Install v1.0.2-beta.1 from the VSIX file (see above)
3. Reload VS Code

---

## 🧪 Verification

After installing, verify the fixes:

### ✅ Commands Available

Open Command Palette (`Cmd+Shift+P`) and search for:
- `Demo Builder: Create Project` - Should appear ✅
- `Demo Builder: Check for Updates` - Should appear ✅
- `Demo Builder: Reset All` - Should appear ✅

### ✅ Node Version Management

1. Open Demo Builder Welcome Screen
2. Click "Create New Project"
3. Go through the wizard to Adobe authentication
4. Check the Output Panel → "Demo Builder: Logs"
5. Look for: `[Adobe CLI] Found at: /opt/homebrew/bin/fnm` (or similar)
6. No `[ERR_REQUIRE_ESM]` or `[MODULE_NOT_FOUND]` errors should appear

---

## 🙏 Acknowledgments

Thanks to our beta testers who reported these critical issues:
- Node version management issue reported by J. Britts
- Command palette issue discovered during VSIX testing

---

## 📝 Full Changelog

**v1.0.2-beta.1** (Oct 13, 2025)
- fix: restore missing commands in package.json
- fix: ensure fnm is found and used for Node version management
- docs: document fnm path detection in ExternalCommandManager

**v1.0.1-beta.1** (Oct 13, 2025)
- chore: bump version for auto-update testing
- fix: include SVG icons in VSIX package
- fix: include node_modules and templates in VSIX package

**v1.0.0-beta.1** (Oct 10, 2025)
- Initial beta release
- Component-based architecture
- Adobe I/O integration
- API Mesh deployment
- Multi-component project wizard

