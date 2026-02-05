# Component Version Management

## Overview

Demo Builder uses a **floating stable tag** pattern for component versioning. This decouples component updates from extension releases, allowing mesh fixes and improvements to ship without requiring extension updates.

## Architecture

### Floating Stable Tags

All skukla-controlled component repositories use a floating `stable` tag instead of hardcoded version tags:

| Repository | Tag | Purpose |
|------------|-----|---------|
| skukla/commerce-eds-mesh | `stable` | EDS PaaS API Mesh |
| skukla/eds-accs-mesh | `stable` | EDS ACCS API Mesh |
| skukla/headless-commerce-mesh | `stable` | Headless API Mesh |
| skukla/kukla-integration-service | `stable` | App Builder integration |

Third-party repositories (PMET-public) retain versioned tags since they're not under direct control.

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│ components.json                                          │
│ eds-commerce-mesh: { tag: "stable" }                    │
└─────────────────────────────────────────────────────────┘
                    ↓
            [User Creates Project]
                    ↓
┌─────────────────────────────────────────────────────────┐
│ git clone --branch stable                                │
│ → Clones whatever commit "stable" points to             │
└─────────────────────────────────────────────────────────┘
                    ↓
            [Mesh Team Releases Fix]
                    ↓
┌─────────────────────────────────────────────────────────┐
│ git tag -f stable && git push -f origin stable          │
│ → "stable" now points to new commit                     │
└─────────────────────────────────────────────────────────┘
                    ↓
            [User Creates Another Project]
                    ↓
┌─────────────────────────────────────────────────────────┐
│ git clone --branch stable                                │
│ → Automatically gets the fixed version ✅               │
└─────────────────────────────────────────────────────────┘
```

**Key benefit**: No extension release needed for component updates.

## Releasing Component Updates

### Step 1: Make Changes

```bash
cd eds-commerce-mesh/
# Make your changes
git add .
git commit -m "fix: resolve grand_total_excl_tax resolver"
git push origin main
```

### Step 2: Update Stable Tag

```bash
# Move stable tag to current HEAD
git tag -f stable
git push -f origin stable
```

### Step 3: Verify (Optional)

```bash
# Verify the tag points to the right commit
git rev-parse stable
git rev-parse HEAD
# Should match
```

That's it. All new projects will automatically use the updated component.

### Step 4: Create Versioned Release (Optional)

For tracking purposes, you may also want to create a versioned release:

```bash
git tag v1.0.0-beta.4
git push origin v1.0.0-beta.4

gh release create v1.0.0-beta.4 \
  --title "v1.0.0-beta.4" \
  --notes "**Changes:**
- Fixed grand_total_excl_tax resolver
- Added share_active_segments resolver
"
```

This provides a historical record of releases while `stable` always points to the current recommended version.

## Version Tracking

### Project-Level Tracking

Each project tracks its installed component versions in `project.componentVersions`:

```typescript
{
  componentVersions: {
    'eds-commerce-mesh': {
      version: '1.0.0-beta.4',  // Resolved version at clone time
      installedAt: '2025-02-05T10:30:00Z'
    }
  }
}
```

This enables:
- Update detection (compare project version to latest release)
- Rollback capabilities (know what version was installed)
- Debugging (identify which version a user has)

### Resolving Stable to Version

When cloning a `stable` tag, the actual version is resolved from:
1. Package.json `version` field (if present)
2. Git describe (`git describe --tags`)
3. Commit SHA (fallback)

## Update System Integration

The auto-update system works independently:

1. **Check for Updates**: Queries GitHub Releases API for latest version
2. **Compare**: Project version vs latest release
3. **Update Available**: If latest > project version
4. **Apply Update**: Downloads release, applies with rollback safety

The `stable` tag doesn't affect the update system - it only affects initial project creation.

## Migration from Versioned Tags

### Why We Changed

Previously, `components.json` used hardcoded version tags:

```json
{
  "gitOptions": {
    "tag": "v1.0.0-beta.3"  // Had to update extension to change this
  }
}
```

**Problems:**
- Mesh bug fix required extension release
- Version drift between extension and components
- Manual tag updates in components.json
- New projects could get outdated components

### Current Pattern

```json
{
  "gitOptions": {
    "tag": "stable"  // Always gets current recommended version
  }
}
```

**Benefits:**
- Component updates ship immediately
- No extension release needed for fixes
- Single source of truth (stable tag)
- Consistent experience for all users

## Repository Setup

### Creating Stable Tag for New Repos

```bash
cd my-new-component/

# Tag initial release
git tag v1.0.0-beta.1
git push origin v1.0.0-beta.1

# Create stable pointing to same commit
git tag stable
git push origin stable

# Create GitHub release for tracking
gh release create v1.0.0-beta.1 --title "v1.0.0-beta.1" --notes "Initial release"
```

### Moving Stable Tag

```bash
# After making fixes
git tag -f stable          # Force update local tag
git push -f origin stable  # Force push to remote
```

The `-f` (force) flag is required because the tag already exists.

## Best Practices

### DO

- Keep `stable` pointing to a tested, working version
- Create versioned tags for release tracking
- Test changes before moving `stable` tag
- Document breaking changes in release notes

### DON'T

- Move `stable` to untested code
- Delete the `stable` tag
- Use `stable` for experimental features
- Forget to push the tag (`git push -f origin stable`)

## Rollback Procedure

If a `stable` update breaks something:

```bash
cd eds-commerce-mesh/

# Find the previous good commit
git log --oneline

# Move stable back to that commit
git tag -f stable <good-commit-sha>
git push -f origin stable
```

New project creations will immediately use the rolled-back version.

## Related Documentation

- `src/features/updates/README.md` - Update system architecture
- `src/features/components/config/components.json` - Component definitions
- `docs/architecture/component-system.md` - Component system overview
