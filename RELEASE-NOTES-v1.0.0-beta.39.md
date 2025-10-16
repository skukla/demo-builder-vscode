# Release Notes - v1.0.0-beta.39

**Release Date:** October 16, 2025

## 🐛 Critical Bug Fix

### Authentication - Corrupted Token Detection

Fixed a critical issue where users with corrupted Adobe CLI tokens (expiry = 0) would experience infinite authentication loops, preventing them from creating or loading projects.

**Issue:**
- Users with corrupted tokens would see continuous "Session expired" / "Sign in required" messages
- Browser authentication would complete successfully but extension would not recognize the login
- Multiple browser windows would open unexpectedly during operations
- This was caused by Adobe CLI storing tokens with missing or invalid expiry timestamps

**Fix:**
- Added **surgical detection** for corrupted tokens before authentication attempts
- Only triggers cleanup when `token exists AND expiresIn === 0` (exact corruption signature)
- **Does not affect:**
  - Valid tokens with future expiry (normal case)
  - Expired tokens with past expiry (normal expiration flow)
  - Missing tokens (normal first-time login flow)
- Added comprehensive debug logging for token inspection to aid future troubleshooting
- Added post-login verification to detect if token corruption persists

**Technical Details:**
```typescript
// Pre-authentication corruption check
const tokenCheck = await this.inspectToken();
if (tokenCheck.token && tokenCheck.expiresIn === 0) {
    // Token exists but has invalid expiry - force cleanup
    await this.logout();
}

// Post-authentication verification
const postLoginToken = await this.inspectToken();
if (postLoginToken.token && postLoginToken.expiresIn === 0) {
    // Login succeeded but token still corrupted - CLI issue
    this.logger.error('[Auth] Token corruption persists after login');
    return false;
}
```

**Impact:**
- Users experiencing authentication loops should now be able to authenticate successfully
- The extension will automatically detect and fix corrupted token state
- Enhanced debug logging will help identify future Adobe CLI token storage issues

---

## Debug Improvements

### Token Inspection Logging
Added detailed debug logging for token inspection to help diagnose authentication issues:
- Token expiry string from CLI
- Expiry timestamp (milliseconds)
- Current timestamp (milliseconds)
- Time difference (minutes)
- Token length (characters)

---

## Related Issues

This fix addresses the root cause of several related issues reported in previous releases:
- Multiple browser windows opening during authentication
- "Session expired" messages for valid sessions
- Zero organizations returned after successful login
- Authentication state not persisting between operations

---

## Upgrade Notes

**For Users Experiencing Authentication Issues:**
1. Update to v1.0.0-beta.39
2. If you still see authentication issues after update:
   - Try signing out and back in from the wizard
   - If that doesn't work, run in terminal: `aio auth logout && aio auth login`
   - Check the Debug channel for detailed token inspection logs

**For Developers:**
- New debug logs in `[Auth Token]` namespace show token inspection details
- Check for `expiresIn: 0` in logs to identify corrupted tokens
- Post-login verification now catches persistent token corruption

---

## Files Changed

### Modified
- `src/utils/adobeAuthManager.ts` - Added corrupted token detection and verification

---

## Testing Recommendations

1. **Normal Authentication Flow:**
   - Create new project → Should authenticate without issues ✓
   - Load existing project → Should use cached auth ✓
   
2. **Corrupted Token Recovery:**
   - If you encounter authentication loops → Update should fix automatically ✓
   - Check Debug channel for `[Auth Token]` logs to verify token state ✓

3. **Token Expiry Scenarios:**
   - Let token expire naturally → Should prompt for re-auth (no corruption) ✓
   - Sign in with valid token → Should proceed normally ✓

---

## Known Issues

None identified in this release.

---

## Feedback

As always, please report any issues or feedback through the Demo Builder repository or your team channels.

