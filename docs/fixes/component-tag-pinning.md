# Component Tag Pinning for Stability

## Problem

Components were cloning from `master`/`main` branches which can change at any time, leading to:
- **Unpredictable behavior** - different projects could get different code
- **Deployment failures** - untested changes reaching production
- **Difficult debugging** - hard to know which version caused issues
- **No rollback path** - can't easily revert to known-good versions

## Solution

Pin all Git-sourced components to specific tags for:
- ✅ **Immutability** - Tags never change, branches do
- ✅ **Reproducibility** - Every project gets the exact tested version
- ✅ **Explicit versioning** - Clear which version is deployed
- ✅ **Rollback safety** - Easy to pin to known-good versions
- ✅ **Testing confidence** - What you test is what gets deployed

## Changes Made

### 1. Updated `commerce-mesh` Component

**Before:**
```json
{
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/commerce-mesh",
    "branch": "master",
    "gitOptions": {
      "shallow": true
    }
  }
}
```

**After:**
```json
{
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/commerce-mesh",
    "gitOptions": {
      "shallow": true,
      "tag": "v1.0.0-beta.3"
    }
  }
}
```

### 2. Updated `integration-service` Component

**Before:**
```json
{
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/kukla-integration-service",
    "gitOptions": {
      "shallow": true
    }
  }
}
```

**After:**
```json
{
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/kukla-integration-service",
    "gitOptions": {
      "shallow": true,
      "tag": "v1.0.0"
    }
  }
}
```

### 3. Updated `commerce-demo-ingestion` Tool

**Before:**
```json
{
  "source": {
    "type": "git",
    "url": "https://github.com/PMET-public/commerce-demo-ingestion",
    "branch": "main",
    "gitOptions": {
      "shallow": true
    }
  },
  "dataRepository": {
    "url": "https://github.com/PMET-public/vertical-data-citisignal",
    "branch": "accs"
  }
}
```

**After:**
```json
{
  "source": {
    "type": "git",
    "url": "https://github.com/PMET-public/commerce-demo-ingestion",
    "gitOptions": {
      "shallow": true,
      "tag": "v1.0.0"
    }
  },
  "dataRepository": {
    "url": "https://github.com/PMET-public/vertical-data-citisignal",
    "tag": "v1.0.0"
  }
}
```

### 4. Updated Schema

Added `tag` and `recursive` support to `gitOptions` in `components.schema.json`:

```json
{
  "gitOptions": {
    "type": "object",
    "properties": {
      "shallow": {
        "type": "boolean",
        "description": "Whether to perform shallow clone"
      },
      "tag": {
        "type": "string",
        "description": "Git tag to clone (preferred over branch for stability)"
      },
      "recursive": {
        "type": "boolean",
        "description": "Whether to clone submodules recursively"
      }
    }
  }
}
```

## Implementation Notes

### Existing Support

The component installation code (`src/features/components/services/componentInstallation.ts`) **already supports** the `tag` field:

```typescript
// Lines 71-75
if (componentDef.source.gitOptions?.tag) {
    cloneFlags.push(`--branch ${componentDef.source.gitOptions.tag}`);
} else if (componentInstance.branch) {
    cloneFlags.push(`-b ${componentInstance.branch}`);
}
```

Git's `--branch` flag works with both branches and tags, so no code changes were needed!

### Priority Order

When cloning, the system checks in this order:
1. **Tag** from `gitOptions.tag` (highest priority)
2. **Branch** from `source.branch` or runtime options
3. **Default** to 'main'

## Verification

The mesh error was caused by GitHub's repository having the correct code but the config cloning from the `master` branch instead of the tagged release `v1.0.0-beta.3`.

### Confirmed Working:
- ✅ Tag `v1.0.0-beta.3` exists on GitHub
- ✅ Tag contains correct `CATALOG_SERVICE_ENDPOINT` variable
- ✅ Fresh clone from tag works correctly:
  ```bash
  git clone --depth 1 --branch v1.0.0-beta.3 \
    https://github.com/skukla/commerce-mesh test-mesh
  # Result: Uses CATALOG_SERVICE_ENDPOINT ✓
  ```

## Version Management

### Updating to New Versions

When a new component version is released:

1. **Tag the release** in the repository:
   ```bash
   git tag -a v1.0.0-beta.4 -m "Release v1.0.0-beta.4"
   git push origin v1.0.0-beta.4
   ```

2. **Update `components.json`**:
   ```json
   {
     "gitOptions": {
       "tag": "v1.0.0-beta.4"
     }
   }
   ```

3. **Test thoroughly** before committing

### Rollback Strategy

To revert to a previous version, simply change the tag:

```json
{
  "gitOptions": {
    "tag": "v1.0.0-beta.3"  // Rollback to known-good version
  }
}
```

## Best Practices Going Forward

1. **Always use tags** for component sources, never branches
2. **Use semantic versioning** (e.g., `v1.2.3` or `v1.0.0-beta.3`)
3. **Test tags** before updating production config
4. **Document releases** with clear release notes
5. **Keep tags immutable** - never delete or move tags

## Related Files

- `src/features/components/config/components.json` - Component definitions
- `src/features/components/config/components.schema.json` - JSON schema
- `src/features/components/services/componentInstallation.ts` - Clone logic
- `docs/fixes/mesh-env-variable-migration.md` - Related mesh fix
