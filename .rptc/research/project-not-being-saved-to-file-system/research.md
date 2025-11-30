# Research: Project Not Being Saved to File System

**Date**: 2025-11-19
**Status**: Critical Bug - Silent Failure
**Impact**: HIGH - Projects appear to save successfully but no files are written to disk

---

## Summary

**Critical silent failure discovered**: Projects appear to save successfully but file write operations are failing silently. The root cause is widespread use of try-catch blocks in `StateManager` that **catch errors but don't re-throw them**, only logging to `console.error()`. When file operations fail (permissions, disk space, etc.), the user sees no error messages and the wizard completes "successfully" despite no files being written.

**User Experience**:
- User completes project creation wizard
- Sees success message and dashboard opens
- But `~/.demo-builder` exists with NO `projects/` subdirectory
- Quick picker shows "No existing projects found"
- Project completely lost on extension restart

---

## Codebase Analysis

### Relevant Files

**Primary failure points:**
- `src/core/state/stateManager.ts:118-154` - `saveProjectConfig()` - **Main silent failure point**
- `src/core/state/stateManager.ts:156-181` - `createEnvFile()` - **Secondary silent failure point**
- `src/core/state/stateManager.ts:82-97` - `saveState()` - **Tertiary silent failure point**

**Call chain:**
- `src/features/project-creation/handlers/createHandler.ts:26-198` - Entry point handler
- `src/features/project-creation/handlers/executor.ts:45-451` - Project execution
- `src/core/state/stateManager.ts:107-116` - `saveProject()` public method
- `src/core/state/stateManager.ts:425-461` - `getAllProjects()` - Quick picker discovery

### Existing Patterns Found

**Silent error handling pattern** (repeated 4 times in StateManager):

```typescript
try {
    await fs.writeFile(path, content);
} catch (error) {
    console.error('Failed to ...', error);  // ❌ Error logged but not re-thrown
    // Execution continues despite failure
}
```

**Discovery validation pattern**:
- Quick picker REQUIRES `.demo-builder.json` manifest to exist
- If manifest creation fails, project directory won't be discovered
- Returns empty array if any error occurs

---

## Critical Data Flow

### Expected Behavior

```
1. User completes wizard
2. executeProjectCreation() creates project structure
3. saveProject() called
   ├─ saveState() → writes ~/.demo-builder/state.json
   ├─ saveProjectConfig()
   │   ├─ mkdir() → creates ~/.demo-builder/projects/[name]/
   │   ├─ writeFile() → creates .demo-builder.json manifest
   │   └─ createEnvFile() → creates .env file
   └─ Event fires → UI updated
4. Quick picker can find project (has .demo-builder.json)
```

### Actual Behavior (when file operations fail)

```
1. User completes wizard
2. executeProjectCreation() creates project structure
3. saveProject() called
   ├─ saveState() → FAILS (permission denied) - logged to console only
   ├─ saveProjectConfig()
   │   ├─ mkdir() → FAILS (permission denied) - logged to console only
   │   ├─ writeFile() → FAILS (no directory) - logged to console only
   │   └─ createEnvFile() → FAILS (no directory) - logged to console only
   └─ Event fires → UI shows success! ❌
4. Quick picker finds nothing (no .demo-builder.json exists)
5. User sees "No existing projects found"
```

---

## Root Cause Details

### Point 1: saveProjectConfig() Silent Failures

**File**: `src/core/state/stateManager.ts:118-154`

**Three critical failures:**

#### 1. Directory Creation (lines 120-124)

```typescript
try {
    await fs.mkdir(project.path, { recursive: true });
} catch (error) {
    console.error('Failed to create project directory:', error);
    // ❌ NO RE-THROW - execution continues with non-existent directory
}
```

**Issue**: If `fs.mkdir()` fails with `EACCES` (permission denied), the error is logged but execution continues. All subsequent file operations will fail because the directory doesn't exist.

#### 2. Manifest Creation (lines 127-150)

```typescript
try {
    const manifestPath = path.join(project.path, '.demo-builder.json');
    const manifest = {
        version: '1.0.0',
        name: project.name,
        path: project.path,
        created: project.created,
        lastModified: new Date(),
        componentInstances: project.componentInstances,
        adobe: project.adobe,
        componentConfigs: project.componentConfigs,
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
} catch (error) {
    console.error('Failed to update project manifest:', error);
    // ❌ NO RE-THROW - quick picker won't find project without this file
}
```

**Issue**: If `fs.writeFile()` fails (directory doesn't exist, permissions, disk space), the `.demo-builder.json` manifest is not created. **Critical**: Quick picker REQUIRES this file to discover projects. Without it, the project is invisible.

#### 3. Env File Creation (line 153)

```typescript
await this.createEnvFile(project);
// Calls createEnvFile() which also swallows errors
```

**Issue**: This method call has no try-catch at this level, but `createEnvFile()` internally swallows all errors.

---

### Point 2: createEnvFile() Silent Failure

**File**: `src/core/state/stateManager.ts:156-181`

```typescript
private async createEnvFile(project: Project): Promise<void> {
    const envPath = path.join(project.path, '.env');

    // Build env content from componentConfigs
    let envContent = '# Demo Builder Project Environment Variables\n\n';

    if (project.componentConfigs) {
        for (const [componentId, config] of Object.entries(project.componentConfigs)) {
            envContent += `# ${componentId}\n`;
            for (const [key, value] of Object.entries(config)) {
                if (value !== null && value !== undefined) {
                    envContent += `${key}=${value}\n`;
                }
            }
            envContent += '\n';
        }
    }

    try {
        await fs.writeFile(envPath, envContent);
    } catch (error) {
        console.error('Failed to create .env file:', error);
        // ❌ NO RE-THROW - method returns void despite failure
    }
}
```

**Issue**: If `fs.writeFile()` fails, the error is logged but the method returns normally. The caller (`saveProjectConfig()`) has no way of knowing the operation failed.

---

### Point 3: State Save Silent Failure

**File**: `src/core/state/stateManager.ts:82-97`

```typescript
private async saveState(): Promise<void> {
    try {
        this.state.lastUpdated = new Date();
        const data = {
            version: this.state.version,
            currentProject: this.state.currentProject,
            processes: Object.fromEntries(this.state.processes),
            lastUpdated: this.state.lastUpdated,
        };
        await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Failed to save state:', error);
        // ❌ NO RE-THROW - state.json not created, projects lost on restart
    }
}
```

**Issue**: The global state file (`~/.demo-builder/state.json`) stores the current project reference. If this write fails, the extension loses track of all projects on restart.

---

## Why Errors Are Invisible

### Three Levels of Error Hiding

1. **Console.error() only** - Errors logged to dev console (user can't see without opening DevTools)
2. **No VS Code output channel** - Not using extension's logger that writes to output panel
3. **No UI notification** - No error message shown to user
4. **Execution continues** - `saveProject()` always returns successfully
5. **Success message shown** - Wizard shows "Project created successfully"

**Result**: User believes project was created successfully, but no files exist on disk.

### Error Visibility Comparison

| Error Type | Console.error() | Extension Logger | UI Notification | User Can See? |
|------------|-----------------|------------------|-----------------|---------------|
| Permission denied | ✅ Logged | ❌ No | ❌ No | ❌ No (unless DevTools open) |
| Disk full | ✅ Logged | ❌ No | ❌ No | ❌ No (unless DevTools open) |
| Path not found | ✅ Logged | ❌ No | ❌ No | ❌ No (unless DevTools open) |

**Current behavior**: All errors are invisible to users in normal usage.

---

## Common Pitfalls

### Pitfall 1: File Permission Issues

**Cause**: `~/.demo-builder` or subdirectories have restrictive permissions
**Error**: `EACCES: permission denied, mkdir '~/.demo-builder/projects'`
**Silent**: Yes - logged only to console
**User Impact**: Projects appear to save but don't
**Frequency**: Common on shared/managed systems

**Detection**:
```bash
# Check permissions
ls -la ~/.demo-builder
# Should show: drwxr-xr-x (755) or drwx------ (700)
```

---

### Pitfall 2: Disk Space Issues

**Cause**: No space left on device
**Error**: `ENOSPC: no space left on device, write`
**Silent**: Yes - logged only to console
**User Impact**: Partial files created, manifest missing, discovery fails
**Frequency**: Rare but catastrophic

**Detection**:
```bash
# Check disk space
df -h ~
```

---

### Pitfall 3: Path Resolution Issues

**Cause**: Home directory path issues on Windows, symlinks, network drives
**Error**: `ENOENT: no such file or directory`
**Silent**: Yes - logged only to console
**User Impact**: Base directory exists but projects subdirectory not created
**Frequency**: Common on Windows, network home directories

**Example scenarios**:
- Windows with OneDrive sync
- Network-mounted home directory
- Symlinked home directory

---

### Pitfall 4: Missing Manifest = Invisible Project

**Cause**: Manifest file creation fails (any reason above)
**Error**: No error at discovery time, just empty result
**Silent**: Yes - quick picker silently returns empty array
**User Impact**: Project exists on disk but is "invisible" to extension
**Frequency**: High when any file operation fails

**Critical detail**: Quick picker requires `.demo-builder.json` to exist:

```typescript
// src/core/state/stateManager.ts:438-449
try {
    await fs.access(manifestPath);  // Must succeed!
    const stats = await fs.stat(manifestPath);
    projects.push({...});
} catch {
    // Not a valid project, skip  ❌ SILENT SKIP
}
```

---

## Detailed Error Flow Analysis

### Scenario: Permission Denied on mkdir()

```
stateManager.ts:120-124
┌─ try:
│   await fs.mkdir('~/.demo-builder/projects/my-project', { recursive: true })
│   ❌ THROWS: Error [EACCES]: Permission denied
└─ catch(error):
    console.error('Failed to create project directory:', error)  ← Only here
    // NO RE-THROW!
    // Execution continues with project.path pointing to non-existent directory

stateManager.ts:127-150
┌─ try:
│   await fs.writeFile('~/.demo-builder/projects/my-project/.demo-builder.json', ...)
│   ❌ THROWS: Error [ENOENT]: no such file or directory
└─ catch(error):
    console.error('Failed to update project manifest:', error)  ← Only here
    // NO RE-THROW!

stateManager.ts:156-180
┌─ try:
│   await fs.writeFile('~/.demo-builder/projects/my-project/.env', ...)
│   ❌ THROWS: Error [ENOENT]: no such file or directory
└─ catch(error):
    console.error('Failed to create .env file:', error)  ← Only here

Result: saveProject() returns Promise<void> (success)
        Project state is saved to state.json with currentProject reference
        BUT: ~/.demo-builder/projects/my-project/ doesn't exist or is empty
        quick picker's getAllProjects() finds nothing (no .demo-builder.json)
        User sees "No existing projects found"
```

### Scenario: Disk Full During Write

```
stateManager.ts:120-124
┌─ try:
│   await fs.mkdir('~/.demo-builder/projects/my-project', { recursive: true })
│   ✅ SUCCESS (directory created)

stateManager.ts:127-150
┌─ try:
│   await fs.writeFile('~/.demo-builder/projects/my-project/.demo-builder.json', ...)
│   ❌ THROWS: Error [ENOSPC]: no space left on device
└─ catch(error):
    console.error('Failed to update project manifest:', error)  ← Only here
    // NO RE-THROW!

stateManager.ts:156-180
┌─ try:
│   await fs.writeFile('~/.demo-builder/projects/my-project/.env', ...)
│   ❌ THROWS: Error [ENOSPC]: no space left on device
└─ catch(error):
    console.error('Failed to create .env file:', error)  ← Only here

Result: saveProject() returns Promise<void> (success)
        Project directory EXISTS but is EMPTY (no manifest, no .env)
        quick picker's getAllProjects() finds nothing (no .demo-builder.json)
        User sees "No existing projects found"
        Even worse: Partial state persists, user might see zombie directory
```

---

## Key Takeaways

1. **Silent failures are dangerous** - All file operations should propagate errors to the UI
2. **Console.error() is invisible** - Use extension logger and show user notifications
3. **Critical file operations need validation** - Manifest file is required for discovery
4. **Async error handling matters** - Errors in async functions must be caught at handler level
5. **User expectations differ from reality** - Success message shown despite failures
6. **Partial state is worse than no state** - Zombie directories confuse debugging
7. **Error recovery is impossible** - User has no way to retry or fix the issue

---

## Recommended Fixes

### Fix 1: Re-throw Errors in saveProjectConfig()

**Priority**: CRITICAL
**File**: `src/core/state/stateManager.ts:118-154`
**Impact**: Errors will propagate to handler and user will see notification

```typescript
// BEFORE (Silent failure)
private async saveProjectConfig(project: Project): Promise<void> {
    try {
        await fs.mkdir(project.path, { recursive: true });
    } catch (error) {
        console.error('Failed to create project directory:', error);
        // ❌ ERROR LOST - execution continues
    }

    try {
        const manifestPath = path.join(project.path, '.demo-builder.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (error) {
        console.error('Failed to update project manifest:', error);
        // ❌ ERROR LOST - execution continues
    }
}

// AFTER (Proper error handling)
private async saveProjectConfig(project: Project): Promise<void> {
    try {
        await fs.mkdir(project.path, { recursive: true });
    } catch (error) {
        this.logger.error('Failed to create project directory:', error);
        throw error;  // ✅ Error propagates to caller
    }

    try {
        const manifestPath = path.join(project.path, '.demo-builder.json');
        const manifest = {
            version: '1.0.0',
            name: project.name,
            path: project.path,
            created: project.created,
            lastModified: new Date(),
            componentInstances: project.componentInstances,
            adobe: project.adobe,
            componentConfigs: project.componentConfigs,
        };
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (error) {
        this.logger.error('Failed to update project manifest:', error);
        throw error;  // ✅ Error propagates to caller
    }

    await this.createEnvFile(project);  // Already re-throws after fix
}
```

---

### Fix 2: Re-throw Errors in createEnvFile()

**Priority**: CRITICAL
**File**: `src/core/state/stateManager.ts:156-181`
**Impact**: .env creation failures will be visible

```typescript
// BEFORE (Silent failure)
private async createEnvFile(project: Project): Promise<void> {
    const envPath = path.join(project.path, '.env');

    let envContent = '# Demo Builder Project Environment Variables\n\n';
    // ... build env content ...

    try {
        await fs.writeFile(envPath, envContent);
    } catch (error) {
        console.error('Failed to create .env file:', error);
        // ❌ ERROR LOST
    }
}

// AFTER (Proper error handling)
private async createEnvFile(project: Project): Promise<void> {
    const envPath = path.join(project.path, '.env');

    let envContent = '# Demo Builder Project Environment Variables\n\n';

    if (project.componentConfigs) {
        for (const [componentId, config] of Object.entries(project.componentConfigs)) {
            envContent += `# ${componentId}\n`;
            for (const [key, value] of Object.entries(config)) {
                if (value !== null && value !== undefined) {
                    envContent += `${key}=${value}\n`;
                }
            }
            envContent += '\n';
        }
    }

    try {
        await fs.writeFile(envPath, envContent);
    } catch (error) {
        this.logger.error('Failed to create .env file:', error);
        throw error;  // ✅ Error propagates to caller
    }
}
```

---

### Fix 3: Re-throw Errors in saveState()

**Priority**: CRITICAL
**File**: `src/core/state/stateManager.ts:82-97`
**Impact**: State save failures will be visible, preventing data loss

```typescript
// BEFORE (Silent failure)
private async saveState(): Promise<void> {
    try {
        this.state.lastUpdated = new Date();
        const data = {
            version: this.state.version,
            currentProject: this.state.currentProject,
            processes: Object.fromEntries(this.state.processes),
            lastUpdated: this.state.lastUpdated,
        };
        await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Failed to save state:', error);
        // ❌ ERROR LOST
    }
}

// AFTER (Proper error handling)
private async saveState(): Promise<void> {
    try {
        this.state.lastUpdated = new Date();
        const data = {
            version: this.state.version,
            currentProject: this.state.currentProject,
            processes: Object.fromEntries(this.state.processes),
            lastUpdated: this.state.lastUpdated,
        };
        await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2));
    } catch (error) {
        this.logger.error('Failed to save state:', error);
        throw error;  // ✅ Error propagates to caller
    }
}
```

---

### Fix 4: Add User-Facing Error in Handler

**Priority**: HIGH
**File**: `src/features/project-creation/handlers/createHandler.ts` (around line 410)
**Impact**: User will see error notification when save fails

```typescript
// BEFORE (Errors hidden from user)
await context.stateManager.saveProject(project);
context.logger.info('[Project Creation] ✅ Project state saved successfully');

// AFTER (User sees error if save fails)
try {
    await context.stateManager.saveProject(project);
    context.logger.info('[Project Creation] ✅ Project state saved successfully');
} catch (saveError) {
    context.logger.error('[Project Creation] ❌ Failed to save project', saveError as Error);

    // Show error to user
    throw new Error(`Failed to save project to disk: ${(saveError as Error).message}`);
    // This will be caught by handler registry and shown as error notification
}
```

---

### Fix 5: Verify Directory Exists Before Discovery

**Priority**: MEDIUM
**File**: `src/core/state/stateManager.ts:425-461`
**Impact**: Better error messages when projects directory doesn't exist

```typescript
// BEFORE (Silent empty result)
public async getAllProjects(): Promise<{ name: string; path: string; lastModified: Date }[]> {
    const projectsDir = path.join(os.homedir(), '.demo-builder', 'projects');
    const projects: { name: string; path: string; lastModified: Date }[] = [];

    try {
        const entries = await fs.readdir(projectsDir, { withFileTypes: true });
        // ... existing logic ...
    } catch {
        // Projects directory might not exist yet
        console.log('No projects directory found or error reading it');
    }

    return projects;
}

// AFTER (Better error handling and logging)
public async getAllProjects(): Promise<{ name: string; path: string; lastModified: Date }[]> {
    const projectsDir = path.join(os.homedir(), '.demo-builder', 'projects');
    const projects: { name: string; path: string; lastModified: Date }[] = [];

    try {
        const entries = await fs.readdir(projectsDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const projectPath = path.join(projectsDir, entry.name);
                const manifestPath = path.join(projectPath, '.demo-builder.json');

                try {
                    await fs.access(manifestPath);
                    const stats = await fs.stat(manifestPath);
                    projects.push({
                        name: entry.name,
                        path: projectPath,
                        lastModified: stats.mtime,
                    });
                } catch {
                    // Not a valid project, skip
                    this.logger.debug(`Skipping directory without manifest: ${entry.name}`);
                }
            }
        }

        projects.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    } catch (error) {
        // Distinguish between "doesn't exist yet" and "permission denied"
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            this.logger.debug('Projects directory does not exist yet');
        } else {
            this.logger.error('Failed to read projects directory:', error);
        }
    }

    return projects;
}
```

---

### Fix 6: Add Diagnostic Command to Check Project State

**Priority**: LOW (helpful for debugging)
**New File**: `src/commands/diagnostics/checkProjectFiles.ts`
**Impact**: User can verify project files exist

```typescript
export async function checkProjectFilesCommand() {
    const projectsDir = path.join(os.homedir(), '.demo-builder', 'projects');

    try {
        const entries = await fs.readdir(projectsDir, { withFileTypes: true });
        const diagnostics: string[] = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const projectPath = path.join(projectsDir, entry.name);
                const manifestPath = path.join(projectPath, '.demo-builder.json');
                const envPath = path.join(projectPath, '.env');

                const hasManifest = await fs.access(manifestPath).then(() => true).catch(() => false);
                const hasEnv = await fs.access(envPath).then(() => true).catch(() => false);

                diagnostics.push(`Project: ${entry.name}`);
                diagnostics.push(`  Manifest: ${hasManifest ? '✅' : '❌ MISSING'}`);
                diagnostics.push(`  .env: ${hasEnv ? '✅' : '❌ MISSING'}`);
                diagnostics.push('');
            }
        }

        vscode.window.showInformationMessage(
            diagnostics.join('\n'),
            { modal: true }
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to check project files: ${error}`);
    }
}
```

---

## Testing Strategy

### Manual Testing

1. **Test permission denied scenario**:
   ```bash
   # Make projects directory read-only
   chmod 444 ~/.demo-builder/projects

   # Try to create project through wizard
   # Expected: Error message shown to user
   # Actual (before fix): Success message, no files created

   # Restore permissions
   chmod 755 ~/.demo-builder/projects
   ```

2. **Test disk full scenario** (hard to simulate):
   ```bash
   # Create small disk image
   hdiutil create -size 1m -fs HFS+ -volname TestDisk /tmp/testdisk.dmg
   hdiutil attach /tmp/testdisk.dmg

   # Fill disk
   dd if=/dev/zero of=/Volumes/TestDisk/fill bs=1m

   # Change demo builder to use this location
   # Expected: Error message about disk space
   ```

3. **Test with existing projects**:
   ```bash
   # Create project normally
   # Verify files exist:
   ls -la ~/.demo-builder/projects/[name]/
   # Should see: .demo-builder.json, .env, components/, etc.

   # Verify quick picker finds it
   ```

### Automated Testing

**Add test case to StateManager tests**:

```typescript
describe('StateManager - Error Handling', () => {
    it('should throw error when project directory creation fails', async () => {
        // Mock fs.mkdir to throw permission error
        jest.spyOn(fs, 'mkdir').mockRejectedValue(
            new Error('EACCES: permission denied')
        );

        const project = createMockProject();

        // Should throw, not swallow error
        await expect(
            stateManager.saveProject(project)
        ).rejects.toThrow('permission denied');
    });

    it('should throw error when manifest write fails', async () => {
        jest.spyOn(fs, 'writeFile').mockRejectedValue(
            new Error('ENOSPC: no space left on device')
        );

        const project = createMockProject();

        await expect(
            stateManager.saveProject(project)
        ).rejects.toThrow('no space left on device');
    });
});
```

---

## Implementation Priority

### Phase 1: Critical Fixes (Must Have)
1. ✅ Fix 1: Re-throw errors in saveProjectConfig()
2. ✅ Fix 2: Re-throw errors in createEnvFile()
3. ✅ Fix 3: Re-throw errors in saveState()
4. ✅ Fix 4: Add user-facing error in handler

**Impact**: Users will see error messages when save fails instead of silent failure

**Estimated Time**: 1-2 hours (simple changes, extensive testing)

### Phase 2: Quality Improvements (Should Have)
5. ✅ Fix 5: Better error handling in getAllProjects()
6. ✅ Add automated tests for error scenarios
7. ✅ Add logging to extension output channel

**Impact**: Better debugging and error visibility

**Estimated Time**: 2-3 hours

### Phase 3: User Experience (Nice to Have)
8. ✅ Fix 6: Add diagnostic command
9. ✅ Add "Retry" option when save fails
10. ✅ Add file permission check before attempting save

**Impact**: Better user experience when errors occur

**Estimated Time**: 3-4 hours

---

## Conclusion

This is a **critical bug** caused by systematic misuse of error handling patterns. The silent failures make debugging extremely difficult and create a poor user experience.

**Root Cause**: Try-catch blocks that log errors but don't re-throw them
**Impact**: Projects appear to save successfully but no files are written
**User Experience**: Confusing and frustrating (success message → "No existing projects found")
**Fix Complexity**: Low (simple code changes)
**Testing Complexity**: Medium (need to simulate various failure scenarios)

**Recommendation**: Implement Phase 1 fixes immediately. This is a blocking issue that prevents users from creating projects successfully.
