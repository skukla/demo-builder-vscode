# Step 8: Update Documentation

## Purpose

Update CLAUDE.md files to reflect the new demo-packages architecture. This step ensures documentation accurately describes the unified `demo-packages.json` structure, removing references to the deprecated `brands.json` and `templates.json` files.

## Prerequisites

- [ ] Step 7 complete (verification sweep confirmed no orphaned code)
- [ ] All source code changes complete and tested
- [ ] Old files deleted (brands.json, templates.json, associated types/loaders)

## Tests to Write First

Documentation updates are verified through manual review and structural validation. No unit tests required.

- [ ] **Validation: templates/CLAUDE.md accurately documents demo-packages.json**
  - **Given:** Updated templates/CLAUDE.md
  - **When:** Developer reads the documentation
  - **Then:** Structure, properties, and usage examples match actual demo-packages.json

- [ ] **Validation: No references to deleted files remain in documentation**
  - **Given:** All CLAUDE.md files updated
  - **When:** Grep for "brands.json", "templates.json", "demo-templates.json"
  - **Then:** No matches found (except in .rptc/complete/ archive)

- [ ] **Validation: Root CLAUDE.md key files section is accurate**
  - **Given:** Updated CLAUDE.md
  - **When:** Developer reviews "Key Files to Understand" section
  - **Then:** References demo-packages.json (not demo-templates.json)

## Files to Modify

- [ ] `templates/CLAUDE.md` - Major update: Replace "Demo Templates System" with "Demo Packages System"
- [ ] `CLAUDE.md` (root) - Minor update: Update "Key Files to Understand" section

## Implementation Details

### Phase 1: Update templates/CLAUDE.md

**Location:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/templates/CLAUDE.md`

**Changes Required:**

#### 1. Update Directory Structure (lines 7-21)

Replace:
```markdown
templates/
├── prerequisites.json       # Tool requirements and installation
├── prerequisites.schema.json # JSON schema for validation
├── components.json         # Available project components
├── defaults.json          # Default component selections
├── wizard-steps.json      # Wizard timeline configuration
├── logging.json           # Logging message templates
├── demo-templates.json    # Demo template definitions (pre-configured selections)
├── demo-templates.schema.json # JSON schema for demo templates
├── project-templates/      # Project scaffolding templates
└── scripts/               # Installation and setup scripts
```

With:
```markdown
templates/
├── prerequisites.json       # Tool requirements and installation
├── prerequisites.schema.json # JSON schema for validation
├── components.json         # Available project components
├── stacks.json            # Technology stack definitions
├── demo-packages.json     # Demo package definitions (brand + stack + defaults)
├── demo-packages.schema.json # JSON schema for demo packages
├── defaults.json          # Default component selections
├── wizard-steps.json      # Wizard timeline configuration
├── logging.json           # Logging message templates
├── project-templates/      # Project scaffolding templates
└── scripts/               # Installation and setup scripts
```

#### 2. Replace "Demo Templates System" Section (lines 175-291)

Replace the entire "Demo Templates System" section with the new "Demo Packages System" section:

```markdown
## Demo Packages System

### Overview

The demo packages system provides a unified configuration for demo project setup. Each package combines:
- **Brand identity** (name, description, content sources)
- **Technology stack reference** (which stack.json stack to use)
- **Default component selections** (pre-configured wizard defaults)

This replaces the previous split architecture (brands.json + templates.json) with a single, self-contained definition per demo package.

### demo-packages.json Structure

**Top-level Structure**:
```json
{
  "$schema": "./demo-packages.schema.json",
  "version": "1.0.0",
  "packages": [...]
}
```

**Package Definition**:
```json
{
  "id": "citisignal",
  "name": "CitiSignal",
  "description": "Mobile telecommunications brand",
  "icon": "citisignal",
  "featured": true,
  "tags": ["telecom", "mobile", "headless"],
  "stack": "eds-commerce",
  "configDefaults": {
    "storeCode": "citi",
    "storeName": "CitiSignal",
    "currency": "USD"
  },
  "contentSources": {
    "daLive": "https://main--citisignal--hlxsites.aem.live"
  },
  "defaults": {
    "frontend": "citisignal-one",
    "backend": "adobe-commerce-cloud",
    "integrations": ["commerce-mesh"],
    "appBuilder": []
  }
}
```

### Package Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (lowercase, hyphen-separated) |
| `name` | string | Yes | Display name for the package card |
| `description` | string | Yes | Description of what this package includes |
| `stack` | string | Yes | Reference to stack ID in stacks.json |
| `defaults` | object | Yes | Default component selections |
| `icon` | string | No | Icon identifier for the package card |
| `tags` | string[] | No | Tags for filtering and categorization |
| `featured` | boolean | No | Whether to highlight this package |
| `configDefaults` | object | No | Store configuration defaults |
| `contentSources` | object | No | DA.live and other content source URLs |

### Defaults Object

The `defaults` object maps to component IDs from `components.json`:

| Property | Type | Description |
|----------|------|-------------|
| `frontend` | string | Frontend component ID (e.g., 'citisignal-one') |
| `backend` | string | Backend component ID (e.g., 'adobe-commerce-cloud') |
| `integrations` | string[] | Array of integration component IDs |
| `appBuilder` | string[] | Array of App Builder app component IDs |

### Adding a New Demo Package

1. **Define the package in demo-packages.json**:
```json
{
  "id": "my-demo",
  "name": "My Custom Demo",
  "description": "Description of what this demo includes",
  "stack": "eds-commerce",
  "defaults": {
    "frontend": "my-frontend-component",
    "backend": "adobe-commerce-cloud",
    "integrations": ["commerce-mesh"]
  }
}
```

2. **Ensure component IDs exist**: All component IDs in `defaults` must match IDs defined in `components.json`.

3. **Ensure stack ID exists**: The `stack` value must match an ID in `stacks.json`.

4. **Validate the package**: The schema (`demo-packages.schema.json`) validates:
   - Required fields are present
   - ID follows lowercase hyphen pattern
   - All properties have correct types

### Package Loader

Packages are loaded via `src/features/project-creation/ui/helpers/demoPackageLoader.ts`:

```typescript
import { loadDemoPackages, getDemoPackageById } from './demoPackageLoader';

// Load all packages
const packages = loadDemoPackages();

// Get a specific package
const citisignal = getDemoPackageById('citisignal');
```

### Type Definitions

Package types are defined in `src/types/demoPackages.ts`:

- `DemoPackage` - Single package definition
- `DemoPackageDefaults` - Component selection defaults
- `DemoPackageConfigDefaults` - Store configuration defaults
- `DemoPackageContentSources` - Content source URLs
- `DemoPackagesConfig` - Root configuration structure
```

#### 3. Remove Obsolete brandStackLoader References

If any section references `brandStackLoader.ts`, `brandDefaults.ts`, or `templateLoader.ts`, update to reference `demoPackageLoader.ts` instead.

### Phase 2: Update Root CLAUDE.md

**Location:** `/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/CLAUDE.md`

**Changes Required:**

#### Update "Key Files to Understand" Section (line 177)

Replace:
```markdown
10. **templates/demo-templates.json** - Demo template definitions (pre-configured component selections)
```

With:
```markdown
10. **templates/demo-packages.json** - Demo package definitions (brand identity + stack + component defaults)
```

#### Update "Modifying Wizard Steps" Section (line 191)

Replace:
```markdown
-> Note: WelcomeStep includes demo template selection (see `templates/CLAUDE.md` for demo templates documentation)
```

With:
```markdown
-> Note: WelcomeStep includes demo package selection (see `templates/CLAUDE.md` for demo packages documentation)
```

### Phase 3: Verify No Stale References

**Verification Commands:**

Run these grep commands to verify no stale references remain:

```bash
# Check for old file references (should find 0 in active code)
grep -r "brands\.json" --include="*.md" . | grep -v ".rptc/complete" | grep -v ".rptc/research"
grep -r "demo-templates\.json" --include="*.md" . | grep -v ".rptc/complete" | grep -v ".rptc/research"
grep -r "templates\.json" --include="*.md" . | grep -v ".rptc/complete" | grep -v ".rptc/research" | grep -v "demo-packages"

# Verify new references exist
grep -r "demo-packages\.json" --include="*.md" .
```

Expected results:
- First 3 commands: No matches (or only in archive directories)
- Last command: Matches in templates/CLAUDE.md and CLAUDE.md

## Expected Outcome

After this step:
- `templates/CLAUDE.md` accurately documents the demo-packages.json structure
- Root `CLAUDE.md` references demo-packages.json in key files section
- No documentation references deprecated brands.json or templates.json files
- Developers can understand the new architecture from documentation alone

## Acceptance Criteria

- [ ] templates/CLAUDE.md "Demo Packages System" section complete with:
  - [ ] Accurate directory structure listing
  - [ ] JSON structure example matching actual demo-packages.json
  - [ ] Property table documenting all fields
  - [ ] "Adding a New Demo Package" guide
  - [ ] Loader usage examples
  - [ ] Type definitions reference
- [ ] Root CLAUDE.md updated:
  - [ ] Key files section references demo-packages.json
  - [ ] WelcomeStep note references demo packages (not templates)
- [ ] Verification grep commands confirm no stale references
- [ ] Documentation passes review for accuracy and completeness

## Estimated Time

1 hour

---

## Implementation Notes

**Key Documentation Philosophy:**
- Focus on what developers need to know to ADD new packages
- Include concrete examples matching actual file structure
- Reference related files (components.json, stacks.json) to show relationships
- Keep consistent with existing CLAUDE.md documentation style

**Files NOT Modified:**
- `.rptc/CLAUDE.md` - Does not reference specific JSON configuration files
- `.rptc/complete/*` - Archive directories preserved as historical record
- `.rptc/research/*` - Research documents preserved as historical record
