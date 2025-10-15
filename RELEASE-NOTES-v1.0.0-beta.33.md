# Release Notes - v1.0.0-beta.33

## 🐛 Critical Bug Fix: Node 24 Compatibility

This release fixes a critical bug where the extension would detect and use Node 24, which is **not supported** by the Adobe CLI SDK.

---

## The Problem

The Adobe CLI SDK (used for organization/project operations) only supports **Node 18, 20, or 22**. However, the extension's Node version detection logic would pick the **highest** Node version with `aio-cli` installed, which could be Node 24.

### Error Symptoms

**User Experience:**
- ❌ Authentication appears to succeed
- ❌ "Getting Organizations..." fails with error
- ❌ Can't proceed past organization selection

**Error Message:**
```
Error: Failed to get organizations: - Getting Organizations...
›   Error: [CoreConsoleAPISDK:ERROR_GET_ORGANIZATIONS] TypeError: Bearer
›   Warning: Node.js version v24.10.0 is not supported. Supported versions are
›    ^18 || ^20 || ^22.
```

### Root Cause

The `findAdobeCLINodeVersion()` method would:
1. Find all fnm-managed Node versions with `aio-cli` installed
2. Sort them by version (descending)
3. Pick the **highest** version (e.g., Node 24)
4. Use that version for all Adobe CLI commands

This worked for `aio auth` and `aio config`, but **failed** when using the Adobe CLI SDK for organization operations.

---

## The Fix

**Modified:** `src/utils/externalCommandManager.ts`

Added a compatibility filter to only consider Node versions supported by Adobe CLI SDK:

```typescript
// Adobe CLI SDK supports Node 18, 20, and 22 only (not 24+)
// See: https://github.com/adobe/aio-lib-core-console-api
const SUPPORTED_NODE_VERSIONS = [18, 20, 22];

// Skip Node versions not supported by Adobe CLI SDK
if (!SUPPORTED_NODE_VERSIONS.includes(major)) {
    this.logger.debug(`[Adobe CLI] Node v${major}: skipping (Adobe CLI SDK requires ^18 || ^20 || ^22)`);
    continue;
}
```

Now the extension will:
1. Find all fnm-managed Node versions with `aio-cli` installed
2. **Filter to only Node 18, 20, or 22**
3. Sort remaining versions (descending)
4. Pick the **highest compatible** version (e.g., Node 22 if available, else 20, else 18)

---

## Version Selection Priority

The extension now selects Node versions in this order:
1. **Node 22** (highest supported)
2. **Node 20** (if 22 not available)
3. **Node 18** (if 20 not available)

**Node 24+ are skipped entirely** to ensure compatibility with Adobe CLI SDK.

---

## Impact

### Who Was Affected

This bug affected users who:
- Had Node 24 installed via fnm
- Had `aio-cli` installed globally in Node 24
- Were trying to select organizations or projects

### What's Fixed

✅ Extension skips Node 24 and uses Node 22/20/18 instead  
✅ Organization selection works correctly  
✅ Project selection works correctly  
✅ All Adobe CLI SDK operations work properly  
✅ Clear debug logging shows which Node versions are skipped and why

---

## Debug Logging

The extension now logs when skipping incompatible Node versions:

```
[Adobe CLI] Node v24: skipping (Adobe CLI SDK requires ^18 || ^20 || ^22)
[Adobe CLI] Node v22: aio-cli works ✓
[Adobe CLI] Found 1 fnm Node version(s) with working aio-cli, using highest: Node v22
```

This makes it clear which Node version is being used and why.

---

## For Users with Node 24

**If you have Node 24 installed:**
1. The extension will automatically skip it and use Node 22/20/18
2. No action required on your part
3. Check debug logs to confirm which Node version is being used

**If you only have Node 24 installed:**
1. The extension will warn that no compatible Node version is available
2. Install Node 22, 20, or 18 via fnm:
   ```bash
   fnm install 22
   fnm use 22
   npm install -g @adobe/aio-cli
   ```

---

## Technical Details

### Adobe CLI SDK Compatibility

The Adobe CLI SDK (`@adobe/aio-lib-core-console-api`) explicitly requires:
- **Node 18.x** (^18)
- **Node 20.x** (^20)
- **Node 22.x** (^22)

Node 24+ introduces breaking changes that the SDK hasn't yet adapted to.

### Why This Matters

The Adobe CLI has two distinct components:
1. **Adobe CLI commands** (`aio auth`, `aio config`, etc.) - Work on any Node version
2. **Adobe CLI SDK** (organization/project operations) - Requires Node 18/20/22

This is why authentication appeared to work (it uses CLI commands) but organization selection failed (it uses SDK).

---

## Testing

### Before Fix
1. User with Node 24 and `aio-cli` installed
2. Try to authenticate → Succeeds ✓
3. Try to select organization → Fails with "Node.js version v24.10.0 is not supported" ❌

### After Fix
1. Same user with Node 24 and Node 22 both installed
2. Extension automatically skips Node 24, uses Node 22
3. Authentication works ✓
4. Organization selection works ✓

---

## Upgrade Notes

**Automatic:** No migration needed. The fix applies immediately on extension reload.

**For Users with Node 24:**
- If you also have Node 22/20/18, the extension will automatically use the highest compatible version
- If you only have Node 24, install a compatible version: `fnm install 22`

---

## Summary

v1.0.0-beta.33 ensures the extension only uses Node versions compatible with the Adobe CLI SDK (18, 20, 22), preventing errors during organization and project operations.

**If you experienced "Node.js version v24.10.0 is not supported" errors in v1.0.0-beta.32 and earlier, this release resolves them completely.**

---

## Related to v1.0.0-beta.32

This release builds on v1.0.0-beta.32's path quoting fix. Together, these releases ensure:
- ✅ Paths with spaces work correctly (v1.0.0-beta.32)
- ✅ Compatible Node versions used (v1.0.0-beta.33)

Both fixes are critical for reliable Adobe CLI operations.

