# Component Version Management

## Overview

The Demo Builder has **two separate version tracking systems** that need to stay synchronized:

1. **Global Template** (`components.json`) - Default version for NEW projects
2. **Per-Project Tracking** (`project.componentVersions`) - Installed version in EXISTING projects

## Current Workflow (Existing Projects)

### When You Update Components

The update system:
- ✅ Checks GitHub Releases for new versions
- ✅ Downloads the new tagged release
- ✅ Updates `project.componentVersions[componentId].version`
- ❌ **Does NOT update** the tag in `components.json`

### Problem

```
┌─────────────────────────────────────────────────┐
│ components.json                                 │
│ commerce-mesh: { tag: "v1.0.0-beta.3" }        │ ← OLD projects clone this
└─────────────────────────────────────────────────┘
                    ↓
            [Update Released]
                    ↓
┌─────────────────────────────────────────────────┐
│ GitHub Releases                                 │
│ v1.0.0-beta.4 (new)                            │ ← Update system uses this
└─────────────────────────────────────────────────┘
                    ↓
            [User Updates Existing Projects]
                    ↓
┌─────────────────────────────────────────────────┐
│ project.componentVersions                       │
│ commerce-mesh: { version: "1.0.0-beta.4" }     │ ← Updated projects have this
└─────────────────────────────────────────────────┘
                    ↓
            [User Creates NEW Project]
                    ↓
┌─────────────────────────────────────────────────┐
│ NEW project clones from components.json         │
│ commerce-mesh: v1.0.0-beta.3                   │ ← OLD VERSION! ❌
└─────────────────────────────────────────────────┘
```

**Result:** New projects get outdated components, even though updates exist!

## The Solution: Manual Tag Updates

### When to Update Tags

Update `components.json` tags when:
1. A new component release is published to GitHub
2. The new version has been tested and validated
3. You want NEW projects to use the updated version

### How to Update Tags

**Step 1: Check for New Releases**

```bash
# Check what's available
curl -s https://api.github.com/repos/skukla/headless-citisignal-mesh/releases/latest | jq '.tag_name'
# Output: "v1.0.0-beta.4"
```

**Step 2: Update `components.json`**

```json
{
  "mesh": {
    "commerce-mesh": {
      "source": {
        "gitOptions": {
          "tag": "v1.0.0-beta.4"  // ← Update this
        }
      }
    }
  }
}
```

**Step 3: Test with a New Project**

Create a test project to verify the new version works correctly.

**Step 4: Commit the Change**

```bash
git add src/features/components/config/components.json
git commit -m "chore: update commerce-mesh to v1.0.0-beta.4"
```

### For All Components

Update tags for each component type:

```json
{
  "mesh": {
    "commerce-mesh": {
      "gitOptions": { "tag": "v1.0.0-beta.4" }
    }
  },
  "appBuilderApps": {
    "integration-service": {
      "gitOptions": { "tag": "v1.1.0" }
    }
  },
  "tools": {
    "commerce-demo-ingestion": {
      "gitOptions": { "tag": "v1.1.0" }
    }
  }
}
```

## Recommended Workflow

### 1. Component Release Process

When releasing a new component version:

```bash
# In the component repository
cd commerce-mesh/

# Create and push tag
git tag -a v1.0.0-beta.4 -m "Release v1.0.0-beta.4: Fix catalog endpoint"
git push origin v1.0.0-beta.4

# Create GitHub Release from tag
gh release create v1.0.0-beta.4 \
  --title "v1.0.0-beta.4" \
  --notes "**Changes:**
- Fixed catalog service endpoint variable name
- Improved error handling
"
```

### 2. Demo Builder Update Process

After the component release:

```bash
# In demo-builder-vscode repository
cd demo-builder-vscode/

# Update the tag in components.json
# Edit: src/features/components/config/components.json

# Test with a new project
# ...create test project, verify it works...

# Commit the change
git add src/features/components/config/components.json
git commit -m "chore: update commerce-mesh to v1.0.0-beta.4"
git push
```

### 3. Extension Release Process

Finally, release the updated Demo Builder:

```bash
# Create extension release with updated component versions
npm version patch  # or minor/major
git push --follow-tags
```

## Automation Opportunities (Future)

### Option 1: Automated Tag Updates

Create a GitHub Action that:
1. Monitors component repositories for new releases
2. Automatically updates `components.json` tags
3. Creates a PR for review

### Option 2: Dynamic Version Resolution

Update the clone logic to:
1. Check GitHub API for latest release at clone time
2. Use that version unless a specific tag is pinned
3. Cache the resolved version in project state

### Option 3: Version Sync Command

Add a command: `Demo Builder: Sync Component Versions`
- Checks latest releases for all components
- Updates `components.json` with latest stable tags
- Shows a diff for review before applying

## Version Tracking Comparison

| Aspect | `components.json` | `project.componentVersions` |
|--------|-------------------|------------------------------|
| **Scope** | Global (all new projects) | Per-project (existing) |
| **Updated By** | Manual edit | Update system |
| **Used For** | Initial clone | Version tracking |
| **Format** | `tag: "v1.0.0-beta.3"` | `version: "1.0.0-beta.3"` |
| **When Changed** | Component release | User updates project |

## Best Practices

1. **Keep Tags in Sync**: Regularly update `components.json` tags to match latest releases
2. **Test Before Updating**: Always test new versions in a disposable project first
3. **Document Changes**: Add release notes when updating component tags
4. **Version Consistently**: Use semantic versioning for all components
5. **Communicate Updates**: Notify users when component defaults change

## Example: Complete Update Cycle

```bash
# 1. Component team releases new version
cd commerce-mesh/
git tag v1.0.0-beta.4
git push origin v1.0.0-beta.4
gh release create v1.0.0-beta.4

# 2. Demo Builder team updates default
cd demo-builder-vscode/
# Edit components.json: tag → v1.0.0-beta.4
git commit -m "chore: update commerce-mesh default to v1.0.0-beta.4"
git push

# 3. Users with existing projects update via UI
# Demo Builder > Check for Updates > Update Components

# 4. New projects automatically get v1.0.0-beta.4 ✅
```

## Related Documentation

- `src/features/updates/README.md` - Update system architecture
- `src/features/components/config/components.json` - Component definitions
