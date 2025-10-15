# Release Notes - v1.0.0-beta.29

## 🐛 Critical Fix: Git SHA Detection in Component Version Auto-Fix

### Problem
v1.0.0-beta.28 attempted to auto-fix component versions during project creation, but the detection logic was **broken**. The auto-fix logic only checked for the literal string `"unknown"`, but component versions were actually stored as **40-character git commit SHAs**.

**What Happened:**
```javascript
// v1.0.0-beta.28 logic:
if (currentVersion === 'unknown') {  // This check...
  // Auto-fix logic
}

// But actual data:
currentVersion = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0'  // Git SHA

// Result:
'a1b2c3d4e5...' === 'unknown'  // FALSE ❌
// Auto-fix never ran!
```

**Impact:**
- ❌ New projects (v1.0.0-beta.28): Still showed `vunknown → v1.0.0-beta.1`
- ❌ Existing projects: Still showed `vunknown → v1.0.0-beta.1`
- ❌ v1.0.0-beta.28's auto-fix mechanism was useless

---

## The Fix

**Added Git SHA Detection:**
```javascript
// NEW: Detect git SHAs using regex
const looksLikeGitSHA = /^[0-9a-f]{40}$/i.test(currentVersion);
const isUnknownVersion = currentVersion === 'unknown' || looksLikeGitSHA;

if (isUnknownVersion) {  // Now works for both! ✅
  // Auto-fix logic
}
```

**Regex Explanation:**
- `/^[0-9a-f]{40}$/i` matches exactly 40 hexadecimal characters (standard git SHA format)
- Case-insensitive to handle both lowercase and uppercase SHAs

---

## How It Works

### For New Projects
```
Project Creation:
├─ Install components → Git SHA stored
├─ Initialize componentVersions → Git SHA copied
├─ Run checkComponentUpdates()
│  ├─ Regex detects git SHA ✅
│  ├─ Fetch GitHub release
│  ├─ Compare installed SHA with release SHA
│  ├─ Match found! ✅
│  └─ Auto-fix: version = 'v1.0.0-beta.1'
└─ Save project → Proper version stored ✅
```

**Result:** New projects have proper versions from creation!

### For Existing Projects
```
User Checks for Updates:
├─ currentVersion = 'a1b2c3d4...' (old git SHA)
├─ Regex detects git SHA ✅
├─ Fetch GitHub release
├─ Compare SHAs
├─ Match found! ✅
├─ Auto-fix: version = 'v1.0.0-beta.1'
└─ Save project → No update notification ✅
```

**Result:** Existing projects auto-fix on next update check (no manual intervention required)!

---

## Changes

**Modified:**
- `src/utils/updateManager.ts`:
  - Added regex pattern to detect 40-character git SHAs
  - Changed condition from `currentVersion === 'unknown'` to `isUnknownVersion` (includes git SHAs)
  - Auto-fix logic now triggers for both literal "unknown" and git SHAs

**Technical Details:**
```typescript
// Before (v1.0.0-beta.28):
if (currentVersion === 'unknown') { ... }

// After (v1.0.0-beta.29):
const looksLikeGitSHA = /^[0-9a-f]{40}$/i.test(currentVersion);
const isUnknownVersion = currentVersion === 'unknown' || looksLikeGitSHA;
if (isUnknownVersion) { ... }
```

---

## User Impact

### Before (v1.0.0-beta.28)
**New Projects:**
- ❌ Created with git SHA as version
- ❌ Auto-fix attempted but failed (couldn't detect SHA)
- ❌ Still showed `vunknown → v1.0.0-beta.1` notification
- ❌ Required manual update check to fix

**Existing Projects:**
- ❌ Still had git SHA as version
- ❌ Auto-fix failed on update check
- ❌ Continued to show false update notifications
- ❌ Only option: delete and recreate project

### After (v1.0.0-beta.29)
**New Projects:**
- ✅ Created with git SHA initially
- ✅ Auto-fix detects SHA and resolves to proper version
- ✅ Saved with `v1.0.0-beta.1` from creation
- ✅ No false update notifications ever

**Existing Projects:**
- ✅ Next update check auto-detects git SHA
- ✅ Compares with GitHub release
- ✅ Auto-fixes to proper version
- ✅ No manual intervention needed (no delete/recreate)

---

## Testing Scenarios

### Test 1: New Project Creation
1. Create new project with citisignal-nextjs and commerce-mesh
2. After creation completes, check for updates
3. **Expected:** No update notification (versions already resolved to v1.0.0-beta.1)

### Test 2: Existing Project with Git SHAs
1. Open existing project from v1.0.0-beta.27 or earlier
2. Run "Check for Updates"
3. **Expected:** 
   - First check: Auto-fixes versions silently (no notification if at latest)
   - Subsequent checks: No false notifications

### Test 3: Actual Update Available
1. Create project with older component version
2. Component gets new release
3. Check for updates
4. **Expected:** Shows proper version diff (e.g., `v1.0.0-beta.1 → v1.0.0-beta.2`)

---

## Version History Context

**v1.0.0-beta.22:** 
- Added SHA comparison logic for "unknown" versions
- **Bug:** Only worked if version was literally `"unknown"` string

**v1.0.0-beta.28:** 
- Added auto-fix during project creation
- **Bug:** Detection logic still broken (couldn't detect git SHAs)

**v1.0.0-beta.29:** 
- ✅ Fixed detection logic to recognize git SHAs
- ✅ Completes the version tracking fix (works for both new and existing projects)

---

## Upgrade Impact

**What Users Will Notice:**
1. ✅ **Existing projects:** Next update check will silently fix versions (no action required)
2. ✅ **New projects:** Proper versions from creation (no false notifications)
3. ✅ **All scenarios:** Clean, accurate update experience

**Breaking Changes:** None

**Migration Required:** None
- Existing projects auto-migrate on first update check
- No manual intervention needed

---

## Related Issues

**Previous Attempts:**
- v1.0.0-beta.22: Auto-fix logic added (incomplete detection)
- v1.0.0-beta.28: Project creation auto-fix added (detection still broken)

**This Fix:**
- Completes the git SHA detection logic
- Makes both v1.0.0-beta.22 and v1.0.0-beta.28 fixes actually work
- Universal solution for all version tracking scenarios

---

## Technical Notes

**Why Git SHAs Were Stored:**
- During component installation, `git clone` returns a commit SHA
- This SHA was stored in `instance.version` as the "version"
- `componentVersions` copied this SHA during initialization
- The string "unknown" was only used as a fallback for missing versions

**Why This Wasn't Caught Earlier:**
- v1.0.0-beta.22 tested with projects that had the string "unknown"
- Real-world projects had git SHAs, not "unknown"
- The detection logic was never actually tested with git SHA inputs

**Lesson Learned:**
- Always test with real production data, not just expected formats
- Regex patterns are more robust than exact string matching
- Log the actual values being compared during debugging

