# Update System Refactoring: Dynamic Repository Resolution

## Overview

Refactored the update system to dynamically resolve component repositories from `components.json` instead of using hardcoded mappings. This eliminates duplication and ensures consistency between component installation and updates.

## Problem

**Before**, the update system had hardcoded repository mappings:

```typescript
// UpdateManager.ts
private readonly COMPONENT_REPOS: Record<string, string> = {
    'headless': 'skukla/citisignal-nextjs',
    'commerce-mesh': 'skukla/commerce-mesh',
    'integration-service': 'skukla/kukla-integration-service',
    'demo-inspector': 'skukla/demo-inspector',
};
```

**Issues**:
1. ❌ **Duplication** - Repository URLs defined in both `components.json` and `UpdateManager`
2. ❌ **Inconsistency risk** - Updating one doesn't update the other
3. ❌ **Maintenance burden** - Must update code when adding new components
4. ❌ **Not scalable** - Doesn't work with dynamically loaded components

## Solution

**After**, repositories are dynamically resolved from `components.json`:

```typescript
// UpdateManager.ts
private repositoryResolver: ComponentRepositoryResolver;

// Usage
const repoInfo = await this.repositoryResolver.getRepositoryInfo('commerce-mesh');
// Returns: { id: 'commerce-mesh', repository: 'skukla/commerce-mesh', name: 'Adobe Commerce API Mesh' }
```

**Benefits**:
1. ✅ **Single source of truth** - Repository URLs only in `components.json`
2. ✅ **Consistency guaranteed** - Updates and installation use same config
3. ✅ **Automatic updates** - New components automatically available for updates
4. ✅ **Type-safe** - Full TypeScript support with proper interfaces

## Architecture

### ComponentRepositoryResolver

New service that extracts Git repository information from `components.json`:

```typescript
export class ComponentRepositoryResolver {
    /**
     * Get repository information for a specific component
     */
    async getRepositoryInfo(componentId: string): Promise<ComponentRepositoryInfo | null>;

    /**
     * Get all component repositories from components.json
     * Results are cached after first load
     */
    async getAllRepositories(): Promise<Map<string, ComponentRepositoryInfo>>;

    /**
     * Clear the cache (useful for testing or when components.json changes)
     */
    clearCache(): void;
}
```

### Integration with UpdateManager

UpdateManager now uses the resolver for all component lookups:

```typescript
// Check for updates
for (const componentId of componentIds) {
    // Dynamically resolve repository
    const repoInfo = await this.repositoryResolver.getRepositoryInfo(componentId);
    if (!repoInfo) {
        continue; // Component doesn't have Git source
    }

    // Fetch latest release from GitHub
    const latestRelease = await this.fetchLatestRelease(repoInfo.repository, channel);
    // ...
}
```

## Changes Made

### 1. Created ComponentRepositoryResolver

**File**: `src/features/updates/services/componentRepositoryResolver.ts`

- Loads `components.json` using `ConfigurationLoader`
- Extracts Git sources from all component categories:
  - `frontends` (e.g., headless)
  - `mesh` (e.g., commerce-mesh)
  - `appBuilderApps` (e.g., integration-service)
  - `tools` (e.g., commerce-demo-ingestion)
- Parses GitHub URLs to extract `owner/repo` format
- Caches results for performance

### 2. Updated UpdateManager

**File**: `src/features/updates/services/updateManager.ts`

**Removed**:
```typescript
private readonly COMPONENT_REPOS: Record<string, string> = { ... };
```

**Added**:
```typescript
private repositoryResolver: ComponentRepositoryResolver;

constructor(context: vscode.ExtensionContext, logger: Logger) {
    this.repositoryResolver = new ComponentRepositoryResolver(context.extensionPath, logger);
}
```

**Updated methods**:
- `checkComponentUpdates()` - Uses resolver instead of hardcoded map
- `checkAllProjectsForUpdates()` - Uses resolver for multi-project checks
- `checkSubmoduleUpdates()` - Uses resolver for submodule updates

### 3. Added Tests

**File**: `tests/features/updates/services/componentRepositoryResolver.test.ts`

- 12 comprehensive tests covering all functionality
- Tests repository extraction, caching, and URL parsing
- Verifies integration with UpdateManager expectations
- ✅ All tests passing

### 4. Updated Documentation

**Files**:
- `src/features/updates/README.md` - Updated repository configuration section
- `docs/architecture/update-system-refactoring.md` - This document
- `docs/fixes/component-tag-pinning.md` - Updated to reference dynamic resolution

## Migration Guide

### For Component Developers

**No changes needed!** Just ensure your component in `components.json` has:

```json
{
  "your-component": {
    "source": {
      "type": "git",
      "url": "https://github.com/owner/repo",
      "gitOptions": {
        "tag": "v1.0.0"
      }
    }
  }
}
```

The update system will automatically detect it.

### For Extension Developers

If you were directly accessing `COMPONENT_REPOS`:

**Before**:
```typescript
const repo = updateManager.COMPONENT_REPOS['commerce-mesh'];
```

**After**:
```typescript
import { ComponentRepositoryResolver } from '@/features/updates';

const resolver = new ComponentRepositoryResolver(extensionPath, logger);
const info = await resolver.getRepositoryInfo('commerce-mesh');
const repo = info?.repository;
```

## Benefits Summary

### Before (Hardcoded)
```
components.json           UpdateManager
     ↓                         ↓
"url": "github.com/..."   COMPONENT_REPOS = {...}
     ↓                         ↓
  (Duplicate configuration)
```

### After (Dynamic)
```
components.json
     ↓
ComponentRepositoryResolver
     ↓
UpdateManager, ComponentInstaller, etc.
     ↓
  (Single source of truth)
```

## Testing

### Manual Testing

```bash
# Run resolver tests
npm test -- componentRepositoryResolver.test.ts

# Run full update system tests
npm test -- updateManager.test.ts

# Compile and verify
npm run compile
```

### Integration Testing

The resolver is tested with the actual `components.json` file to ensure:
- All Git-based components are correctly detected
- Repository URLs are properly parsed
- Format matches UpdateManager expectations

## Future Enhancements

### 1. Dynamic Version Resolution

Could extend to read tag from `components.json` and use as a constraint:

```typescript
// components.json
{
  "gitOptions": {
    "tag": "v1.0.0",
    "allowUpdatesTo": "v1.x.x"  // Only update to v1.* releases
  }
}
```

### 2. Custom Update Channels per Component

```typescript
{
  "gitOptions": {
    "tag": "v1.0.0-beta.3",
    "updateChannel": "beta"  // Override global channel
  }
}
```

### 3. Registry Support

Extend to support npm registry or other sources:

```typescript
{
  "source": {
    "type": "npm",
    "package": "@adobe/commerce-mesh",
    "version": "^1.0.0"
  }
}
```

## Related Documentation

- `src/features/updates/README.md` - Update system overview
- `docs/fixes/component-tag-pinning.md` - Why we use tags
- `docs/architecture/component-version-management.md` - Version management strategy
- `src/features/components/README.md` - Component registry architecture
