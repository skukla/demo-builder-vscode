# Updates Feature

## Purpose

The Updates feature manages extension and component updates via GitHub Releases. It provides automatic update checking, manual update triggers, snapshot-based rollback for component updates, smart .env merging, and dual update channels (stable/beta). This feature ensures users have the latest version of the extension and components while protecting against failed updates through automatic rollback.

## Responsibilities

- **Update Checking**: Check GitHub Releases for new versions (extension and components)
- **Semantic Versioning**: Compare versions using semver (supports prereleases)
- **Dual Channels**: Support stable (production) and beta (prerelease) update channels
- **Extension Updates**: Download and install VSIX from GitHub Releases
- **Component Updates**: Download, extract, and install component updates from GitHub
- **Snapshot & Rollback**: Create pre-update snapshots, automatically rollback on failure
- **Smart .env Merging**: Preserve user config while adding new variables from updates
- **Programmatic Write Suppression**: Prevent false change notifications during updates
- **Post-Update Verification**: Verify component structure after extraction
- **Concurrent Update Protection**: Prevent double-click accidents with update locks
- **User-Friendly Errors**: Parse errors into actionable messages (network, timeout, offline, etc.)

## Key Services

### UpdateManager

**Purpose**: Check for updates and manage update channels

**Key Methods**:
- `checkExtensionUpdate()` - Check for extension updates (respects channel)
- `checkComponentUpdates(project)` - Check for component updates in current project (respects channel)
- `fetchLatestRelease(repo, channel)` - Fetch latest release from GitHub for given channel
- `getUpdateChannel()` - Get configured update channel (stable/beta)
- `isNewerVersion(latest, current)` - Compare versions using semver

**Example Usage**:
```typescript
import { UpdateManager } from '@/features/updates';

const updateManager = new UpdateManager(context, logger);

// Check extension updates
const extensionUpdate = await updateManager.checkExtensionUpdate();

if (extensionUpdate.hasUpdate) {
    console.log(`Extension update available: ${extensionUpdate.current} → ${extensionUpdate.latest}`);
    console.log(`Release notes: ${extensionUpdate.releaseInfo?.releaseNotes}`);
}

// Check component updates
const project = await stateManager.getCurrentProject();
const componentUpdates = await updateManager.checkComponentUpdates(project);

for (const [componentId, update] of componentUpdates.entries()) {
    if (update.hasUpdate) {
        console.log(`${componentId}: ${update.current} → ${update.latest}`);
    }
}
```

### ComponentUpdater

**Purpose**: Update components with automatic snapshot and rollback

**Key Methods**:
- `updateComponent(project, componentId, downloadUrl, newVersion)` - Update component with safety guarantees

**Safety Guarantees**:
1. **Snapshot Creation**: Always creates full directory backup before update
2. **Concurrent Update Lock**: Prevents double updates to same component
3. **Structure Verification**: Verifies critical files exist after extraction
4. **Automatic Rollback**: Restores snapshot on ANY failure
5. **Programmatic Write Suppression**: Prevents false change notifications
6. **Version Tracking**: Only updates version after successful verification

**Example Usage**:
```typescript
import { ComponentUpdater } from '@/features/updates';

const updater = new ComponentUpdater(logger);

try {
    await updater.updateComponent(
        project,
        'citisignal-nextjs',
        'https://github.com/skukla/citisignal-nextjs/archive/refs/tags/v1.2.0.zip',
        '1.2.0'
    );

    console.log('Component updated successfully');
    await stateManager.saveProject(project);
} catch (error) {
    // Component automatically rolled back to previous state
    console.error('Update failed and was rolled back:', error.message);
}
```

### ExtensionUpdater

**Purpose**: Update extension VSIX from GitHub Releases

**Key Methods**:
- `downloadAndInstall(downloadUrl)` - Download VSIX and trigger VS Code installation

**Example Usage**:
```typescript
import { ExtensionUpdater } from '@/features/updates';

const updater = new ExtensionUpdater(logger);

await updater.downloadAndInstall(
    'https://github.com/skukla/demo-builder-vscode/releases/download/v1.2.0/demo-builder-1.2.0.vsix'
);

// VS Code prompts user to reload after installation
```

## Types

See `services/types.ts` for type definitions:

- `UpdateCheckResult` - Update check result (hasUpdate, current, latest, releaseInfo)
- `ReleaseInfo` - GitHub Release metadata (version, downloadUrl, releaseNotes, publishedAt, isPrerelease)

## Architecture

**Directory Structure**:
```
features/updates/
├── index.ts                    # Public API exports
├── services/
│   ├── updateManager.ts       # GitHub Releases integration
│   ├── componentUpdater.ts    # Component updates with rollback
│   ├── extensionUpdater.ts    # Extension VSIX updates
│   └── types.ts               # Type definitions
├── commands/
│   └── checkUpdates.ts        # Manual update check command
└── README.md                  # This file
```

**Update Flow**:
```
Check Updates Command
    ↓
UpdateManager.checkExtensionUpdate()
UpdateManager.checkComponentUpdates(project)
    ↓
Display available updates to user
    ↓
User clicks "Update"
    ↓
ComponentUpdater.updateComponent() OR ExtensionUpdater.downloadAndInstall()
    ↓
Component Update Flow:
1. Create snapshot
2. Backup .env files
3. Remove old component
4. Download and extract new version
5. Verify structure
6. Merge .env files
7. Update version tracking
8. Remove snapshot
    ↓
On failure: Automatic rollback to snapshot
```

**Channel Logic**:
```
User Setting: demoBuilder.updateChannel = "stable" | "beta"
    ↓
UpdateManager.fetchLatestRelease(repo, channel)
    ↓
Stable: /releases/latest (non-prereleases only)
Beta: /releases?per_page=20 (includes prereleases, semver sort)
    ↓
Return latest version for channel
```

## Integration Points

### Dependencies
- `@/shared/logging` - Logger for update operations
- `@/types/typeGuards` - parseJSON for safe JSON parsing
- `@/utils/timeoutConfig` - TIMEOUTS.UPDATE_CHECK, TIMEOUTS.UPDATE_DOWNLOAD, TIMEOUTS.UPDATE_EXTRACT
- `vscode` - ExtensionContext, workspace configuration, commands
- `semver` - Version comparison (supports prereleases)
- `fetch` - GitHub API calls and download

### Used By
- `src/commands/checkUpdates.ts` - Manual update check command
- `src/extension.ts` - Background update checking (optional)

## Usage Examples

### Example 1: Check for Updates
```typescript
import { UpdateManager } from '@/features/updates';

const updateManager = new UpdateManager(context, logger);

// Check extension
const extensionUpdate = await updateManager.checkExtensionUpdate();

if (extensionUpdate.hasUpdate) {
    const install = await vscode.window.showInformationMessage(
        `Extension update available: ${extensionUpdate.latest}`,
        'View Release Notes',
        'Update',
        'Cancel'
    );

    if (install === 'Update') {
        // Trigger extension update
        const updater = new ExtensionUpdater(logger);
        await updater.downloadAndInstall(extensionUpdate.releaseInfo!.downloadUrl);
    }
}

// Check components
const project = await stateManager.getCurrentProject();
const componentUpdates = await updateManager.checkComponentUpdates(project);

for (const [componentId, update] of componentUpdates.entries()) {
    if (update.hasUpdate) {
        const install = await vscode.window.showInformationMessage(
            `${componentId} update available: ${update.latest}`,
            'Update',
            'Cancel'
        );

        if (install === 'Update') {
            // Trigger component update
            const updater = new ComponentUpdater(logger);
            await updater.updateComponent(
                project,
                componentId,
                update.releaseInfo!.downloadUrl,
                update.latest
            );
        }
    }
}
```

### Example 2: Update Component with Error Handling
```typescript
import { ComponentUpdater } from '@/features/updates';

const updater = new ComponentUpdater(logger);

try {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Updating ${componentId}...`,
            cancellable: false
        },
        async (progress) => {
            await updater.updateComponent(
                project,
                componentId,
                downloadUrl,
                newVersion
            );
        }
    );

    vscode.window.showInformationMessage(
        `${componentId} updated to ${newVersion}`
    );

    // Save project with new version
    await stateManager.saveProject(project);
} catch (error) {
    // Component automatically rolled back
    vscode.window.showErrorMessage(
        `Failed to update ${componentId}: ${error.message}`
    );
}
```

### Example 3: Smart .env Merging
```typescript
// Handled internally by ComponentUpdater.mergeEnvFiles()

// Before update:
// .env:
//   API_ENDPOINT=https://my-custom-endpoint.com
//   API_KEY=my-secret-key

// .env.example (from new version):
//   API_ENDPOINT=https://default-endpoint.com
//   API_KEY=
//   NEW_FEATURE_FLAG=true

// After merge:
// .env:
//   API_ENDPOINT=https://my-custom-endpoint.com  (preserved)
//   API_KEY=my-secret-key                        (preserved)
//   NEW_FEATURE_FLAG=true                        (added)
```

### Example 4: Update Channel Configuration
```typescript
// User changes update channel in settings
await vscode.workspace.getConfiguration('demoBuilder')
    .update('updateChannel', 'beta', vscode.ConfigurationTarget.Global);

// Next update check will use beta channel
const updateManager = new UpdateManager(context, logger);
const update = await updateManager.checkExtensionUpdate();

// For beta channel, includes prereleases (e.g., 1.2.0-beta.1)
```

### Example 5: Background Update Checking
```typescript
// In extension.ts activation
const updateManager = new UpdateManager(context, logger);

// Check for updates every 24 hours
const checkInterval = 24 * 60 * 60 * 1000;
setInterval(async () => {
    const extensionUpdate = await updateManager.checkExtensionUpdate();

    if (extensionUpdate.hasUpdate) {
        vscode.window.showInformationMessage(
            `Extension update available: ${extensionUpdate.latest}`,
            'Update Now',
            'Later'
        );
    }

    const project = await stateManager.getCurrentProject();
    if (project) {
        const componentUpdates = await updateManager.checkComponentUpdates(project);

        const updateCount = Array.from(componentUpdates.values())
            .filter(u => u.hasUpdate).length;

        if (updateCount > 0) {
            vscode.window.showInformationMessage(
                `${updateCount} component update(s) available`,
                'Check Updates'
            );
        }
    }
}, checkInterval);
```

## Configuration

### Extension Settings
```json
{
    "demoBuilder.updateChannel": {
        "type": "string",
        "enum": ["stable", "beta"],
        "default": "stable",
        "description": "Update channel: stable (production releases) or beta (includes prereleases)"
    }
}
```

### Repository Configuration
```typescript
// In UpdateManager
private readonly EXTENSION_REPO = 'skukla/demo-builder-vscode';
private readonly COMPONENT_REPOS: Record<string, string> = {
    'citisignal-nextjs': 'skukla/citisignal-nextjs',
    'commerce-mesh': 'skukla/commerce-mesh',
    'integration-service': 'skukla/kukla-integration-service'
};
```

### Version Tracking
```typescript
// In project state
project.componentVersions = {
    'citisignal-nextjs': {
        version: '1.2.0',
        lastUpdated: '2025-01-15T10:30:00.000Z'
    },
    'commerce-mesh': {
        version: '1.1.0',
        lastUpdated: '2025-01-10T14:20:00.000Z'
    }
};
```

## Error Handling

### Network Errors
```typescript
// ComponentUpdater.formatUpdateError() detects common errors

// Network/offline errors
if (error.message.includes('fetch') || error.message.includes('ENOTFOUND')) {
    throw new Error('Update failed: No internet connection. Check your network and try again.');
}

// Timeout errors
if (error.message.includes('timeout')) {
    throw new Error('Update failed: Download timed out. Try again with a better connection.');
}
```

### HTTP Errors
```typescript
// 404: Release not found
if (error.message.includes('HTTP 404')) {
    throw new Error('Update failed: Release not found on GitHub. The version may have been removed.');
}

// 403: Rate limit
if (error.message.includes('HTTP 403')) {
    throw new Error('Update failed: Access denied. GitHub rate limit may be exceeded.');
}
```

### Verification Errors
```typescript
// Component structure verification failed
if (error.message.includes('verification failed')) {
    // Automatic rollback triggered
    throw new Error('Update failed: Downloaded component is incomplete or corrupted. Please try again.');
}
```

### Rollback Errors
```typescript
// If rollback itself fails (critical situation)
try {
    await fs.rename(snapshotPath, component.path);
} catch (rollbackError) {
    throw new Error(
        `Update failed AND rollback failed. Manual recovery required. Snapshot at: ${snapshotPath}`
    );
}
```

## Performance Considerations

### Update Checking
- **Timeout**: 10 seconds for GitHub API calls
- **Concurrent checks**: Check extension and all components in parallel
- **Caching**: No caching - always fetch latest to ensure accuracy

### Component Updates
- **Download timeout**: 5 minutes (large components)
- **Extract timeout**: 2 minutes
- **Verification**: Fast (just file existence checks)

### Best Practices
1. **Check before prompting**: Only show update notification if update actually available
2. **Progress feedback**: Show progress during download/extract
3. **Non-blocking**: Use background checking, don't block extension activation
4. **Graceful failures**: Handle network errors, timeouts, and offline scenarios
5. **Rollback safety**: Always create snapshot before modifying component

## Security Considerations

### Download Validation
- All downloads from GitHub Releases (trusted source)
- HTTPS only
- No arbitrary URL downloads

### Component Verification
- Verify critical files exist after extraction (package.json, mesh.json, etc.)
- Verify package.json is valid JSON
- Fail fast if structure invalid

### Programmatic Write Suppression
- Register writes with file watcher BEFORE writing
- Prevents false change notifications
- Prevents restart/redeploy prompts during updates

## Testing

### Manual Testing Checklist
- [ ] Extension update check works
- [ ] Component update check works
- [ ] Stable channel shows only stable releases
- [ ] Beta channel shows prereleases
- [ ] Semver comparison works (including prereleases)
- [ ] Extension VSIX download and install works
- [ ] Component download and extract works
- [ ] Snapshot creation works
- [ ] Component structure verification works
- [ ] .env merging preserves user config
- [ ] .env merging adds new variables
- [ ] Automatic rollback works on failures
- [ ] Concurrent update lock prevents double updates
- [ ] Programmatic write suppression works
- [ ] User-friendly error messages show for network/timeout/offline
- [ ] Version tracking updates correctly

### Integration Testing
- Test update flow end-to-end
- Test with various error scenarios (network, timeout, invalid component)
- Test rollback on verification failure
- Test .env merging with various scenarios
- Test channel switching
- Test concurrent update prevention

## See Also

- **[Components Feature](../components/README.md)** - Component registry and definitions
- **[State Management](../shared/state/CLAUDE.md)** - Version tracking persistence
- **[Timeout Configuration](../../utils/timeoutConfig.ts)** - Update timeouts
- **[GitHub Releases](https://github.com/skukla/demo-builder-vscode/releases)** - Extension releases
- **[Semantic Versioning](https://semver.org/)** - Version comparison rules

---

For overall architecture, see `../../CLAUDE.md`
For shared infrastructure, see `../shared/CLAUDE.md`
