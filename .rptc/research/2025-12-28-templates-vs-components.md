# Research: Templates vs Components Architecture Simplification

**Date:** 2025-12-28
**Status:** Findings Complete - Ready for Implementation Planning
**Triggered by:** Confusion around `templates.json` naming and duplicate repo definitions

---

## Problem Statement

The current 4-file configuration architecture creates confusion:
- `templates.json` doesn't match the user's mental model of "template" (a complete demo package)
- Frontend repos are defined in `templates.json` while frontend *types* are in `components.json`
- "Brand" is internal jargon that wouldn't be clear to new developers

User's definition of template:
> "A template in our language is a combination or collection of components, tools, and data that drive an entire demo."

---

## Current Architecture (4 Files)

| File | Purpose | What It Contains |
|------|---------|------------------|
| `templates.json` | Frontend repo mappings | brand + stack → git source |
| `components.json` | Component metadata | Icons, env vars, config fields |
| `brands.json` | Content/vertical config | Store codes, DA.live sources, compatible stacks |
| `stacks.json` | Architecture definitions | frontend type + backend type + dependencies |

### What's Actually Used

**From brands.json:**
- `configDefaults` → Store codes applied to componentConfigs
- `contentSources.eds` → DA.live URL for EDS projects
- `compatibleStacks` → Filters available stack choices

**From stacks.json:**
- `frontend`, `backend`, `dependencies` → Component selection
- `requiresGitHub`, `requiresDaLive` → Wizard flow control

**From templates.json:**
- `source` → Git repo URL for frontend cloning
- `submodules` → Submodule paths

**From components.json:**
- Metadata (name, description, icons)
- Environment variable definitions
- Configuration field definitions

---

## Key Insight: Two Demo Modes

1. **Blank demo** → User picks components (stack), provides their own config
2. **Branded demo** → User picks a demo package, everything comes pre-configured

This means:
- For blank demos: No package needed, just component selection
- For branded demos: The "brand" IS the complete package

Everything in a "brand" is cohesive:
- CitiSignal store codes need CitiSignal backend catalog
- CitiSignal DA.live content is branded content
- CitiSignal frontend repo matches the store codes

You wouldn't mix CitiSignal store codes with a Carvelo frontend.

---

## Proposed Architecture (3 Files)

| File | Purpose | Description |
|------|---------|-------------|
| `stacks.json` | Architecture choices | "What architecture do you want?" |
| `components.json` | Component definitions | "What components exist?" |
| `demo-packages.json` | Complete demo configs | "What ready-to-go demos are available?" |

### demo-packages.json Structure

```json
{
  "$schema": "./demo-packages.schema.json",
  "version": "1.0.0",
  "packages": [
    {
      "id": "citisignal",
      "name": "CitiSignal",
      "description": "Telecommunications demo with CitiSignal branding",
      "icon": "citisignal",
      "featured": true,
      "compatibleStacks": ["headless-paas", "eds-paas", "eds-accs"],
      "configDefaults": {
        "ADOBE_COMMERCE_WEBSITE_CODE": "citisignal",
        "ADOBE_COMMERCE_STORE_CODE": "citisignal_store",
        "ADOBE_COMMERCE_STORE_VIEW_CODE": "citisignal_us"
      },
      "contentSources": {
        "eds": "main--accs-citisignal--demo-system-stores.aem.live"
      },
      "storefronts": {
        "headless": {
          "source": {
            "type": "git",
            "url": "https://github.com/skukla/citisignal-nextjs",
            "branch": "master",
            "gitOptions": { "shallow": false, "recursive": false }
          },
          "submodules": {
            "demo-inspector": {
              "path": "src/demo-inspector",
              "repository": "skukla/demo-inspector"
            }
          }
        },
        "eds": {
          "source": {
            "type": "git",
            "url": "https://github.com/skukla/citisignal-one",
            "branch": "main",
            "gitOptions": { "shallow": true, "recursive": false }
          }
        }
      }
    }
  ]
}
```

### Resolution Flow

1. User selects **stack** (e.g., `headless-paas`) → determines frontend type (`headless`) + backend type
2. User selects **demo package** (e.g., `citisignal`) → or none for blank demo
3. System looks up `packages[citisignal].storefronts[headless].source` → git repo
4. System applies `packages[citisignal].configDefaults` → store codes

---

## Changes Summary

### Files to Create
- `demo-packages.json` - New merged file
- `demo-packages.schema.json` - JSON schema for validation

### Files to Delete
- `brands.json` - Merged into demo-packages.json
- `brands.schema.json` - Replaced by demo-packages.schema.json
- `templates.json` - Merged into demo-packages.json
- `templates.schema.json` - Replaced by demo-packages.schema.json

### Code Changes Required
- Update type definitions (`src/types/brands.ts` → `src/types/demoPackages.ts`)
- Update loaders (brandLoader, templateLoader → demoPackageLoader)
- Update wizard helpers (buildProjectConfig, applyBrandDefaults, etc.)
- Update executor.ts to use new structure
- Update all imports/references throughout codebase
- Update tests

---

## Naming Decision

**Rejected names:**
- `brands` - Internal jargon, unclear to new devs
- `templates` - Conflicts with user's mental model
- `demos` - Too generic
- `presets` - Doesn't convey what's inside
- `verticals` - Still jargon

**Chosen name:** `demo-packages`
- Clear and descriptive
- A new dev understands immediately: "These are ready-to-go demo configurations"
- Explicit about containing a complete package

---

## Benefits

1. **Clearer mental model** - "demo package" matches user expectation
2. **Fewer files** - 4 → 3 configuration files
3. **No duplication** - Repo source lives in one place (the package)
4. **Better discoverability** - New devs understand the structure immediately
5. **Cohesive packages** - All related config in one object

---

## Next Steps

1. Create implementation plan for the refactoring
2. Create new `demo-packages.json` with merged data
3. Create schema file
4. Update type definitions
5. Update loaders and helpers
6. Update executor and wizard
7. Update all tests
8. Delete old files
9. Update documentation
