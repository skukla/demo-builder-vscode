# Demo Builder v1.0.0-beta.22 Release Notes

## 🐛 Fixed: False Component Update Notifications

### Issue
After loading a project dashboard for previously created projects, users would see update notifications like:
```
citisignal-nextjs: vunknown → v1.0.0-beta.1
commerce-mesh: vunknown → v1.0.0-beta.1
```

This occurred even when components were already at the latest version, causing unnecessary "update" operations that didn't actually change anything.

### Root Cause
Older projects had `componentVersions` stored as `'unknown'` instead of the actual git commit hash. The update checker would see:
- Current: "unknown"
- Latest: "v1.0.0-beta.1"
- Result: Assumes update is needed ❌

### Fix
Enhanced the update checker to intelligently handle "unknown" versions:

1. **Git Commit Comparison**: When `currentVersion === 'unknown'`, compare the installed component's git commit hash against the latest release's commit hash
2. **Auto-Fix Version Tracking**: If commits match, automatically update `componentVersions` with the proper version tag for future checks
3. **Skip False Updates**: Only show update notification if commits actually differ

**Code Logic:**
```typescript
if (currentVersion === 'unknown') {
  const installedCommit = instance.version; // Git commit hash
  const releaseCommit = latestRelease.commitSha;
  
  if (installedCommit === releaseCommit) {
    // Already at this version - auto-fix tracking
    project.componentVersions[componentId] = {
      version: latestRelease.version,
      lastChecked: new Date().toISOString()
    };
    hasUpdate = false; // No update needed
  }
}
```

### Impact
- ✅ No more false update notifications for existing projects
- ✅ Component versions automatically tracked correctly after first check
- ✅ Only shows real updates when git commits differ
- ✅ Reduces unnecessary "update" operations

---

**Previous Fix (v1.0.0-beta.21)**: Fixed dashboard mesh status detection for projects without componentConfigs

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.21...v1.0.0-beta.22

