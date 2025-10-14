# Demo Builder v1.0.0-beta.21 Release Notes

## 🐛 Fixed: Dashboard Mesh Status Detection

### Issue
The Project Dashboard was showing "Not Deployed" for mesh status even when a mesh was successfully deployed. This occurred in two scenarios:

1. **Initial load** - Status would show as "Not Deployed" briefly
2. **Projects without componentConfigs** - Status would always show "Not Deployed"

### Root Cause
1. The synchronous mesh status check was using the old logic that checked `meshState.envVars` length instead of `meshState.lastDeployed`
2. Projects without `componentConfigs` (older projects or unconfigured projects) would skip the mesh status check entirely, even if `meshState.lastDeployed` indicated a deployed mesh

### Fix
**Part 1 - Consistent Status Check:**
Updated the synchronous mesh status check to use `meshState.lastDeployed` instead of checking `envVars`, making it consistent with the async path.

**Part 2 - Fallback for Missing componentConfigs:**
Added fallback logic in both async and sync paths to check `meshState.lastDeployed` when `componentConfigs` is not available:

```typescript
} else {
    // No componentConfigs - can't check for changes, but can check if deployed
    if (project.meshState && project.meshState.lastDeployed) {
        meshStatus = 'deployed';
    }
}
```

### Impact
- ✅ Dashboard now correctly shows "Deployed" status for deployed meshes
- ✅ Status detection works even without `componentConfigs` populated
- ✅ Older projects now show correct mesh status
- ✅ Works correctly even when mesh has no custom environment variables

---

**Previous Fix (v1.0.0-beta.20)**: Fixed ALL remaining Node version issues in mesh verification commands

**Full Changelog**: https://github.com/skukla/demo-builder-vscode/compare/v1.0.0-beta.20...v1.0.0-beta.21

