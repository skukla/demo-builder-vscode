# Release Notes - v1.0.0-beta.42

**Release Date:** October 17, 2025

## Critical Fix: Adobe CLI Token Inspection

### Fixed Token Expiry Detection (CRITICAL)

**Problem:** The extension was experiencing Adobe CLI token corruption issues where tokens would appear to have `expiry = 0`, leading to authentication failures even after successful browser login. This affected multiple users and prevented project creation.

**Root Cause:** The extension was querying token and expiry separately:
```typescript
// OLD (Broken - could return stale/inconsistent data)
aio config get ims.contexts.cli.access_token.token
aio config get ims.contexts.cli.access_token.expiry  // Could return 0 or empty
```

**Solution:** Now fetches the entire `access_token` object atomically:
```typescript
// NEW (Fixed - atomic read ensures consistency)
aio config get ims.contexts.cli.access_token --json
// Returns: {"token": "eyJ...", "expiry": 1760750786843}
```

This ensures:
- Token and expiry are always read together (no race conditions)
- Expiry timestamp is correctly retrieved from Adobe CLI's internal storage
- Eliminates false positives for token corruption detection

### Improved Error Handling & Debugging

- **Enhanced corruption detection logging**: Clear visual indicators (━━━━━) and structured error messages when corruption is detected
- **Better debug logging**: Added comprehensive logging throughout token inspection and authentication flow to track error paths
- **Improved terminal guidance**: Updated manual fix instructions to use `aio logout -f && aio login -f` and added additional recovery steps
- **Flow tracking**: Added debug logging to track when errors are thrown and how they propagate to the UI

### Authentication Flow Improvements

- **Try/catch for login()**: Wrapped `authManager.login()` in explicit try/catch to ensure errors (especially token corruption) are properly caught and handled
- **Debug breadcrumbs**: Added "About to call authManager.login()", "login() returned", "login() threw an error" logs to track exact execution path
- **Error propagation**: Ensured token corruption errors are properly re-thrown and caught by the outer error handler

## Technical Details

### Files Changed
- `src/utils/adobeAuthManager.ts`:
  - Modified `inspectToken()` to use single JSON query
  - Enhanced corruption detection with visual separators and detailed logging
  - Added parse error handling for malformed JSON responses

- `src/commands/createProjectWebview.ts`:
  - Added explicit try/catch around `authManager.login()` call
  - Enhanced debug logging for authentication error flow
  - Updated terminal instructions with better recovery commands

### Documentation References
- Adobe CLI `aio login` documentation confirms it returns the access token
- Adobe CLI stores tokens in config as JSON objects with both `token` and `expiry` fields
- The `--json` flag ensures proper structured output parsing

## Testing Recommendations

1. **Test fresh authentication**: Start with no cached tokens, go through browser login
2. **Monitor debug logs**: Look for "Fetched token config (single JSON call)" message
3. **Verify expiry**: Check that expiry timestamp is non-zero after login
4. **Test corruption detection**: If corruption still occurs, verify error messages appear in both logs and UI notification

## Migration Notes

- **No user action required**: This is a transparent fix to internal token reading logic
- **Existing tokens**: Will work correctly with new atomic read approach
- **Corrupted tokens**: If encountered, follow enhanced terminal instructions for manual fix

## Known Issues

- Adobe CLI version 10.3.3 has an update available (11.0.0) - consider updating if authentication issues persist
- Token corruption at the Adobe CLI level (not extension-caused) will still require manual intervention

---

**Full Changelog:** https://github.com/your-org/demo-builder-vscode/compare/v1.0.0-beta.41...v1.0.0-beta.42
