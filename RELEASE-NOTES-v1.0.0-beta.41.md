# Release Notes - v1.0.0-beta.41

**Release Date:** October 16, 2025

## 🐛 Critical Fix - Adobe CLI Token Corruption Handling

### Fixed

**Proper Error Handling for Adobe CLI Token Corruption**

Users experiencing Adobe CLI token corruption (expiry = 0) will now see a clear, actionable error message instead of a confusing timeout.

**Before:**
- Browser opens and login completes
- Wizard shows "Authentication timed out"
- User has no idea what went wrong or how to fix it

**After:**
- Browser opens and login completes
- Extension detects corrupted token
- Wizard shows clear message: "Adobe CLI Token Error"
- Displays fix command: `aio auth logout && aio auth login`
- Shows VS Code notification with "Open Terminal" button
- Terminal opens with pre-populated fix instructions

---

## What Changed

### Error Detection
```
[Auth] CORRUPTION DETECTED - entering error path
[Auth] Login completed but token still has expiry = 0 (corrupted)
[Auth] This indicates Adobe CLI is not storing the token correctly
```

### User-Friendly Error Messages
- **Wizard UI:** "Adobe CLI Token Error" with clear instructions
- **VS Code Notification:** Action button to open terminal directly
- **Terminal:** Pre-populated with fix command as comments

### Manual Fix Instructions
When this error occurs, users should run in their terminal:
```bash
aio auth logout && aio auth login
```

This forces Adobe CLI to clear its corrupted token state and start fresh.

---

## Why This Happens

This is a known issue with Adobe CLI where the token expiry timestamp is not stored correctly, even after successful browser authentication. The root cause is in Adobe CLI itself, not the extension.

**Symptoms:**
- Token exists (1700+ characters)
- Token expiry = 0 (invalid/missing timestamp)
- Browser login succeeds
- Extension cannot verify token validity

**Affected Users:**
- Users with certain Adobe CLI configurations
- Users who upgraded Adobe CLI across major versions
- Users with corrupted CLI config files

---

## Files Changed

### Modified
- `src/utils/adobeAuthManager.ts` - Throw specific error for token corruption
- `src/commands/createProjectWebview.ts` - Catch corruption error and show helpful message

---

## Technical Details

### Error Flow
1. Browser login completes successfully
2. Extension checks token validity
3. Token exists but expiry = 0 (corruption detected)
4. Extension throws `ADOBE_CLI_TOKEN_CORRUPTION` error
5. Wizard catches error and displays:
   - In-app message with fix command
   - VS Code notification with action button
   - Terminal with pre-populated instructions

### Debug Logging
The enhanced debug logging from v1.0.0-beta.40 remains in place:
```
[Auth] Post-login token inspection result:
[Auth]   - valid: false
[Auth]   - expiresIn: 0
[Auth]   - token exists: true
[Auth]   - token length: 1707
[Auth] Checking corruption condition: token=true, expiresIn=0, condition=true
[Auth] CORRUPTION DETECTED - entering error path
```

---

## For Users Experiencing This Issue

1. **Update to v1.0.0-beta.41**
2. **Try authentication** (the error message will now be clear)
3. **Click "Open Terminal"** in the notification
4. **Run the suggested command:**
   ```bash
   aio auth logout && aio auth login
   ```
5. **Try creating a project again**

If the issue persists after this fix:
- Check your Adobe CLI version: `aio --version` (should be 11.x or higher)
- Check your Node version: `node --version` (should be 18, 20, or 22)
- Try reinstalling Adobe CLI: `npm install -g @adobe/aio-cli`

---

## Next Steps

If users continue to experience this issue even after running the manual fix, we may need to:
1. Investigate Adobe CLI installation/configuration
2. Consider alternative authentication methods
3. Report issue to Adobe CLI team

---

## Known Issues

None identified in this release beyond the Adobe CLI token corruption issue itself (which is now properly handled).

---

## Feedback

Please report any issues or feedback through the Demo Builder repository or your team channels.

