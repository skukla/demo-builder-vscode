# Adobe Demo Builder v1.0.0-beta.8

**Release Date**: October 13, 2025

> **Note**: This is the eighth beta iteration toward v1.0.0 stable release.

## 🔍 What's New

### Enhanced Update Logging

This release significantly improves visibility into the auto-update system by adding comprehensive logging to the "Demo Builder: Logs" output channel.

**Previously**: Users couldn't see the results of update checks or detailed progress of update installations.

**Now**: Full transparency into the entire update process.

---

## 📝 Detailed Changes

### Update Check Logging

**Added logging for update check results:**

```
[Updates] Checking for extension updates
[Updates] Checking for component updates
[Updates] ✓ No updates available - Demo Builder is up to date
```

Or when updates are found:

```
[Updates] Checking for extension updates
[Updates] Checking for component updates
[Updates] Found 2 update(s):
[Updates]   - Extension: v1.0.0-beta.7 → v1.0.0-beta.8
[Updates]   - citisignal-nextjs: v1.0.0 → v1.0.1
```

### Extension Update Logging

**Added detailed logging for the extension update lifecycle:**

```
[Update] Starting extension update to v1.0.0-beta.8
[Update] Downloaded VSIX to /tmp/demo-builder-1.0.0-beta.8.vsix
[Update] Installing extension from /tmp/demo-builder-1.0.0-beta.8.vsix
[Update] ✓ Extension installed successfully
[Update] Cleaned up temporary VSIX file
[Update] Reloading window to apply extension update
```

Or if the user chooses to reload later:

```
[Update] User chose to reload later
```

### Component Update Logging

**Added summary logging for component updates:**

```
[Update] Updating citisignal-nextjs to 1.0.1
[Update] Creating snapshot at /path/to/.snapshot-citisignal-nextjs
[Update] Downloading from https://...
[Update] Downloaded 5.23 MB
[Update] Extracted to /path/to/citisignal-nextjs
[Update] Merged .env: added 2 new variables (NEW_VAR1, NEW_VAR2)
[Update] ✓ Component structure verified successfully
[Update] Successfully updated citisignal-nextjs to 1.0.1
[Update] Removed snapshot (update successful)
[Updates] ✓ 1 component(s) updated successfully
```

---

## 🎯 Impact

### User Benefits

1. **Transparency**: Users can now see exactly what the update system is doing at every step
2. **Troubleshooting**: Detailed logs help diagnose update issues more easily
3. **Confidence**: Clear success messages provide reassurance that updates completed correctly
4. **User Choice Tracking**: Know whether updates were applied immediately or deferred

### Developer Benefits

1. **Debuggability**: Full audit trail of update operations for troubleshooting
2. **User Support**: Logs can be shared for support requests
3. **Testing**: Easier to verify update system is working correctly

---

## 📦 Installation

### From VSIX

1. Download `adobe-demo-builder-1.0.0-beta.8.vsix` from the [Releases page](https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.8)
2. Install via VS Code:
   ```bash
   code --install-extension adobe-demo-builder-1.0.0-beta.8.vsix
   ```
3. Reload VS Code

### Upgrading from v1.0.0-beta.7

If you're on v1.0.0-beta.7:

1. Use the built-in update checker:
   - Open Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`)
   - Run: "Demo Builder: Check for Updates"
   - Click "Update All"
   - Reload when prompted

2. Or install manually:
   ```bash
   code --uninstall-extension adobe-demo-team.adobe-demo-builder
   code --install-extension adobe-demo-builder-1.0.0-beta.8.vsix
   ```

---

## 🧪 Verification

After installation and VS Code reload:

1. **Test Update Checker**: 
   - Open Command Palette (`Cmd+Shift+P`)
   - Run: "Demo Builder: Check for Updates"
   - Open "Demo Builder: Logs" output channel
   - Verify you see: `[Updates] ✓ No updates available - Demo Builder is up to date`

2. **Check Version**:
   - Look at the extension's status bar (bottom right)
   - Should show: `Adobe Demo Builder v1.0.0-beta.8`

---

## 🔧 Technical Details

### Files Modified

**`src/commands/checkUpdates.ts`**:
- Added logging for update check results (no updates/updates found)
- Added logging for list of available updates
- Added component update count summary

**`src/utils/extensionUpdater.ts`**:
- Added logging for update start
- Added logging for VSIX installation
- Added logging for successful installation
- Added logging for temp file cleanup
- Added logging for user reload choice

**`package.json`**:
- Version bump: `1.0.0-beta.7` → `1.0.0-beta.8`

---

## 📊 Logging Coverage

The update system now logs:

- ✅ Update check initiation
- ✅ Update check results (found/none)
- ✅ List of available updates
- ✅ Extension download progress
- ✅ Extension installation
- ✅ Extension installation success
- ✅ Cleanup operations
- ✅ User reload choice
- ✅ Component update count
- ✅ Component-specific update details (already existed)

---

## 🔗 Quick Links

- **Release**: https://github.com/skukla/demo-builder-vscode/releases/tag/v1.0.0-beta.8
- **Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.7...v1.0.0-beta.8
- **Issues**: https://github.com/skukla/demo-builder-vscode/issues

---

## 📌 Known Issues

None specific to this release. This is a purely additive improvement focused on observability.

---

## 🚀 What's Next?

Future beta releases will focus on:

- Additional feature improvements
- Performance optimizations
- Bug fixes as reported
- Path to v1.0.0 stable

---

**Thank you for beta testing! Your feedback helps make Demo Builder better.** 🙏

