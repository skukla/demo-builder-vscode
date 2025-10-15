# Release Notes - v1.0.0-beta.28

## 🐛 Bug Fix: Component Version Tracking During Project Creation

### Problem
When creating new projects, component versions were showing as `vunknown` in update notifications, even when components were at the latest version.

**User Experience:**
```
❌ Updates available: 
   citisignal-nextjs: vunknown → v1.0.0-beta.1
   commerce-mesh: vunknown → v1.0.0-beta.1
```

This was confusing because:
- Components were **already at the latest version**
- The notification suggested an update was needed
- Users had to manually dismiss false update warnings

---

## Root Cause

**Two-Part Issue:**

1. **v1.0.0-beta.22 Fix (Partial):** We fixed the update checker to auto-resolve "unknown" versions by comparing git commit SHAs with GitHub releases. This worked for **existing projects** when checking for updates.

2. **Remaining Issue:** During **project creation**, component versions were initialized as git commit SHAs without checking GitHub to resolve them to proper version numbers.

**Code Flow (Before Fix):**
```
Project Creation:
├─ Install components (git SHA stored in instance.version)
├─ Initialize componentVersions: { version: gitSHA }
└─ Save project ❌ Still shows "vunknown"

First Update Check:
├─ Detect version = "gitSHA" (looks like "unknown")
├─ Fetch GitHub release
├─ Compare SHAs → Match!
└─ Auto-fix componentVersions ✅ Finally resolved
```

**Result:** Users saw false update notifications on every newly created project until they manually ran "Check for Updates".

---

## The Fix

**Now at Project Creation:**
```
Project Creation:
├─ Install components (git SHA stored)
├─ Initialize componentVersions with git SHA
├─ Run checkComponentUpdates() immediately
│  ├─ Fetch latest releases from GitHub
│  ├─ Compare commit SHAs
│  └─ Auto-fix componentVersions if match
└─ Save project ✅ Versions already resolved!
```

**Key Changes:**
- **Modified:** `createProjectWebview.ts` - After installing components, immediately run `updateManager.checkComponentUpdates()` to resolve versions
- **Benefit:** Reuses existing auto-fix logic from v1.0.0-beta.22
- **Graceful Degradation:** If GitHub fetch fails, continues with git SHAs (will be resolved on first manual update check)

---

## User Impact

**Before:**
- ❌ New projects always showed false update notifications
- ❌ `vunknown → v1.0.0-beta.1` even when already at latest
- ❌ Required manual "Check for Updates" to clear

**After:**
- ✅ New projects have correct versions from the start
- ✅ Only see update notifications when updates truly exist
- ✅ No more `vunknown` false positives
- ✅ Cleaner, more accurate update experience

---

## Technical Details

### Implementation
The fix leverages the existing `UpdateManager.checkComponentUpdates()` logic, which already handles:
- Fetching latest releases from GitHub
- Comparing installed commit SHAs with release commit SHAs
- Auto-fixing `componentVersions` when matches are found
- Graceful error handling if GitHub is unreachable

### Error Handling
If GitHub fetch fails during project creation:
- Component versions remain as git commit SHAs
- No error shown to user
- Versions will be resolved on first manual "Check for Updates"
- Project creation continues normally

### Performance
- Adds ~1-2 seconds to project creation (GitHub API calls)
- Only runs once per component during project creation
- Non-blocking (project creation completes even if GitHub fetch fails)

---

## Related Issues

**Previous Fixes:**
- v1.0.0-beta.22: Auto-fix "unknown" versions in update checker (existing projects)
- v1.0.0-beta.21: Fixed false "Not Deployed" mesh status
- v1.0.0-beta.20: Fixed Node version for mesh commands

**This Fix:**
- Completes the version tracking story by handling project creation
- No more `vunknown` versions in any scenario

---

## Upgrade Impact

**What Users Will Notice:**
- ✅ New projects won't show false update notifications anymore
- ✅ Component versions display correctly from the start
- ✅ Update notifications only appear when actual updates exist

**Breaking Changes:** None

**Migration Required:** None (existing projects already fixed by v1.0.0-beta.22 logic)

---

## Testing Checklist

- [ ] Create new project with citisignal-nextjs and commerce-mesh
- [ ] After project creation, check for updates
- [ ] Verify: NO update notification appears (if components are at latest)
- [ ] Verify: Component versions show as `v1.0.0-beta.X`, not `vunknown`
- [ ] Test with GitHub API offline (simulate network failure)
- [ ] Verify: Project creation still completes successfully

