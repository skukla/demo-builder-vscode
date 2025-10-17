# Release Notes - v1.0.0-beta.42

**Release Date:** October 16, 2025

## 🔧 Enhanced Automatic Token Corruption Fixes

### What's New

**Multi-Step Automatic Repair Before Manual Intervention**

The extension now tries multiple automatic fixes BEFORE asking the user to manually run commands.

**Previous Behavior (v1.0.0-beta.41):**
- Detected corrupted token
- Ran `aio auth logout` (but didn't verify it worked)
- Ran `aio auth login`
- If still corrupted, asked user to do it manually

**New Behavior (v1.0.0-beta.42):**
1. ✅ **Detect** corrupted token (expiry = 0)
2. ✅ **Attempt 1:** Run `aio auth logout`
3. ✅ **Verify:** Check if logout actually cleared the token
4. ✅ **Attempt 2:** If logout failed, manually delete token from config: `aio config delete ims.contexts.cli.access_token`
5. ✅ **Verify:** Check if manual deletion worked
6. ✅ **Login:** Run `aio auth login` (fresh browser auth)
7. ✅ **Final Check:** Verify token now has valid expiry
8. ❌ **If STILL corrupted:** Show error explaining what we tried + manual fix options

---

## Why This Matters

**User Question:** _"Why aren't we handling the login and logout automatically? The extension installs Node and Adobe CLI, we can run aio commands!"_

**Answer:** We ARE! But sometimes even our automatic fixes don't work because:
- Adobe CLI installation is fundamentally corrupted
- Token config files have wrong permissions
- Adobe CLI version is incompatible
- System-level configuration issues

This update makes it crystal clear to users that we **DID** try automatic fixes, and manual intervention is only needed when those fail.

---

## Error Message Improvements

### Before (v1.0.0-beta.41):
```
"Adobe CLI Token Error"
"Please run this command in your terminal: aio auth logout && aio auth login"
```
❌ **Problem:** User thinks we didn't try anything automatically

### After (v1.0.0-beta.42):
```
"Adobe CLI Installation Issue"
"Automatic fixes failed. Manual terminal intervention required."

Terminal shows:
# The extension already tried:
#   1. aio auth logout
#   2. Deleting cached tokens  
#   3. aio auth login (fresh browser auth)
# But token is still corrupted. Try these manual fixes:

# Option 1: Force fresh login
aio auth logout && aio auth login

# Option 2: If that fails, reinstall Adobe CLI
# npm install -g @adobe/aio-cli
```
✅ **Better:** User understands we tried automatic fixes first

---

## Debug Logging

Enhanced logs now show each automatic fix attempt:

```
[Auth] Detected corrupted token (expiry = 0), attempting automatic fix...
[Auth] Attempt 1: Running aio auth logout
[Auth] Logout successful - token cleared
                    OR
[Auth] Logout did not clear token, trying manual config deletion
[Auth] Manual config deletion successful
                    OR
[Auth] Could not clear corrupted token even with manual deletion
```

---

## Files Changed

### Modified
- `src/utils/adobeAuthManager.ts` 
  - Added `aio auth logout` verification step
  - Added manual `aio config delete` fallback
  - Enhanced error messages to explain what was tried
  
- `src/commands/createProjectWebview.ts`
  - Updated error notification to show "Adobe CLI Installation Issue"
  - Terminal now explains automatic fix attempts before showing manual commands
  - Added Adobe CLI reinstall option

---

## When Manual Fixes Are Needed

Manual intervention is only required when:
1. **Automatic logout fails** (Adobe CLI can't clear its own token)
2. **Manual config deletion fails** (File permissions or corruption)
3. **Fresh login still creates corrupted token** (Adobe CLI installation broken)

In these cases, the user needs to:
- Option 1: Run `aio auth logout && aio auth login` in a regular terminal (different shell environment might work)
- Option 2: Reinstall Adobe CLI: `npm install -g @adobe/aio-cli`
- Option 3: Check Node version (must be 18, 20, or 22)
- Option 4: Check Adobe CLI version (must be 11.x+)

---

## Technical Details

### Verification Steps

**After logout:**
```typescript
const afterLogout = await this.inspectToken();
if (!afterLogout.token) {
    // Success - token cleared
} else {
    // Failed - try manual deletion
}
```

**After manual config deletion:**
```typescript
await this.commandManager.executeAdobeCLI(
    'aio config delete ims.contexts.cli.access_token',
    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_WRITE }
);

const afterDelete = await this.inspectToken();
if (!afterDelete.token) {
    // Success - token cleared
} else {
    // Failed - CLI installation corrupted
}
```

---

## Testing

To test the automatic fixes:
1. Create a project (triggers authentication)
2. If you have a corrupted token, you'll see:
   - Debug logs showing each automatic fix attempt
   - Final error (if all automatic fixes fail)
   - Terminal with explanation of what was tried

---

## Known Issues

**Adobe CLI Token Corruption (upstream issue)**
- Some Adobe CLI installations cannot store token expiry correctly
- Root cause is in Adobe CLI itself, not this extension
- Even fresh `aio auth login` creates tokens with `expiry = 0`
- Only fix is manual terminal intervention or Adobe CLI reinstall

---

## Next Steps

If users continue to experience this even after manual fixes:
- Report issue to Adobe CLI team
- Consider alternative authentication approaches
- Investigate if specific Node/OS versions are affected

---

## Feedback

Please report any issues through the Demo Builder repository or team channels.

