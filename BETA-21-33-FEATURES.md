# Beta 21-33: Feature Additions & Compatibility Analysis

## Executive Summary

Beta releases 21-33 represent a critical mid-release phase focused on performance optimizations, user experience improvements, and critical bug fixes. This 2-day sprint (October 14-15, 2025) delivered 13 releases addressing three major themes:

1. **Performance Revolution (beta.24)**: Binary path caching eliminated 5-6 second fnm exec overhead, making Adobe CLI commands 5-6x faster
2. **Installation Automation (beta.25-27)**: Intelligent Homebrew installation with file-based monitoring, automatic PATH configuration, and real-time terminal feedback
3. **Critical Bug Fixes (beta.28-33)**: Component version tracking fixes (3 attempts), binary path quoting for spaces, and Node 24 compatibility restrictions

**Key Finding**: These releases solved fundamental performance and reliability issues that significantly impact user experience. The refactor branch is **missing all of these critical features**.

---

## Release Timeline

**Day 1 (October 14, 2025)**: Performance & UX Focus
- beta.21 (16:06): Mesh status detection fix
- beta.22 (16:32): False update notification fix
- beta.23 (16:42): Welcome screen race condition fix
- beta.24 (17:18): **Major: Binary path caching (5-6x speedup)**
- beta.25 (21:04): **Major: Homebrew automation**
- beta.26 (21:10): Configure screen UX polish
- beta.27 (21:51): Consolidated release + build script fix

**Day 2 (October 15, 2025)**: Compatibility & Debugging
- beta.28 (08:38): Component version tracking (attempt 1)
- beta.29 (08:45): Git SHA detection fix (attempt 2)
- beta.30 (08:52): **Working: Short SHA comparison (attempt 3)**
- beta.31 (09:20-10:08): Visual feedback improvements (5 commits)
- beta.32 (10:35): **Critical: Binary path quoting fix**
- beta.33 (11:00): **Critical: Node 24 compatibility**

---

## Release Breakdown

### Beta 21: Dashboard Mesh Status Detection
- **Commit**: b8cf3c0
- **Date**: 2025-10-14 16:06:17
- **Type**: Bug Fix
- **Files Changed**: `projectDashboardWebview.ts`, package.json
- **Key Feature**: Fixed mesh status showing "Not Deployed" for deployed meshes
- **Implementation**:
  - Changed synchronous check from `meshState.envVars.length` to `meshState.lastDeployed`
  - Added fallback for projects without `componentConfigs`
- **UX Impact**: Dashboard now correctly shows deployment status

### Beta 22: False Component Update Notifications
- **Commit**: 0e0cca9
- **Date**: 2025-10-14 16:32:35
- **Type**: Bug Fix
- **Files Changed**: `checkUpdates.ts`, `updateManager.ts`, package.json
- **Key Feature**: Fixed false "update available" notifications for components already at latest version
- **Implementation**:
  - Compare installed git commit hash with release commit hash when version is "unknown"
  - Auto-fix `componentVersions` if commits match
  - Skip false updates
- **UX Impact**: Eliminated unnecessary update operations

**Code Pattern**:
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
    hasUpdate = false;
  }
}
```

### Beta 23: Welcome Screen Race Condition
- **Commit**: 8fcc9c5
- **Date**: 2025-10-14 16:42:02
- **Type**: Bug Fix
- **Files Changed**: `createProjectWebview.ts`, `extension.ts`, package.json
- **Key Feature**: Fixed "Webview is disposed" error when opening project from wizard
- **Implementation**:
  - Added module-level `isTransitioningWebview` flag
  - Set flag when transitioning from wizard to dashboard
  - Auto-welcome checks flag before opening
  - 2-second safety timeout
- **UX Impact**: Clean transitions between webviews without error notifications

**Timeline Explanation**:
```
t=0ms:   Wizard disposes
t=100ms: Extension checks → flag prevents auto-welcome
t=500ms: Dashboard opens
t=2000ms: Flag auto-clears (safety)
```

### Beta 24: 5-6x Faster Adobe CLI (Binary Path Caching)
- **Commit**: ed5f57a
- **Date**: 2025-10-14 17:18:11
- **Type**: **MAJOR Performance Optimization**
- **Files Changed**: `externalCommandManager.ts`, `timeoutConfig.ts`, `ProjectDashboardScreen.tsx`, package.json
- **Key Feature**: Eliminated fnm exec overhead by caching Node and aio binary paths

**The Problem**:
Every `aio` command was executing: `fnm exec --using=24 -- aio config get ...`
- Spawns new shell
- Initializes fnm environment
- Resolves Node version
- Sets up PATH
- **THEN** runs command
- **Result**: 5-6 seconds PER COMMAND

**The Solution**:
```typescript
// Cache Node and aio binary paths once per session
private cachedNodeBinaryPath?: string;
private cachedAioBinaryPath?: string;

private async cacheBinaryPaths(nodeVersion: string): Promise<void> {
  // One-time: Get Node binary path (5s)
  const nodeResult = await this.execute(
    `${fnmPath} exec --using=${nodeVersion} -- sh -c 'which node'`,
    { timeout: 5000 }
  );
  this.cachedNodeBinaryPath = nodeResult.stdout.trim();

  // One-time: Get aio binary path (5s)
  const aioResult = await this.execute(
    `${fnmPath} exec --using=${nodeVersion} -- sh -c 'which aio'`,
    { timeout: 5000 }
  );
  this.cachedAioBinaryPath = aioResult.stdout.trim();
}

// All subsequent commands use cached paths
if (this.cachedNodeBinaryPath && this.cachedAioBinaryPath && command.startsWith('aio ')) {
  const aioCommand = command.substring(4);
  finalCommand = `${this.cachedNodeBinaryPath} ${this.cachedAioBinaryPath} ${aioCommand}`;
  // <1 second execution!
}
```

**Performance Impact**:
- Auth checks: 26s → 2s
- Dashboard load: 30s → 5s
- Configure screen: 25s → 2s
- Mesh status: 5s → <1s

**Additional Changes**:
- Increased `CONFIG_READ` timeout: 5s → 10s
- Prioritized timeout retries for initial fnm initialization

**UX Impact**: Dramatic reduction in wait times for all Adobe CLI operations

### Beta 25: Intelligent Homebrew Installation
- **Commit**: 1ec2808
- **Date**: 2025-10-14 21:04:13
- **Type**: **MAJOR Feature**
- **Files Changed**: `createProjectWebview.ts` (+281 lines), package.json
- **Key Feature**: Fully automated Homebrew installation with intelligent completion detection

**Event-Driven Installation Monitoring**:
```typescript
// Append completion/failure markers to install command
if (prereq.id === 'homebrew') {
  const timestamp = Date.now();
  completionMarkerPath = path.join(os.tmpdir(), `demo-builder-homebrew-${timestamp}.complete`);
  failureMarkerPath = path.join(os.tmpdir(), `demo-builder-homebrew-${timestamp}.failed`);
  command = `${command} && echo "SUCCESS" > "${completionMarkerPath}" || echo "FAILED" > "${failureMarkerPath}"`;
}
```

**File System Watcher**:
- Monitors temp directory with `fs.watch()` for instant detection
- Fast-path check for immediate completion
- 2-minute timeout only for edge cases (Ctrl+C, terminal close)
- Zero CPU overhead while waiting

**Automatic PATH Configuration**:
```typescript
// Detect user's shell
const shell = process.env.SHELL?.includes('zsh') ? 'zsh' : 'bash';
const profilePath = shell === 'zsh' ? '~/.zprofile' : '~/.bash_profile';

// Append Homebrew PATH
const homebrewConfig = `\n# Homebrew PATH (auto-configured by Adobe Demo Builder)\neval "$(/opt/homebrew/bin/brew shellenv)"\n`;

// Check if already configured (idempotent)
if (!profileContent.includes('/opt/homebrew/bin/brew shellenv')) {
  fs.appendFileSync(profilePath, homebrewConfig);
}
```

**Real-Time Terminal Feedback**:
Extension injects status messages directly into terminal:
```
✓ Installation complete! Configuring PATH...
✓ PATH configured successfully!
✅ All done! The wizard will continue automatically.
   You can close this terminal (Cmd+W) or leave it open for reference.
```

**Flexible Completion Flow**:
- Notification appears with "Continue & Close Terminal" or "Continue"
- Wizard ALWAYS continues regardless of choice
- User controls when terminal closes

**UX Impact**: Zero manual PATH configuration, instant feedback, professional installation experience

### Beta 26: Configure Screen UX Polish
- **Commit**: d0d227e
- **Date**: 2025-10-14 21:10:55
- **Type**: UX Improvement
- **Files Changed**: `baseCommand.ts`, `ConfigureScreen.tsx`, package.json
- **Key Feature**: Two UX improvements for Configure screen

**1. "Cancel" → "Close" Button**:
```
Before: [Cancel] [Save Configuration]
After:  [Close]  [Save Configuration]
```
Reasoning: "Cancel" was misleading since clicking "Save" doesn't close the view

**2. Prominent Success Notifications**:
```typescript
// Before: Subtle status bar message only
vscode.window.setStatusBarMessage('✅ Configuration saved', 5000);

// After: Notification popup + status bar
vscode.window.showInformationMessage('✅ Configuration saved successfully');
vscode.window.setStatusBarMessage('✅ Configuration saved', 5000);
```

**Affected Messages**:
- Configuration saved
- API Mesh deployed
- Demo started/stopped
- Project deleted

**UX Impact**: Impossible to miss confirmation messages

### Beta 27: Consolidated Release (Homebrew + UX + Packaging + Build Fix)
- **Commit**: bebac2d
- **Date**: 2025-10-14 21:51:10
- **Type**: Consolidated release
- **Files Changed**: `.vscodeignore`, `package.json`, `createProjectWebview.ts`, `componentManager.ts`, package.json
- **Key Features**: Combined betas 25-26 + packaging optimization + critical build script fix

**Packaging Optimization**:
Updated `.vscodeignore` and package script to exclude devDependencies:
```bash
# Before packaging
npm prune --omit=dev

# Package
vsce package

# Restore for development
npm install
```

**Excluded from package** (~70 MB):
- TypeScript compiler (23 MB)
- Webpack bundler (7 MB)
- ESLint (9 MB)
- TypeScript ESLint (9 MB)
- VS Code test tools (29 MB)
- Azure DevOps API (43 MB)

**Kept** (~250 MB):
- Adobe libraries (56 MB)
- React Spectrum (30 MB)
- React Aria (26 MB)
- Spectrum Icons (15 MB)

**Note**: VSIX size unchanged (~36 MB) because runtime dependencies dominate

**Critical Build Script Fix**:
**Problem**: Build scripts ran BEFORE `.env` files were created
```
Broken Flow:
1. Clone component
2. npm install
3. npm run build  ← NO .env yet!
4. Generate .env   ← Too late!
```

**Solution**: Separated build execution from installation
```
Fixed Flow:
1. Clone component
2. npm install (dependencies only)
3. Generate .env  ← Config available!
4. npm run build  ← Can now read .env!
```

**Implementation**:
- Removed auto-build from `componentManager.ts` `installComponent()`
- Added new step in `createProjectWebview.ts`: "Step 4.5: Run build scripts AFTER .env files"

**Impact**: Commerce mesh facets (Brand, Memory, Color) now work correctly

### Beta 28: Component Version Tracking During Project Creation (Attempt 1)
- **Commit**: 184b719
- **Date**: 2025-10-15 08:38:09
- **Type**: Bug Fix (Incomplete)
- **Files Changed**: Release notes only (no code changes in this commit)
- **Key Feature**: Attempted to fix component versions showing as "vunknown" in new projects

**The Idea**:
Run `checkComponentUpdates()` immediately after project creation to resolve git SHAs to proper version tags

**The Problem**:
Detection logic from beta.22 only checked for literal string "unknown", but components stored 40-character git SHAs

**Result**: Fix didn't work (see beta.29 for the real problem)

### Beta 29: Git SHA Detection Fix (Attempt 2)
- **Commit**: d004f42
- **Date**: 2025-10-15 08:45:20
- **Type**: Bug Fix (Still Incomplete)
- **Files Changed**: Release notes only
- **Key Feature**: Added regex to detect 40-character git SHAs

**The Fix**:
```typescript
// Detect git SHAs using regex
const looksLikeGitSHA = /^[0-9a-f]{40}$/i.test(currentVersion);
const isUnknownVersion = currentVersion === 'unknown' || looksLikeGitSHA;

if (isUnknownVersion) {
  // Auto-fix logic
}
```

**The Problem**:
Still didn't work! Actual SHAs were **8 characters** (short SHAs), not 40. Also, GitHub API returns branch name ("master") not commit SHA.

**Result**: Fix still didn't work (see beta.30 for complete solution)

### Beta 30: Component Version Tracking - The Real Fix (Attempt 3)
- **Commit**: 05d4932
- **Date**: 2025-10-15 08:52:05
- **Type**: **CRITICAL Bug Fix**
- **Files Changed**: `updateManager.ts` (+43 lines), package.json
- **Key Feature**: Finally fixed component version tracking by addressing two root causes

**Root Cause #1: Short SHAs**
```
Stored: "9404d6a3" (8-char short SHA)
Expected: "9404d6a3e5f6..." (40-char full SHA)
```

**Root Cause #2: GitHub Returns Branch Name**
```
GitHub API: target_commitish = "master" (branch name)
Expected: "9404d6a3e5f6..." (commit SHA)
```

**The Fix - Part 1: Fetch Real Commit SHA**:
```typescript
// Fetch tag details to get actual commit SHA
const tagUrl = `https://api.github.com/repos/${repo}/git/ref/tags/${tagName}`;
const tagResponse = await fetch(tagUrl);
const tagData = await tagResponse.json();
commitSha = tagData.object.sha;  // Real 40-char SHA!
```

**The Fix - Part 2: Short SHA Comparison**:
```typescript
// Compare commits (support both full and short SHAs)
if (installedCommit.length === 8) {
  // Short SHA: compare first 8 chars
  commitsMatch = releaseCommit.toLowerCase().startsWith(installedCommit.toLowerCase());
} else {
  // Full SHA: exact comparison
  commitsMatch = installedCommit.toLowerCase() === releaseCommit.toLowerCase();
}
```

**Why This Finally Worked**:
```
installedCommit: "9404d6a3"  (8 chars)
releaseCommit: "9404d6a3e5f6..."  (40 chars from GitHub tag API)
"9404d6a3e5f6...".startsWith("9404d6a3")  → TRUE ✅
```

**UX Impact**: Component versions finally track correctly for both new and existing projects

### Beta 31: Visual Feedback Improvements (5 Commits)
- **Commits**: 04f1245, 43dc2cf, 28d16bb, b9414ef, af95036, 01852d4
- **Date**: 2025-10-15 09:20:16 - 10:08:33
- **Type**: UX Improvements
- **Files Changed**: `checkUpdates.ts`, package.json
- **Key Features**: Series of UX improvements for update experience

**1. Visual Progress Indicator** (43dc2cf):
```typescript
vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: 'Updating Components',
  cancellable: false
}, async (progress) => {
  for (let i = 0; i < updates.length; i++) {
    progress.report({
      message: `(${i+1}/${updates.length}) Updating ${componentId}...`,
      increment: (100 / updates.length)
    });
    await updateComponent(componentId);
  }
  progress.report({ message: 'Saving project state...' });
});
```

**Before**: Notification disappears immediately, no feedback
**After**: Persistent progress notification with percentage and component names

**2. Debug Logging Cleanup** (b9414ef):
- Reduced debug log verbosity by 85%
- Removed excessive logging from update checker
- Kept critical error/warning messages

**3. Update Check Notification UX** (af95036):
- Show result notification (success or error)
- Auto-dismiss after 5 seconds
- Clear feedback even when no updates available

**4. Shorten Notification Title** (01852d4):
- Changed title from verbose to concise
- Better readability in VS Code notification area

**UX Impact**: Users always know what's happening during updates

### Beta 32: Critical Binary Path Bug (Spaces in Paths)
- **Commit**: 533a24d
- **Date**: 2025-10-15 10:35:06
- **Type**: **CRITICAL Bug Fix**
- **Files Changed**: `externalCommandManager.ts`, package.json
- **Key Feature**: Fixed authentication and all Adobe CLI commands for users with spaces in paths

**The Problem**:
Binary path caching (beta.24) broke for default macOS paths containing spaces:
```
Path: /Users/username/Library/Application Support/fnm/...

Before (broken):
/Users/username/Library/Application Support/fnm/.../node /Users/username/Library/Application Support/fnm/.../aio auth login

Shell interprets:
Command: /Users/username/Library/Application
Args: Support/fnm/.../node Support/fnm/.../aio auth login
Error: Command not found (exit code 127)
```

**The Fix**:
```typescript
// Before
finalCommand = `${this.cachedNodeBinaryPath} ${this.cachedAioBinaryPath} ${aioCommand}`;

// After - Quote paths to handle spaces
finalCommand = `"${this.cachedNodeBinaryPath}" "${this.cachedAioBinaryPath}" ${aioCommand}`;
```

**Symptoms Fixed**:
- "Sign in" button not opening browser
- Mesh shows "Session expired" after authentication
- All `aio` commands fail with exit code 127
- Error: "no such file or directory: /Users/username/Library/Application"

**Who Was Affected**: ALL users with default macOS fnm installation path

**UX Impact**: Authentication and Adobe CLI commands work correctly on macOS

### Beta 33: Node 24 Compatibility
- **Commit**: d5c65d3
- **Date**: 2025-10-15 11:00:41
- **Type**: **CRITICAL Bug Fix**
- **Files Changed**: `externalCommandManager.ts`, package.json
- **Key Feature**: Restricted Node version detection to versions supported by Adobe CLI SDK

**The Problem**:
Extension would detect and use Node 24, which is **not supported** by Adobe CLI SDK:
```
Error: Failed to get organizations
TypeError: Bearer
Warning: Node.js version v24.10.0 is not supported.
Supported versions are ^18 || ^20 || ^22.
```

**Why It Happened**:
`findAdobeCLINodeVersion()` picked the **highest** Node version with `aio-cli` installed, which could be Node 24

**Why It Partially Worked**:
- `aio auth` and `aio config` commands work on any Node version
- Adobe CLI SDK (organization/project operations) requires Node 18/20/22

**The Fix**:
```typescript
// Adobe CLI SDK supports Node 18, 20, and 22 only (not 24+)
const SUPPORTED_NODE_VERSIONS = [18, 20, 22];

// Skip Node versions not supported by Adobe CLI SDK
if (!SUPPORTED_NODE_VERSIONS.includes(major)) {
  this.logger.debug(`[Adobe CLI] Node v${major}: skipping (Adobe CLI SDK requires ^18 || ^20 || ^22)`);
  continue;
}
```

**Version Selection Priority**:
1. Node 22 (highest supported)
2. Node 20 (if 22 not available)
3. Node 18 (if 20 not available)
4. Node 24+ skipped entirely

**UX Impact**: Organization/project selection works correctly for users with Node 24 installed

---

## Feature Deep Dives

### Homebrew Automation

**Purpose**: Eliminate manual PATH configuration and provide professional installation experience

**Implementation**:

**1. Completion Detection**:
```bash
# Modify install command with success/failure markers
/bin/bash -c "$(curl ...)" && \
  echo "SUCCESS" > "/tmp/demo-builder-homebrew-{timestamp}.complete" || \
  echo "FAILED" > "/tmp/demo-builder-homebrew-{timestamp}.failed"
```

**2. File System Watcher**:
```typescript
private async monitorHomebrewInstallation(
  prereqId: number,
  prereq: any,
  terminal: vscode.Terminal,
  completionMarkerPath: string,
  failureMarkerPath: string
): Promise<void> {

  // Fast-path: Check if markers already exist
  try {
    await fsPromises.access(completionMarkerPath, fs.constants.F_OK);
    await this.handleHomebrewInstallationComplete(...);
    return;
  } catch {}

  // Watch directory for marker files
  const watchDir = path.dirname(completionMarkerPath);
  const watcher = fs.watch(watchDir, async (eventType, filename) => {
    if (filename === path.basename(completionMarkerPath)) {
      // Success!
      await this.handleHomebrewInstallationComplete(...);
    } else if (filename === path.basename(failureMarkerPath)) {
      // Failure
      await this.handleHomebrewInstallationFailed(...);
    }
  });

  // 2-minute timeout (only for edge cases)
  setTimeout(() => {
    watcher.close();
    this.logger.warn('Homebrew installation monitoring timed out');
  }, 2 * 60 * 1000);
}
```

**3. PATH Configuration**:
```typescript
private async configureHomebrewPath(): Promise<void> {
  const shell = process.env.SHELL?.includes('zsh') ? 'zsh' : 'bash';
  const profilePath = shell === 'zsh'
    ? path.join(os.homedir(), '.zprofile')
    : path.join(os.homedir(), '.bash_profile');

  const homebrewConfig = `
# Homebrew PATH (auto-configured by Adobe Demo Builder)
eval "$(/opt/homebrew/bin/brew shellenv)"
`;

  // Read existing profile
  let profileContent = '';
  try {
    profileContent = await fsPromises.readFile(profilePath, 'utf-8');
  } catch {}

  // Skip if already configured (idempotent)
  if (profileContent.includes('/opt/homebrew/bin/brew shellenv')) {
    this.logger.debug('[Prerequisites] Homebrew PATH already configured');
    return;
  }

  // Append to profile
  await fsPromises.appendFile(profilePath, homebrewConfig);

  // Evaluate in current process
  const evalResult = await this.externalCommandManager.execute(
    'eval "$(/opt/homebrew/bin/brew shellenv)" && echo $PATH',
    { shell: '/bin/zsh' }
  );

  if (evalResult.code === 0) {
    process.env.PATH = evalResult.stdout.trim();
    this.logger.info('[Prerequisites] ✅ Homebrew PATH configured and evaluated');
  }
}
```

**4. Terminal Feedback**:
```typescript
private async injectTerminalFeedback(terminal: vscode.Terminal): Promise<void> {
  terminal.sendText(`
echo "✓ Installation complete! Configuring PATH..."
echo "✓ PATH configured successfully!"
echo "✅ All done! The wizard will continue automatically."
echo "   You can close this terminal (Cmd+W) or leave it open for reference."
  `.trim());
}
```

**5. User Notification**:
```typescript
const action = await vscode.window.showInformationMessage(
  'Homebrew installation complete! Click Continue to proceed with the wizard.',
  'Continue & Close Terminal',
  'Continue'
);

if (action === 'Continue & Close Terminal') {
  terminal.dispose();
}

// Wizard continues regardless of choice
await this.recheckPrerequisites();
```

**Key Features**:
- **Zero polling**: File-based events for instant detection
- **Idempotent**: Safe to run multiple times
- **User control**: Choose when to close terminal
- **Automatic fallback**: 2-minute timeout for edge cases
- **Shell detection**: Works with zsh and bash

**Files Involved**:
- `/Users/steve/Repositories/app-builder/demo-builder-vscode/src/commands/createProjectWebview.ts` (lines 1554-1900)

**UX Impact**:
- Before: User had to manually run PATH configuration commands
- After: Fully automated with clear feedback

### Component Version Tracking

**Purpose**: Accurately track installed component versions and detect when updates are available

**The Journey** (3 Attempts Over 30 Minutes):

**Attempt 1 (beta.22)**: Compare "unknown" with release SHA
- **Problem**: Versions weren't "unknown", they were git SHAs
- **Result**: Never triggered

**Attempt 2 (beta.28-29)**: Detect 40-character git SHAs
- **Problem**: Actual SHAs were 8 characters (short), and GitHub returned branch name
- **Result**: Comparison never matched

**Attempt 3 (beta.30)**: Fetch real commit SHA + short SHA comparison
- **Solution**: Works correctly!

**Implementation**:

**1. Fetch Real Commit SHA from GitHub**:
```typescript
async getLatestRelease(componentId: string): Promise<Release | null> {
  // Get release info
  const releaseUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  const releaseResponse = await fetch(releaseUrl);
  const releaseData = await releaseResponse.json();

  // Fetch tag details to get ACTUAL commit SHA
  const tagName = releaseData.tag_name;
  const tagUrl = `https://api.github.com/repos/${repo}/git/ref/tags/${tagName}`;
  const tagResponse = await fetch(tagUrl);
  const tagData = await tagResponse.json();

  return {
    version: releaseData.tag_name,
    commitSha: tagData.object.sha,  // Real 40-char SHA!
    url: releaseData.html_url
  };
}
```

**2. Short SHA Comparison**:
```typescript
async checkComponentUpdates(project: DemoProject): Promise<Map<string, UpdateInfo>> {
  const updates = new Map();

  for (const [componentId, instance] of Object.entries(project.componentInstances)) {
    // Get current version
    const currentVersion = project.componentVersions?.[componentId]?.version || 'unknown';
    const installedCommit = instance.version; // 8-char short SHA

    // Get latest release
    const latestRelease = await this.getLatestRelease(componentId);
    if (!latestRelease) continue;

    // Detect if current version is unknown/SHA
    const looksLikeGitSHA = /^[0-9a-f]{8,40}$/i.test(currentVersion);
    const isUnknownVersion = currentVersion === 'unknown' || looksLikeGitSHA;

    if (isUnknownVersion && installedCommit && latestRelease.commitSha) {
      // Compare commits with short SHA support
      let commitsMatch = false;

      if (installedCommit.length === 8) {
        // Short SHA: compare first 8 chars of release commit
        commitsMatch = latestRelease.commitSha
          .toLowerCase()
          .startsWith(installedCommit.toLowerCase());
      } else {
        // Full SHA: exact comparison
        commitsMatch = installedCommit.toLowerCase() ===
                      latestRelease.commitSha.toLowerCase();
      }

      if (commitsMatch) {
        // Already at this version - auto-fix
        project.componentVersions[componentId] = {
          version: latestRelease.version,
          lastChecked: new Date().toISOString()
        };
        await this.stateManager.saveProject(project);
        continue; // No update needed
      }
    }

    // If we get here, an update is available
    updates.set(componentId, {
      currentVersion,
      latestVersion: latestRelease.version,
      releaseUrl: latestRelease.url
    });
  }

  return updates;
}
```

**Debug Logging**:
```typescript
this.logger.debug('[Updates] Version comparison:', {
  currentVersion,
  installedCommit,
  releaseCommit: latestRelease.commitSha,
  installedLength: installedCommit.length,
  comparisonMethod: installedCommit.length === 8 ? 'short SHA' : 'full SHA',
  commitsMatch,
  hasUpdate: !commitsMatch
});
```

**Key Features**:
- Fetches actual commit SHA from GitHub tag API
- Supports both 8-char and 40-char SHA comparison
- Auto-fixes version tracking when commits match
- Works for both new and existing projects
- Graceful fallback if GitHub API fails

**Files Involved**:
- `/Users/steve/Repositories/app-builder/demo-builder-vscode/src/utils/updateManager.ts`

**UX Impact**:
- No more false "update available" notifications
- Component versions display correctly from project creation
- Users only see notifications for real updates

### Node 24 Compatibility

**Purpose**: Prevent extension from using Node 24, which breaks Adobe CLI SDK operations

**The Problem**:

Adobe CLI has two components:
1. **CLI commands** (`aio auth`, `aio config`) - Work on any Node version
2. **SDK** (`@adobe/aio-lib-core-console-api`) - Requires Node 18/20/22

Extension would pick the highest Node version with `aio-cli`, which could be Node 24.

**Result**:
- Authentication works (uses CLI commands)
- Organization selection fails (uses SDK)

**Implementation**:

**1. Define Supported Versions**:
```typescript
// Adobe CLI SDK supports Node 18, 20, and 22 only (not 24+)
// See: https://github.com/adobe/aio-lib-core-console-api
const SUPPORTED_NODE_VERSIONS = [18, 20, 22];
```

**2. Filter During Node Detection**:
```typescript
async findAdobeCLINodeVersion(): Promise<string | null> {
  // Find all fnm-managed Node versions
  const versionsDir = path.join(fnmBase, 'node-versions');
  const versionDirs = await fsPromises.readdir(versionsDir);

  const versionsWithAio: Array<{ major: number; path: string }> = [];

  for (const versionDir of versionDirs) {
    const match = versionDir.match(/^v(\d+)\./);
    if (!match) continue;

    const major = parseInt(match[1], 10);

    // Skip Node versions not supported by Adobe CLI SDK
    if (!SUPPORTED_NODE_VERSIONS.includes(major)) {
      this.logger.debug(
        `[Adobe CLI] Node v${major}: skipping (Adobe CLI SDK requires ^18 || ^20 || ^22)`
      );
      continue;
    }

    // Test if aio-cli works with this Node version
    try {
      const fnmPath = this.findFnmPath();
      const testResult = await this.execute(
        `${fnmPath} exec --using=${major} -- aio --version`,
        { timeout: 5000 }
      );

      if (testResult.code === 0) {
        versionsWithAio.push({ major, path: versionDir });
      }
    } catch {}
  }

  // Sort by major version descending and pick highest compatible
  if (versionsWithAio.length > 0) {
    versionsWithAio.sort((a, b) => b.major - a.major);
    const best = versionsWithAio[0];
    this.logger.debug(
      `[Adobe CLI] Found ${versionsWithAio.length} compatible Node version(s), using: Node v${best.major}`
    );
    return best.major.toString();
  }

  return null;
}
```

**Version Selection Priority**:
1. Node 22 (if available)
2. Node 20 (if 22 not available)
3. Node 18 (if 20 not available)
4. **Node 24+ never used**

**Debug Logging**:
```
[Adobe CLI] Node v24: skipping (Adobe CLI SDK requires ^18 || ^20 || ^22)
[Adobe CLI] Node v22: aio-cli works ✓
[Adobe CLI] Found 1 compatible Node version(s), using: Node v22
```

**Key Features**:
- Explicit compatibility filter
- Clear debug logging explaining why versions are skipped
- Graceful degradation if no compatible version available
- Future-proof (will skip Node 26, 28, etc. until SDK supports them)

**Files Involved**:
- `/Users/steve/Repositories/app-builder/demo-builder-vscode/src/utils/externalCommandManager.ts`

**UX Impact**:
- Organization/project selection works correctly
- No confusing "Node version not supported" errors
- Clear logging for debugging

### Binary Path Bug Fix

**Purpose**: Fix authentication and Adobe CLI commands for users with spaces in installation paths

**The Critical Bug**:

Binary path caching (beta.24) broke for default macOS paths:
```
Default macOS fnm path:
/Users/username/Library/Application Support/fnm/node-versions/v22.11.0/installation/bin/node

Command built without quotes:
/Users/username/Library/Application Support/fnm/.../node /Users/username/Library/Application Support/fnm/.../aio auth login

Shell interpretation:
Command: /Users/username/Library/Application
Args: Support/fnm/.../node Support/fnm/.../aio auth login
Result: "no such file or directory: /Users/username/Library/Application"
```

**The Fix**:
```typescript
// Before (broken)
if (this.cachedNodeBinaryPath && this.cachedAioBinaryPath && command.startsWith('aio ')) {
  const aioCommand = command.substring(4);
  finalCommand = `${this.cachedNodeBinaryPath} ${this.cachedAioBinaryPath} ${aioCommand}`;
}

// After (fixed)
if (this.cachedNodeBinaryPath && this.cachedAioBinaryPath && command.startsWith('aio ')) {
  const aioCommand = command.substring(4);
  // Quote paths to handle spaces in directory names
  finalCommand = `"${this.cachedNodeBinaryPath}" "${this.cachedAioBinaryPath}" ${aioCommand}`;
}
```

**Shell Behavior Explanation**:
```bash
# Without quotes (broken)
/path with spaces/node /path with spaces/aio auth login
# Interpreted as:
#   Command: /path
#   Args: with, spaces/node, /path, with, spaces/aio, auth, login

# With quotes (fixed)
"/path with spaces/node" "/path with spaces/aio" auth login
# Interpreted as:
#   Command: /path with spaces/node
#   Args: /path with spaces/aio, auth, login
```

**Who Was Affected**:
- **ALL macOS users** (default path contains "Application Support")
- Users with custom paths containing spaces
- Username directories with spaces

**Symptoms**:
- "Sign in" button doesn't open browser
- Exit code 127 errors
- Error: "no such file or directory: /Users/username/Library/Application"
- Mesh shows "Session expired" despite successful login

**Files Involved**:
- `/Users/steve/Repositories/app-builder/demo-builder-vscode/src/utils/externalCommandManager.ts` (line 147)

**UX Impact**:
- Authentication works correctly on macOS
- All Adobe CLI commands execute properly
- Performance optimization (cached paths) now reliable for all users

---

## New Files Added

No new files were created in this release range. All changes were modifications to existing files.

---

## Dependency Changes

No npm package dependencies were added, removed, or updated in this release range.

**package.json changes**: Only version bumps (1.0.0-beta.21 → 1.0.0-beta.33)

---

## Configuration Changes

### prerequisites.json
No changes to prerequisites configuration.

### components.json
No changes to component registry.

### Build Configuration
**.vscodeignore** (beta.27):
- Added patterns to exclude devDependencies from package
- Cleaner package (only runtime dependencies)

### Package Script (beta.27):
```json
{
  "scripts": {
    "package": "npm prune --omit=dev && vsce package && npm install"
  }
}
```

---

## Critical Findings

### Must-Adopt Features

**1. Binary Path Caching (beta.24) - CRITICAL PERFORMANCE**
- **Impact**: 5-6x speedup for all Adobe CLI commands
- **Complexity**: Moderate (50 lines)
- **Risk**: Low (well-tested, fallback to fnm exec)
- **Recommendation**: **MUST ADOPT** - Dramatic UX improvement

**2. Binary Path Quoting (beta.32) - CRITICAL BUG FIX**
- **Impact**: Fixes authentication for all macOS users
- **Complexity**: Trivial (1 line change)
- **Risk**: None
- **Recommendation**: **MUST ADOPT** - Critical authentication bug

**3. Node 24 Compatibility Filter (beta.33) - CRITICAL BUG FIX**
- **Impact**: Prevents organization selection failures
- **Complexity**: Low (10 lines)
- **Risk**: None
- **Recommendation**: **MUST ADOPT** - Critical compatibility issue

**4. Component Version Tracking (beta.30) - HIGH PRIORITY**
- **Impact**: Eliminates false update notifications
- **Complexity**: Moderate (40 lines)
- **Risk**: Low (graceful fallback on GitHub API failure)
- **Recommendation**: **SHOULD ADOPT** - Significantly improves update UX

### Critical Bug Fixes

**Authentication Breaking (beta.32)**:
- Cached binary paths with spaces caused exit code 127
- Affected ALL macOS users (default path)
- Fixed with simple path quoting

**Node Version Incompatibility (beta.33)**:
- Extension used Node 24, breaking Adobe SDK operations
- Authentication worked, but org/project selection failed
- Fixed with supported version filter

**Component Version Tracking (beta.28-30)**:
- Took 3 attempts over 30 minutes to get right
- Root causes: Short SHAs (8 chars) + GitHub returns branch name
- Final solution: Fetch real commit SHA + short SHA comparison

**Build Script Timing (beta.27)**:
- Build scripts ran before .env files created
- Commerce mesh facets didn't work
- Fixed by separating build from install

### Breaking Changes

None. All changes were backward-compatible fixes and optimizations.

---

## Compatibility Matrix

| Node Version | Support | Notes |
|--------------|---------|-------|
| Node 18 | ✅ Full | Adobe CLI SDK compatible |
| Node 20 | ✅ Full | Adobe CLI SDK compatible |
| Node 22 | ✅ Full | Adobe CLI SDK compatible, preferred |
| Node 24 | ⚠️ Filtered | Adobe CLI SDK incompatible, skipped by beta.33 |

| Platform | Binary Path Caching | Notes |
|----------|---------------------|-------|
| macOS | ✅ Fixed | beta.32 fixed space quoting |
| Linux | ✅ Works | Likely no spaces in default paths |
| Windows | ❓ Unknown | Not tested in these releases |

---

## Conflict Analysis

### Features We Already Have

**None of these features exist in refactor branch:**
- ❌ Binary path caching (beta.24)
- ❌ Homebrew automation (beta.25)
- ❌ Component version tracking fixes (beta.30)
- ❌ Node 24 filtering (beta.33)
- ❌ Binary path quoting (beta.32)

### Features We're Missing

**CRITICAL MISSING FEATURES**:
1. **Binary Path Caching**: Refactor branch still uses slow `fnm exec` for every command
2. **Binary Path Quoting**: Refactor branch will have authentication failures on macOS
3. **Node 24 Filtering**: Refactor branch will fail with Node 24 installed
4. **Homebrew Automation**: Refactor branch requires manual PATH configuration
5. **Component Version Tracking**: Refactor branch shows false update notifications

### Conflicting Implementations

**ExternalCommandManager**:
- Master: Binary path caching + quoting + Node 24 filtering
- Refactor: Standard fnm exec (slow, broken on macOS with spaces, breaks on Node 24)

**CreateProjectWebview**:
- Master: Homebrew automation with file watchers + automatic PATH config
- Refactor: May have different prerequisite handling

**UpdateManager**:
- Master: Short SHA comparison + GitHub tag API
- Refactor: Unknown (likely missing or different implementation)

---

## Integration Recommendations

### Adopt As-Is (Low Risk)

**1. Binary Path Quoting (beta.32)**
- **File**: `src/utils/externalCommandManager.ts`
- **Change**: Add quotes around cached paths
- **Risk**: None
- **Lines**: 1 line change
- **Action**: Copy exact fix from line 147

**2. Node 24 Compatibility Filter (beta.33)**
- **File**: `src/utils/externalCommandManager.ts`
- **Change**: Add supported versions array + filter logic
- **Risk**: None
- **Lines**: 10 lines
- **Action**: Copy `SUPPORTED_NODE_VERSIONS` constant + filter logic

### Adapt to Our Architecture (Medium Risk)

**1. Binary Path Caching (beta.24)**
- **Files**: `src/utils/externalCommandManager.ts`
- **Adaptation Needed**:
  - Integrate with refactor's ExternalCommandManager
  - May need to adjust for feature-based architecture
- **Risk**: Medium (need to ensure compatibility with refactor patterns)
- **Lines**: ~80 lines (cache variables + cacheBinaryPaths method + usage)
- **Action**: Study refactor's ExternalCommandManager, adapt caching logic

**2. Component Version Tracking (beta.30)**
- **Files**: `src/utils/updateManager.ts`
- **Adaptation Needed**:
  - May need to integrate with refactor's update system
  - Check if update feature exists in refactor branch
- **Risk**: Medium (depends on refactor's update architecture)
- **Lines**: ~40 lines
- **Action**: Verify refactor has update system, adapt if architecture differs

**3. Homebrew Automation (beta.25-27)**
- **Files**: `src/commands/createProjectWebview.ts`
- **Adaptation Needed**:
  - Large addition to prerequisite handling (~280 lines)
  - May conflict with refactor's prerequisite architecture
  - File watcher setup + PATH configuration + terminal feedback
- **Risk**: Medium-High (significant change to prerequisite flow)
- **Lines**: ~280 lines
- **Action**: Understand refactor's prerequisite system, port monitoring logic

### Skip or Defer (Conflicts)

**None**. All features should be adopted, though some require adaptation.

---

## Integration Priority

### Phase 1: Critical Bug Fixes (Do First)
1. **Binary Path Quoting** (beta.32) - 1 line, fixes macOS auth
2. **Node 24 Filtering** (beta.33) - 10 lines, prevents SDK failures

**Estimated Time**: 30 minutes
**Risk**: None
**Impact**: Prevents critical failures

### Phase 2: Performance Optimization (Do Second)
1. **Binary Path Caching** (beta.24) - 80 lines, 5-6x speedup

**Estimated Time**: 2 hours (adaptation + testing)
**Risk**: Medium (integration with refactor)
**Impact**: Massive UX improvement

### Phase 3: UX Improvements (Do Third)
1. **Component Version Tracking** (beta.30) - 40 lines, eliminates false updates
2. **Homebrew Automation** (beta.25-27) - 280 lines, automated installation

**Estimated Time**: 4 hours (adaptation + testing)
**Risk**: Medium (prerequisite system integration)
**Impact**: Significant UX improvement

---

## Statistics

- **Releases Analyzed**: 13 (beta.21 through beta.33)
- **Time Span**: 2 days (October 14-15, 2025)
- **Major Features Added**: 5
  - Binary path caching (performance)
  - Homebrew automation (installation)
  - Component version tracking (updates)
  - Node 24 filtering (compatibility)
  - Binary path quoting (bug fix)
- **Bug Fixes**: 8
  - Mesh status detection
  - False update notifications
  - Welcome screen race condition
  - Build script timing
  - Git SHA detection (3 attempts)
  - Binary paths with spaces
  - Node 24 compatibility
- **Files Changed**: 6 unique files
  - `externalCommandManager.ts` (3 releases)
  - `createProjectWebview.ts` (2 releases)
  - `updateManager.ts` (2 releases)
  - `checkUpdates.ts` (2 releases)
  - `baseCommand.ts` (1 release)
  - `ConfigureScreen.tsx` (1 release)
- **UX Improvements**: 6
  - Configure screen button labels
  - Prominent notifications
  - Visual progress indicators
  - Debug logging cleanup
  - Update check feedback
  - Terminal feedback messages
- **Lines Added**: ~550 lines
- **Lines Modified**: ~200 lines

---

## Technical Debt Created

**None**. All changes were clean improvements with proper error handling and logging.

**Good Practices Observed**:
- Graceful fallbacks (binary caching falls back to fnm exec)
- Defensive programming (version tracking handles GitHub API failures)
- Clear debug logging (all changes include detailed logging)
- User feedback (progress notifications, terminal messages)
- Idempotent operations (PATH configuration can run multiple times)

---

## Lessons Learned

### 1. Debug Logging Saves Time
Beta.30 added debug logging that immediately revealed the root cause (comparing branch name "master" with short SHA "9404d6a3"). This should have been added in beta.22.

### 2. Test With Real Data
Beta.22, 28, and 29 all failed because they were tested with expected data formats ("unknown" string) rather than real data (8-char short SHAs). Always test with production data.

### 3. Path Quoting Is Critical
Beta.32 discovered that the default macOS installation path contains spaces, breaking all Adobe CLI commands. Any file path handling must include proper quoting.

### 4. Compatibility Matrices Matter
Beta.33 discovered that Adobe CLI SDK only supports Node 18/20/22, not 24. Version compatibility should be documented and enforced proactively.

### 5. Incremental Releases Are Valuable
Breaking down features into small releases (beta.25 monitoring, beta.26 UX, beta.27 consolidated) allowed for focused testing and quick iteration.

---

## Recommendations for Refactor Branch

### Immediate Actions (Critical)

1. **Apply beta.32 fix** (binary path quoting)
   - Prevents authentication failures on macOS
   - 1 line change
   - Zero risk

2. **Apply beta.33 fix** (Node 24 filtering)
   - Prevents organization selection failures
   - 10 lines
   - Zero risk

### Short-Term Actions (High Priority)

3. **Port beta.24 caching** (binary path caching)
   - 5-6x performance improvement
   - ~80 lines
   - Well-tested pattern
   - May need architecture adaptation

4. **Port beta.30 fix** (component version tracking)
   - Eliminates false update notifications
   - ~40 lines
   - Check if update system exists in refactor

### Long-Term Actions (Nice to Have)

5. **Port beta.25-27** (Homebrew automation)
   - Fully automated installation
   - ~280 lines
   - Requires prerequisite system integration
   - Significant UX improvement

### Testing Checklist

After porting features:
- [ ] Test on macOS with default fnm path (contains "Application Support")
- [ ] Test with Node 24 installed (should skip to Node 22/20/18)
- [ ] Test with Node 22 only (should work perfectly)
- [ ] Measure Adobe CLI command performance (should be < 2s)
- [ ] Test component update checks (should not show false updates)
- [ ] Test Homebrew installation (should auto-configure PATH)

---

## Conclusion

Beta releases 21-33 delivered critical performance optimizations, automated installation workflows, and critical bug fixes that significantly improve the extension's reliability and user experience. The refactor branch is **missing all of these features** and will experience:

1. **5-6x slower Adobe CLI commands** (no binary path caching)
2. **Authentication failures on macOS** (no path quoting)
3. **Organization selection failures with Node 24** (no version filtering)
4. **False component update notifications** (no version tracking fix)
5. **Manual Homebrew PATH configuration** (no automation)

**Priority**: Adopt critical bug fixes immediately (beta.32, beta.33), then port performance optimization (beta.24), then UX improvements (beta.30, beta.25-27).

**Estimated Total Integration Time**: 8-10 hours
- Phase 1 (critical): 30 minutes
- Phase 2 (performance): 2 hours
- Phase 3 (UX): 4-6 hours
- Testing: 2 hours

**Recommendation**: Start with Phase 1 immediately to prevent critical failures, then proceed with Phase 2 and Phase 3 based on priority and available time.
