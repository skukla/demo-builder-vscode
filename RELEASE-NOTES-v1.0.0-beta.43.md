# Release Notes: v1.0.0-beta.43

**Release Date**: October 17, 2025

## 🎯 Focus: Log Cleanup & Prerequisites UX

This release significantly reduces log verbosity in the main "Demo Builder: Logs" channel and fixes a critical bug where the prerequisite installation UI could become stuck after failures.

---

## 🔧 Fixes

### Prerequisites System

- **Fixed stuck prerequisites UI**: The "Recheck" button could become permanently disabled after an installation failure. The UI now properly resets its state (`installingIndex`) when installations complete, fail, or time out.
- **Improved error recovery**: Installation errors now allow immediate retry without requiring an extension reload.
- **Better timeout handling**: Prerequisite checks that time out no longer leave the UI in an inconsistent state.

### Logging Improvements

Reduced log verbosity in the main "Demo Builder: Logs" channel by ~70%:

- **Authentication Flow**:
  - Removed redundant "Verifying access to..." and "Successfully verified access to..." messages
  - Removed "Auto-selecting organization" and "Found N organizations" messages
  - Removed "Enabled high-performance mode" message
  - Simplified token corruption error from 11 lines to 1 line
  - Changed post-login verification errors from `error` to `warn` level
  - Demoted org validation retry messages to debug channel

- **Prerequisites**:
  - Removed "Node versions needed: X, Y" from main logs
  - Removed "Found N prerequisites to check" from main logs
  - Removed "Checking X..." for each prerequisite
  - Removed "User initiated install for: X" messages
  - Removed "X installation succeeded/incomplete" messages
  - Reduced check failure messages from 2 lines to 1 line
  - Moved timeout details to debug channel

All removed messages are still available in the "Demo Builder: Debug" channel for troubleshooting.

---

## 🎨 UI/UX Improvements

- Cleaner log output focuses on actionable user information
- Failed installations now show a clear error message with the "Install" button still available
- Error and warning messages are more concise and consistent

---

## 🧪 Testing Notes

### For Prerequisites:
1. Create a new project
2. Intentionally fail a prerequisite installation (e.g., by disconnecting network)
3. Verify the "Recheck" button remains enabled
4. Verify you can retry the installation immediately

### For Logging:
1. Open "Demo Builder: Logs" channel
2. Run through the complete wizard flow
3. Verify logs are much less verbose but still show critical information
4. Switch to "Demo Builder: Debug" for detailed diagnostics

---

## 📝 Technical Details

### Changed Files
- `src/utils/adobeAuthManager.ts`: Reduced 15+ info/warn messages to debug level
- `src/commands/createProjectWebview.ts`: Moved prerequisite logging to debug, fixed error handling
- `src/webviews/components/steps/PrerequisitesStep.tsx`: Fixed `installingIndex` state management

### State Management Fix
The prerequisite installation flow now guarantees:
1. Backend always sends `prerequisite-install-complete` message (even on errors)
2. UI always resets `installingIndex` when receiving this message
3. Error status includes `canInstall: true` to show the Install button

---

## 🔄 Upgrade Notes

- No breaking changes
- No configuration changes required
- Existing projects are fully compatible

---

## 🐛 Known Issues

None specific to this release.

---

## 🙏 Credits

Thanks to the team for reporting the stuck prerequisites issue and verbose logging concerns.

