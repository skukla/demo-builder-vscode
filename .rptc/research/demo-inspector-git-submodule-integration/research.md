# Research: Demo Inspector Git Submodule Integration

**Date**: 2025-11-29
**Scope**: Codebase + Web Research
**Depth**: Standard
**Focus Areas**: Git Operations, Logging, Updates, Integration

---

## Summary

The extension is **well-prepared for git submodule integration**. The component manager already supports recursive submodule cloning via `gitOptions.recursive`. The main changes needed are: (1) updating the component definition from npm to git source type, (2) adding demo-inspector to the update manager's repository mapping, and (3) handling the special case where demo-inspector lives within citisignal-nextjs as a submodule rather than as a standalone component.

---

## Codebase Analysis

### Relevant Files

| File | Purpose | Key Lines |
|------|---------|-----------|
| `templates/components.json:94-112` | Component definitions - demo-inspector currently npm type | Needs change to git |
| `src/features/components/services/componentManager.ts:155-176` | Git clone with `--recursive` flag support | Already handles submodules |
| `src/features/updates/services/updateManager.ts:54-88` | COMPONENT_REPOS mapping for update checks | Needs demo-inspector added |
| `src/core/logging/debugLogger.ts:43-170` | Dual-channel logging (User/Debug) | Pattern to follow |

### Current Demo Inspector Definition (NPM Package)

```json
"demo-inspector": {
  "name": "Demo Inspector",
  "source": {
    "type": "npm",
    "package": "@adobe/demo-inspector",
    "version": "^1.0.0"
  }
}
```

### Existing Git Clone Support

The ComponentManager already supports:
- `gitOptions.shallow: true` → `--depth=1`
- `gitOptions.recursive: true` → `--recursive` (for submodules)
- `gitOptions.tag` → `--branch tag-name`
- Branch selection via `componentInstance.branch`

**Code Reference** (`componentManager.ts:155-176`):
```typescript
// Build git clone command with options
const cloneFlags: string[] = [];

if (componentDef.source.gitOptions?.tag) {
  cloneFlags.push(`--branch ${componentDef.source.gitOptions.tag}`);
} else if (componentInstance.branch) {
  cloneFlags.push(`-b ${componentInstance.branch}`);
}

if (componentDef.source.gitOptions?.shallow) {
  cloneFlags.push('--depth=1');
}

if (componentDef.source.gitOptions?.recursive) {
  cloneFlags.push('--recursive');
}
```

### Update System Repository Mapping

```typescript
// src/features/updates/services/updateManager.ts
private readonly COMPONENT_REPOS: Record<string, string> = {
  'citisignal-nextjs': 'skukla/citisignal-nextjs',
  'commerce-mesh': 'skukla/commerce-mesh',
  'integration-service': 'skukla/kukla-integration-service',
  // demo-inspector NOT currently here
};
```

### Logging Patterns

- **User Logs channel**: `info()`, `warn()`, `error()` - user-facing messages
- **Debug Logs channel**: `debug()`, `trace()` - technical diagnostics
- **Prefix convention**: `[FeatureName]` (e.g., `[Updates]`, `[ComponentManager]`)
- **Emojis**: checkmark for success, X for failure

**Examples from codebase**:
```typescript
// User-facing (info level)
this.logger.info('[Updates] Successfully updated ${componentId} to ${newVersion}');

// Debug/support (debug level)
this.logger.debug('[ComponentManager] Cloning ${componentDef.name} from ${componentDef.source.url}');

// Errors
this.logger.error('[Updates] Update failed, rolling back to snapshot', error as Error);
```

---

## Web Research: Git Submodule Best Practices

### Critical Finding: Avoid Shallow Clones with Submodules

**Problem**: Using `--depth 1` with submodules causes "fatal: reference is not a tree" errors when the recorded submodule commit isn't in shallow history.

**Source**: [GitHub Blog - Partial Clone and Shallow Clone](https://github.blog/open-source/git/get-up-to-speed-with-partial-clone-and-shallow-clone/)

**Solution**: The extension currently uses `gitOptions.shallow: true` by default. For citisignal-nextjs (which now contains demo-inspector as a submodule), this should be disabled or use `--filter=blob:none` instead.

### Recommended Git Commands

**For cloning with submodules:**
```bash
# Option 1: Clone with submodules
git clone --recurse-submodules <url>

# Option 2: Clone first, then init submodules
git clone <url>
git submodule update --init --recursive
```

**For checking submodule status:**
```bash
git submodule status --recursive
# Output prefix meanings:
# '-' = uninitialized
# '+' = checked out to different commit than recorded
# ' ' = in sync
```

**For updating submodule to latest:**
```bash
git submodule update --remote --merge
```

### simple-git Library (Recommended)

The **simple-git** npm package (200K+ weekly downloads) provides:
- `git.submoduleInit()` - Initialize submodules
- `git.submoduleUpdate(['--init', '--recursive'])` - Update with options
- `git.subModule(['status', '--recursive'])` - Raw submodule commands

**Source**: [npm - simple-git](https://www.npmjs.com/package/simple-git)

### Submodule Status Checking Pattern

```typescript
import simpleGit, { SimpleGit } from 'simple-git';

interface SubmoduleStatus {
  name: string;
  path: string;
  initialized: boolean;
  sha: string;
  needsUpdate: boolean;
}

async function getSubmoduleStatus(repoPath: string): Promise<SubmoduleStatus[]> {
  const git: SimpleGit = simpleGit(repoPath);
  const statusOutput = await git.raw(['submodule', 'status', '--recursive']);

  const submodules: SubmoduleStatus[] = [];
  const lines = statusOutput.trim().split('\n').filter(line => line.length > 0);

  for (const line of lines) {
    const prefix = line.charAt(0);
    const match = line.match(/^([ +\-U])([a-f0-9]+)\s+(\S+)/);

    if (match) {
      const [, status, sha, subPath] = match;
      submodules.push({
        name: path.basename(subPath),
        path: subPath,
        initialized: status !== '-',
        sha: sha,
        needsUpdate: status === '+'
      });
    }
  }

  return submodules;
}
```

### Update Checking Pattern

```typescript
async function checkSubmoduleUpdates(
  repoPath: string,
  submodulePath: string,
  branch: string = 'main'
): Promise<{ hasUpdates: boolean; behindBy: number }> {
  const submoduleFullPath = path.join(repoPath, submodulePath);
  const git: SimpleGit = simpleGit(submoduleFullPath);

  // Fetch latest from remote without modifying working tree
  await git.fetch(['origin', branch]);

  const currentCommit = (await git.revparse(['HEAD'])).trim();
  const latestCommit = (await git.revparse([`origin/${branch}`])).trim();

  let behindBy = 0;
  if (currentCommit !== latestCommit) {
    const logResult = await git.raw([
      'rev-list', '--count', `${currentCommit}..origin/${branch}`
    ]);
    behindBy = parseInt(logResult.trim(), 10) || 0;
  }

  return {
    hasUpdates: currentCommit !== latestCommit,
    behindBy
  };
}
```

---

## Comparison & Gap Analysis

| Aspect | Current State | Needed for Submodule Support |
|--------|---------------|------------------------------|
| Clone command | Uses `--recursive` if `gitOptions.recursive: true` | Already supported |
| Shallow clone | Uses `--depth=1` by default | May cause issues with submodules |
| Component source type | Demo-inspector is `npm` type | Needs change to `git` type OR handle as part of citisignal-nextjs |
| Update checking | Only checks repos in COMPONENT_REPOS | Needs demo-inspector added |
| Submodule init check | Not implemented | Needs verification that submodules initialized |
| User logging | Standard patterns exist | Follow `[ComponentName]` prefix pattern |

---

## Implementation Options

### Option A: Demo Inspector as Separate Git Component

**Approach**: Change demo-inspector from npm to git source type in components.json

```json
"demo-inspector": {
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/demo-inspector",
    "branch": "main",
    "gitOptions": { "shallow": true }
  }
}
```

**Pros:**
- Independent versioning and updates
- Cleaner separation of concerns
- Uses existing componentManager.installGitComponent()

**Cons:**
- Two separate clones during project creation
- User may not realize demo-inspector is separate repo

### Option B: Demo Inspector as Submodule of citisignal-nextjs

**Approach**: Keep demo-inspector as part of citisignal-nextjs installation, but ensure submodules are cloned

```json
"citisignal-nextjs": {
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/citisignal-nextjs",
    "gitOptions": {
      "shallow": false,
      "recursive": true
    }
  }
}
```

**Pros:**
- Single clone for frontend + inspector
- Matches git submodule architecture
- Demo inspector always compatible with frontend version

**Cons:**
- Separate update checking needed for submodule
- Need to disable shallow clone for citisignal-nextjs
- More complex version tracking

### Option C: Hybrid Approach

**Approach**: citisignal-nextjs includes demo-inspector as submodule, but update system tracks demo-inspector independently

**Pros:**
- Best of both worlds
- Single clone, independent updates

**Cons:**
- Most complex implementation

---

## Common Pitfalls to Avoid

1. **Shallow clone + submodules**: Don't use `--depth 1` with repositories that have submodules - causes "reference is not a tree" errors

2. **Forgetting `--recursive`**: Submodule directories will be empty without this flag

3. **Detached HEAD**: Submodules check out specific commits, not branches - handle this in update logic

4. **Push order**: If user modifies submodule, they must push submodule before parent

5. **URL changes not propagated**: After changing submodule URL in `.gitmodules`, need to run `git submodule sync`

---

## Logging Recommendations

### User-Facing Logs (info level)

```typescript
// During clone
this.logger.info('[Project Creation] Cloning citisignal-nextjs with demo-inspector...');
this.logger.info('[Project Creation] Initializing submodules...');

// Success
this.logger.info('[Project Creation] Frontend and demo-inspector ready');

// Updates
this.logger.info('[Updates] Demo Inspector update available: v1.0.0 -> v1.1.0');
this.logger.info('[Updates] Successfully updated demo-inspector to v1.1.0');
```

### Debug/Support Logs (debug level)

```typescript
// Technical details
this.logger.debug('[ComponentManager] Running: git clone --recursive https://...');
this.logger.debug('[ComponentManager] Submodule status: demo-inspector initialized at abc1234');
this.logger.debug('[Updates] Checking demo-inspector: current=abc1234, latest=def5678');
this.logger.debug('[Updates] Demo-inspector is 3 commits behind origin/main');
```

---

## Key Takeaways

1. **Existing support is strong**: ComponentManager already handles `--recursive` for submodules

2. **Shallow clone is the risk**: Need to disable for citisignal-nextjs if demo-inspector is a submodule

3. **Update system needs extension**: Add demo-inspector to COMPONENT_REPOS mapping

4. **Logging patterns are established**: Follow `[Updates]`, `[ComponentManager]` prefix conventions

5. **simple-git is the recommended library** for programmatic git operations if needed

6. **Decision needed**: Is demo-inspector a separate component (Option A) or part of citisignal-nextjs (Option B)?

---

## Sources

### Official Documentation
- [Git-SCM - Git Tools - Submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
- [Git-SCM - git-submodule Documentation](https://git-scm.com/docs/git-submodule)
- [GitHub Blog - Partial Clone and Shallow Clone](https://github.blog/open-source/git/get-up-to-speed-with-partial-clone-and-shallow-clone/)

### Libraries
- [npm - simple-git](https://www.npmjs.com/package/simple-git)
- [GitHub - git-assistant VS Code extension](https://github.com/ivanhofer/git-assistant)

### Community
- [Stack Overflow - Clone with Submodules](https://stackoverflow.com/questions/3796927/how-do-i-git-clone-a-repo-including-its-submodules)
- [Stack Overflow - Update to Latest Commit](https://stackoverflow.com/questions/5828324/update-git-submodule-to-latest-commit-on-origin)
