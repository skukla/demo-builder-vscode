# Research: Component Version "vunknown" Issue

**Research Date**: November 19, 2025
**Topic**: Why newly created projects show "vunknown" for component versions instead of pulling latest releases
**Scope**: Codebase analysis (extension + component repos)

---

## Executive Summary

**Root Cause**: During project creation, component versions are intentionally set to `"unknown"` and are never updated to the actual git tag or package.json version after cloning. The system has the infrastructure to track versions but doesn't populate it with real version data during installation.

**Impact**: Update checks show "vunknown → v1.0.0-beta.2" instead of proper version comparison (e.g., "v1.0.0 → v1.0.0-beta.2").

---

## Complete Flow Analysis

### 1. Component Installation Flow

**File**: `src/features/components/services/componentManager.ts`

**Lines 179-191**: After git clone completes, the code reads the commit hash:

```typescript
// Get current commit hash
const commitResult = await commandManager.execute(
    'git rev-parse HEAD',
    {
        cwd: componentPath,
        enhancePath: true,
        shell: DEFAULT_SHELL,
    },
);

if (commitResult.code === 0) {
    componentInstance.version = commitResult.stdout.trim().substring(0, 8); // Short hash
}
```

**What happens**: Sets `componentInstance.version` to **short commit hash** (8 characters), e.g., `"a3f2b1c8"`

**What's missing**: No attempt to read git tags or package.json version

---

### 2. Version Storage During Project Creation (The Gap)

**File**: `src/features/project-creation/handlers/executor.ts`

**Lines 402-407**: When saving project state:

```typescript
for (const componentId of Object.keys(project.componentInstances || {})) {
    project.componentVersions[componentId] = {
        version: 'unknown', // Will be set on first update
        lastUpdated: new Date().toISOString(),
    };
}
```

**THE PROBLEM**: Hardcoded to `"unknown"` instead of using `componentInstance.version` (which contains the commit hash)

**Lines 200-203**: Component instance is stored earlier:

```typescript
if (result.success && result.component) {
    project.componentInstances![comp.id] = result.component;
    // ... but result.component.version is NEVER copied to componentVersions
}
```

---

### 3. Update Check Logic

**File**: `src/features/updates/services/updateManager.ts`

**Lines 63-76**: Component update checking:

```typescript
const currentVersion = project.componentVersions?.[componentId]?.version || 'unknown';
const latestRelease = await this.fetchLatestRelease(repoPath, channel);

if (!latestRelease) {
    results.set(componentId, {
        hasUpdate: false,
        current: currentVersion,
        latest: currentVersion,
    });
    continue;
}

const hasUpdate = currentVersion === 'unknown' ||
            this.isNewerVersion(latestRelease.version, currentVersion);
```

**Special handling**: If version is `"unknown"`, it's treated as needing an update (line 75)

**Lines 176**: Latest version comes from GitHub Release tag:

```typescript
version: release.tag_name.replace(/^v/, ''),  // e.g., "1.0.0-beta.2"
```

---

### 4. Version Update After Component Update (Works Correctly)

**File**: `src/features/updates/services/componentUpdater.ts`

**Lines 77-80**: After successful component update:

```typescript
project.componentVersions[componentId] = {
    version: newVersion,  // Uses the version from GitHub Release tag
    lastUpdated: new Date().toISOString(),
};
```

**This works correctly** - version gets properly set to semver tag (e.g., "1.0.0-beta.2")

---

## The Missing Piece: Git Tag Detection

### Current Situation

- Git clones **do not** specify a tag when cloning (uses `--branch master`)
- Code reads commit hash via `git rev-parse HEAD` but **never reads git tags**
- No code attempts to run `git describe --tags` to find the tag for the current commit
- No code reads `package.json` version field

### What Should Happen

During component installation, after cloning, the code should:

**Option 1: Use git describe (Recommended)**

```bash
git describe --tags --always
# Output: v1.0.0 (if on a tagged commit) or v1.0.0-5-ga3f2b1c (if 5 commits after tag)
```

**Option 2: Read package.json version**

```typescript
const packageJsonPath = path.join(componentPath, 'package.json');
const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
const version = pkg.version; // e.g., "1.0.0"
```

---

## Key Files and Line Numbers

### Where Version SHOULD Be Set (But Isn't)

#### 1. ComponentManager Installation
- **File**: `src/features/components/services/componentManager.ts`
- **Lines**: 175-191
- **Current behavior**: Sets `componentInstance.version` to commit hash
- **Fix needed**: Should set to git tag or package.json version

#### 2. Project Creation State Initialization
- **File**: `src/features/project-creation/handlers/executor.ts`
- **Lines**: 402-407
- **Current behavior**: Hardcodes `version: 'unknown'`
- **Fix needed**: Should use `project.componentInstances[componentId].version`

### Where It Works Correctly

#### 1. Component Update
- **File**: `src/features/updates/services/componentUpdater.ts`
- **Lines**: 77-80
- **Behavior**: Uses GitHub Release tag version (correct)

#### 2. Update Check
- **File**: `src/features/updates/services/updateManager.ts`
- **Lines**: 63-76
- **Behavior**: Correctly compares versions and handles "unknown" as needing update

---

## Solution Approaches

### Approach 1: Use Git Describe (Most Accurate)

**Location**: `componentManager.ts` lines 179-191

Replace:
```typescript
componentInstance.version = commitResult.stdout.trim().substring(0, 8); // Short hash
```

With:
```typescript
// Try to get version from git tag
const tagResult = await commandManager.execute(
    'git describe --tags --exact-match HEAD',  // Only if on exact tag
    {
        cwd: componentPath,
        enhancePath: true,
        shell: DEFAULT_SHELL,
    },
);

if (tagResult.code === 0) {
    // On a tagged commit (e.g., "v1.0.0")
    componentInstance.version = tagResult.stdout.trim().replace(/^v/, '');
} else {
    // Not on a tagged commit, use commit hash
    componentInstance.version = commitResult.stdout.trim().substring(0, 8);
}
```

**Pros**:
- Most accurate - uses actual git tags
- Works for tagged releases
- Falls back to commit hash for untagged commits

**Cons**:
- Requires git tags to be present in shallow clone
- Extra command execution

---

### Approach 2: Read package.json version (Simpler)

**Location**: `componentManager.ts` after line 217 (where package.json is already accessed)

```typescript
// After checking for package.json existence
try {
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    if (packageJson.version) {
        componentInstance.version = packageJson.version;
    }
} catch {
    // Keep commit hash if package.json read fails
}
```

**Pros**:
- Simple and reliable
- package.json always has version
- No extra git commands

**Cons**:
- Relies on package.json being kept up to date
- May not match git tags exactly

---

### Approach 3: Copy from componentInstance to componentVersions

**Location**: `executor.ts` lines 402-407

Replace:
```typescript
project.componentVersions[componentId] = {
    version: 'unknown', // Will be set on first update
    lastUpdated: new Date().toISOString(),
};
```

With:
```typescript
const componentInstance = project.componentInstances[componentId];
project.componentVersions[componentId] = {
    version: componentInstance?.version || 'unknown',
    lastUpdated: new Date().toISOString(),
};
```

**Note**: This only helps if `componentInstance.version` has a real version (requires Approach 1 or 2 first)

**Pros**:
- Simple fix
- Preserves whatever version was detected

**Cons**:
- Doesn't fix the root issue (still need to detect proper version first)
- Only useful in combination with Approach 1 or 2

---

## Recommended Solution

### Hybrid Approach (Most Robust)

**Step 1**: In `componentManager.ts` (after git clone):
1. Try `git describe --tags --exact-match HEAD` first (for tagged commits)
2. Fallback to `package.json` version if available
3. Final fallback to commit hash

**Step 2**: In `executor.ts` (during project creation):
- Copy `componentInstance.version` to `componentVersions[id].version`
- This preserves whatever version was detected during installation

### Implementation Priority

1. **Fix in componentManager.ts** (Lines 179-191)
   - Add git tag detection with package.json fallback
   - Keep commit hash as final fallback

2. **Fix in executor.ts** (Lines 402-407)
   - Use `componentInstance.version` instead of `'unknown'`

This ensures:
- ✅ New projects show proper versions immediately
- ✅ Works whether components are on tagged commits or not
- ✅ Falls back gracefully to commit hash if no version found
- ✅ Update checks work correctly from day one

---

## Files That Need Changes

### 1. Component Manager
**File**: `src/features/components/services/componentManager.ts`
**Lines**: 179-191
**Change**: Add git tag detection and/or package.json reading

### 2. Project Creation Executor
**File**: `src/features/project-creation/handlers/executor.ts`
**Lines**: 402-407
**Change**: Use `componentInstance.version` instead of `'unknown'`

---

## Component Repository Information

Based on the configuration:
- **citisignal-nextjs**: `https://github.com/skukla/citisignal-nextjs` (master branch)
- **commerce-mesh**: `https://github.com/skukla/commerce-mesh` (master branch)
- **integration-service**: `https://github.com/skukla/kukla-integration-service`

All use shallow clones (`gitOptions.shallow: true`) which means only the latest commit is fetched. Git tags should still be available if the HEAD commit is tagged.

---

## Testing Strategy

After implementing the fix:

1. **Create new project** with components
2. **Verify** component versions show actual versions (not "vunknown")
3. **Check for updates** immediately after creation
4. **Expected**: Should show "v1.0.0 → v1.0.0-beta.2" (or no update if already latest)
5. **Edge case**: Test with component not on a tagged commit (should fall back to commit hash)

---

## Related Code

### Existing Version Comparison Logic (Works Correctly)

**File**: `src/features/updates/services/updateManager.ts`
**Lines**: 123-136

```typescript
private isNewerVersion(latest: string, current: string): boolean {
    // Clean versions (remove 'v' prefix if present)
    const cleanLatest = latest.replace(/^v/, '');
    const cleanCurrent = current.replace(/^v/, '');

    // Use semver comparison
    try {
        return semver.gt(cleanLatest, cleanCurrent);
    } catch {
        // Fallback to string comparison if semver fails
        return cleanLatest > cleanCurrent;
    }
}
```

This comparison logic is solid and will work correctly once we provide proper versions.

---

## Conclusion

The "vunknown" issue is caused by two disconnected pieces:
1. Version detection during installation never tries git tags or package.json
2. Project state initialization hardcodes "unknown" instead of using detected version

The fix is straightforward: detect proper versions during installation and copy them to project state. The recommended hybrid approach ensures robustness across different component states (tagged vs. untagged commits).
