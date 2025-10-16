# Release Notes - v1.0.0-beta.40

**Release Date:** October 16, 2025

## 🔍 Debug Release - Enhanced Token Inspection Logging

This is a diagnostic release to help identify why corrupted token detection is not working as expected for some users.

### What's New

**Enhanced Post-Login Token Inspection:**
- Added comprehensive debug logging after login to show exact token state
- Logs now show:
  - Token validity (`valid: true/false`)
  - Token expiry (`expiresIn: X minutes`)
  - Token existence (`token exists: true/false`)
  - Token length (character count)
  - Corruption condition evaluation (step-by-step boolean logic)

### Purpose

Users experiencing authentication timeouts after successful browser login should update to this version and provide the debug logs. This will help us determine:
1. Whether the token is being correctly inspected
2. Whether the corruption detection condition is evaluating correctly
3. Where exactly the authentication flow is hanging/timing out

### Debug Log Example

When you authenticate, you should now see logs like:
```
[Auth] Post-login token inspection result:
[Auth]   - valid: false
[Auth]   - expiresIn: 0
[Auth]   - token exists: true
[Auth]   - token length: 1706
[Auth] Checking corruption condition: token=true, expiresIn=0, condition=true
[Auth] CORRUPTION DETECTED - entering error path
```

### For Users Experiencing Authentication Issues

1. Update to v1.0.0-beta.40
2. Try to create a new project (trigger authentication)
3. After the browser login completes, check your Debug channel logs
4. Share the logs that start with `[Auth] Post-login token inspection result:`
5. This will help us determine the root cause of the token corruption issue

---

## Files Changed

### Modified
- `src/utils/adobeAuthManager.ts` - Added detailed post-login token inspection logging

---

## Next Steps

Once we understand what's happening from the debug logs, we'll release a proper fix in the next version.

---

## Upgrade Notes

This is a diagnostic release. No functional changes - only additional logging.

