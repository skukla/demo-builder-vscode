# Release Notes - v1.0.0-beta.36

## 🔍 Debug & Investigation Release

This release adds comprehensive debug logging to investigate authentication token expiry issues reported by beta testers.

---

## 🐛 Issues Being Investigated

**"Token expired 0 minutes ago" After Login**
- Some users report that immediately after successful browser login, the token is detected as expired
- This prevents authentication from completing successfully
- Added detailed token inspection logging to diagnose the root cause

---

## 🔧 Debug Improvements

### Enhanced Token Inspection Logging

Added comprehensive logging to `inspectToken()` to capture:
- Raw expiry string from Adobe CLI config
- Parsed expiry timestamp
- Current system timestamp
- Time difference in milliseconds and minutes
- Token length validation

**Example Debug Output**:
```
[Auth Token] Expiry string from CLI: 1729105629240
[Auth Token] Expiry timestamp: 1729105629240
[Auth Token] Current timestamp: 1729105627240
[Auth Token] Difference (ms): 2000
[Auth Token] Difference (min): 0
[Auth Token] Token length: 2143
```

### Terminal Disposal Logging

Added detailed logging for Homebrew terminal disposal:
- User action tracking (Continue vs dismissed)
- Terminal existence checks before/after disposal
- Error handling for disposal failures

---

## 📊 What to Check

If you're experiencing authentication issues, please check the **Debug** output channel for these log lines after attempting to authenticate:

1. **Token Expiry Data** - Look for `[Auth Token]` lines showing expiry timestamps
2. **Token Validation** - Check if token is marked as expired and why
3. **Time Differences** - Verify if expiry is being read in wrong time units

---

## 🔄 For Beta Testers

This is a diagnostic release. Please:
1. Update to v1.0.0-beta.36
2. Attempt authentication
3. Share the `[Auth Token]` debug log lines with the team
4. This will help us identify and fix the underlying issue

---

## 🙏 Help Us Fix This

Your debug logs are critical to solving this authentication issue. Thank you for your patience and detailed feedback!

---

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.35...v1.0.0-beta.36

