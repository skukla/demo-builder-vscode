# Templates Module

## Overview

The templates directory contains all configuration files that drive the Demo Builder's behavior. These JSON files define available components, prerequisites, and project templates in a declarative, maintainable format.

## Directory Structure

```
templates/
├── prerequisites.json       # Tool requirements and installation
├── prerequisites.schema.json # JSON schema for validation
├── components.json         # Available project components
├── defaults.json          # Default component selections
├── wizard-steps.json      # Wizard timeline configuration
├── logging.json           # Logging message templates
├── stacks.json            # Technology stack definitions (frontend + backend)
├── stacks.schema.json     # JSON schema for stacks
├── demo-packages.json     # Demo packages with storefronts (brands + content)
├── demo-packages.schema.json # JSON schema for demo packages
├── templates.json         # Pre-configured demo templates (stack + package combinations)
├── templates.schema.json  # JSON schema for templates
├── project-templates/      # Project scaffolding templates
└── scripts/               # Installation and setup scripts
```

## Prerequisites System

### prerequisites.json Structure

**Top-level Structure**:
```json
{
  "prerequisites": [...],      // Tool definitions
  "componentRequirements": {...} // Component-specific requirements
}
```

**Prerequisite Definition**:
```json
{
  "id": "node",
  "name": "Node.js",
  "description": "JavaScript runtime",
  "multiVersion": true,        // Supports multiple versions
  "check": {
    "command": "node --version",
    "parseVersion": "v([0-9.]+)"
  },
  "install": {
    "steps": [
      {
        "name": "Install Node {version}",
        "commandTemplate": "fnm install {version}",
        "progressStrategy": "exact",
        "estimatedDuration": 30000
      }
    ]
  }
}
```

### Adding a New Prerequisite

1. **Define the prerequisite**:
```json
{
  "id": "docker",
  "name": "Docker",
  "description": "Container platform",
  "check": {
    "command": "docker --version",
    "parseVersion": "Docker version ([0-9.]+)"
  },
  "install": {
    "steps": [
      {
        "name": "Install Docker",
        "commands": ["brew install --cask docker"],
        "progressStrategy": "milestones",
        "milestones": [
          { "pattern": "Downloading", "progress": 30, "message": "Downloading..." },
          { "pattern": "Installing", "progress": 70, "message": "Installing..." },
          { "pattern": "🍺", "progress": 100, "message": "Installed!" }
        ]
      }
    ]
  }
}
```

2. **Add component requirements** (if needed):
```json
"componentRequirements": {
  "container-service": {
    "prerequisites": ["docker"],
    "nodeVersions": []
  }
}
```

### Progress Tracking Strategies

**1. Exact Progress** (`exact`):
```json
{
  "progressStrategy": "exact",
  "progressParser": "fnm"  // Uses built-in parser
}
```

**2. Milestone-Based** (`milestones`):
```json
{
  "progressStrategy": "milestones",
  "milestones": [
    { "pattern": "==> Downloading", "progress": 25, "message": "Downloading..." },
    { "pattern": "==> Pouring", "progress": 50, "message": "Installing..." },
    { "pattern": "==> Summary", "progress": 90, "message": "Finishing..." },
    { "pattern": "🍺", "progress": 100, "message": "Complete!" }
  ]
}
```

**3. Synthetic Progress** (`synthetic`):
```json
{
  "progressStrategy": "synthetic",
  "estimatedDuration": 45000  // 45 seconds
}
```

**4. Immediate** (`immediate`):
```json
{
  "progressStrategy": "immediate"  // Instant completion
}
```

### Special Prerequisites

**Node.js (Multi-version)**:
```json
{
  "id": "node",
  "multiVersion": true,
  "install": {
    "dynamic": true,  // Version determined at runtime
    "steps": [
      {
        "commandTemplate": "fnm install {version}"
      }
    ]
  }
}
```

**Adobe I/O CLI (With Plugins)**:
```json
{
  "id": "aio-cli",
  "plugins": [
    {
      "id": "api-mesh",
      "name": "API Mesh Plugin",
      "check": {
        "command": "aio plugins",
        "contains": "@adobe/aio-cli-plugin-api-mesh"
      },
      "install": {
        "commands": ["aio plugins:install @adobe/aio-cli-plugin-api-mesh"]
      },
      "requiredFor": ["commerce-mesh"]
    }
  ]
}
```

## Demo Packages System (Vertical Stack Architecture)

### Overview

The demo packages system follows a "vertical stack architecture" where:
1. **Stacks** define the technology combination (frontend + backend + dependencies)
2. **Demo Packages** define the brand/content (storefronts keyed by stack ID)
3. **Templates** combine a stack + package for pre-configured demo scenarios

This enables a "demo-first" workflow where users select a package and stack on the Welcome step, which automatically pre-populates component selections.

### stacks.json Structure

Defines technology stack combinations:

```json
{
  "$schema": "./stacks.schema.json",
  "version": "1.0.0",
  "stacks": [
    {
      "id": "headless-paas",
      "name": "Headless + PaaS",
      "description": "NextJS storefront with API Mesh and Commerce PaaS",
      "frontend": "headless",
      "backend": "adobe-commerce-paas",
      "dependencies": ["commerce-mesh", "demo-inspector"],
      "optionalAddons": ["adobe-commerce-aco"]
    }
  ]
}
```

### demo-packages.json Structure

Defines demo packages with storefronts per stack:

```json
{
  "$schema": "./demo-packages.schema.json",
  "version": "1.0.0",
  "packages": [
    {
      "id": "citisignal",
      "name": "CitiSignal",
      "description": "Telecommunications demo with CitiSignal branding",
      "featured": true,
      "configDefaults": {
        "ADOBE_COMMERCE_WEBSITE_CODE": "citisignal",
        "ADOBE_COMMERCE_STORE_CODE": "citisignal_store"
      },
      "storefronts": {
        "headless-paas": {
          "name": "CitiSignal Headless",
          "description": "NextJS storefront with API Mesh",
          "source": {
            "type": "git",
            "url": "https://github.com/example/citisignal-headless",
            "branch": "main"
          }
        },
        "eds-paas": {
          "name": "CitiSignal EDS",
          "description": "Edge Delivery Services storefront",
          "source": {
            "type": "git",
            "url": "https://github.com/example/citisignal-eds",
            "branch": "main"
          }
        }
      }
    }
  ]
}
```

### Demo Package Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier (lowercase, hyphen-separated) |
| `name` | string | Yes | Display name for the package |
| `description` | string | Yes | Description of the package |
| `featured` | boolean | No | Whether to highlight this package |
| `configDefaults` | object | No | Environment variable defaults |
| `storefronts` | object | Yes | Storefront definitions keyed by stack ID |

### Storefront Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Display name for the storefront |
| `description` | string | Yes | Description of the storefront |
| `source` | object | Yes | Git source configuration |
| `source.type` | string | Yes | Always "git" |
| `source.url` | string | Yes | Git repository URL |
| `source.branch` | string | Yes | Branch to clone |

### Adding a New Demo Package

1. **Define the package in demo-packages.json**:
```json
{
  "id": "my-brand",
  "name": "My Brand",
  "description": "Description of this brand/demo",
  "configDefaults": {
    "ADOBE_COMMERCE_WEBSITE_CODE": "my_brand"
  },
  "storefronts": {
    "headless-paas": {
      "name": "My Brand Headless",
      "description": "NextJS storefront",
      "source": {
        "type": "git",
        "url": "https://github.com/org/my-brand-headless",
        "branch": "main"
      }
    }
  }
}
```

2. **Ensure stack IDs exist**: All storefront keys must match stack IDs in `stacks.json`.

3. **Validate the package**: The schema (`demo-packages.schema.json`) validates structure.

### Package Loader

Packages are loaded via `src/features/project-creation/ui/helpers/demoPackageLoader.ts`:

```typescript
import { loadDemoPackages } from './demoPackageLoader';

// Load all packages
const packages = await loadDemoPackages();

// Get storefront for a specific stack
const storefront = packages.find(p => p.id === 'citisignal')?.storefronts['headless-paas'];
```

### Type Definitions

Package types are defined in `src/types/demoPackages.ts`:

- `DemoPackage` - Single package definition with storefronts
- `Storefront` - Storefront configuration for a specific stack
- `GitSource` - Git source configuration
- `DemoPackagesConfig` - Root configuration structure

### templates.json Structure

Pre-configured templates combining stack + package:

```json
{
  "$schema": "./templates.schema.json",
  "version": "1.0.0",
  "templates": [
    {
      "id": "citisignal-headless",
      "name": "CitiSignal Headless",
      "description": "CitiSignal with NextJS and API Mesh",
      "stack": "headless-paas",
      "brand": "citisignal",
      "featured": true,
      "source": {
        "type": "git",
        "url": "https://github.com/example/citisignal-headless",
        "branch": "main"
      }
    }
  ]
}
```

## Wizard Steps Configuration

### wizard-steps.json Structure

The `wizard-steps.json` file provides a simple configuration layer for customizing the wizard timeline without modifying React code.

```json
{
  "steps": [
    {
      "id": "welcome",           // Must match WizardStep type
      "name": "Project Setup",    // Display name in timeline
      "enabled": true            // Show/hide this step
    }
  ]
}
```

### Customization Options

**Change Step Names**:
```json
{
  "id": "component-selection",
  "name": "Choose Your Stack",  // Custom display name
  "enabled": true
}
```

**Disable Steps** (for simplified flows):
```json
{
  "id": "commerce-config",
  "name": "Commerce",
  "enabled": false  // Skip this step entirely
}
```

**Reorder Steps**:
Simply change the order of objects in the array. The wizard will follow the sequence defined in the JSON.

### Use Cases

1. **Quick Demo Mode**: Disable auth/org/project steps for internal demos
2. **Simplified Flow**: Remove advanced configuration steps
3. **Custom Branding**: Rename steps for different audiences
4. **A/B Testing**: Test different wizard flows

### Implementation Notes

- Changes take effect on next extension activation
- Invalid step IDs are ignored (fallback to defaults)
- All steps must have corresponding React components
- The timeline dynamically adjusts to show only enabled steps

## Logging Templates

### logging.json Structure

The `logging.json` file provides consistent, reusable message templates for the StepLogger system:

```json
{
  "operations": {
    "checking": "Checking {item}...",
    "fetching": "Fetching {item}...",
    "installing": "Installing {item}...",
    "creating": "Creating {item}...",
    "authenticating": "Authenticating with {item}..."
  },
  "statuses": {
    "found": "Found {count} {item}",
    "found-version": "{item} found: {version}",
    "installed": "{item} installed: {version}",
    "authenticated": "Authenticated: {organization}",
    "selected": "Selected: {item}"
  }
}
```

### Template Usage

Templates support parameter substitution using `{placeholder}` syntax:

```typescript
// In code
stepLogger.logTemplate('adobe-auth', 'operations.fetching', { item: 'organizations' });
// Output: [Adobe Setup] Fetching organizations...

stepLogger.logTemplate('prerequisites', 'statuses.found-version', { 
    item: 'Node.js', 
    version: '20.11.0' 
});
// Output: [Prerequisites] Node.js found: 20.11.0
```

### Adding New Templates

1. **Add to operations** for actions in progress:
```json
"operations": {
  "validating": "Validating {item}...",
  "deploying": "Deploying {item} to {environment}..."
}
```

2. **Add to statuses** for state descriptions:
```json
"statuses": {
  "deployed": "Successfully deployed to {environment}",
  "validation-failed": "Validation failed: {reason}"
}
```

### Benefits

- **Consistency**: All messages follow the same format
- **Maintainability**: Change wording in one place
- **Localization Ready**: Templates can be swapped for different languages
- **Reduced Duplication**: No hardcoded strings throughout codebase

## Components System

### components.json Structure

```json
{
  "components": {
    "frontend": [
      {
        "id": "citisignal-nextjs",
        "name": "CitiSignal Next.js",
        "description": "Modern Next.js storefront",
        "dependencies": [],
        "prerequisites": ["node"],
        "nodeVersion": "20.11.0"
      }
    ],
    "backend": [
      {
        "id": "commerce-mesh",
        "name": "Commerce API Mesh",
        "description": "GraphQL mesh layer",
        "dependencies": ["aio-cli"],
        "prerequisites": ["node", "aio-cli"],
        "plugins": ["api-mesh"],
        "nodeVersion": "18.20.0"
      }
    ],
    "appBuilder": [
      {
        "id": "kukla-integration",
        "name": "Kukla Integration Service",
        "description": "Custom integration service",
        "nodeVersion": "22.0.0"
      }
    ]
  }
}
```

### Component Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `name` | string | Display name |
| `description` | string | User-facing description |
| `dependencies` | string[] | Other component IDs required |
| `prerequisites` | string[] | Tool IDs from prerequisites.json |
| `plugins` | string[] | Plugin IDs required |
| `nodeVersion` | string | Required Node.js version |
| `optional` | boolean | Whether component is optional |

### Component Dependencies

Dependencies are resolved automatically:
```json
{
  "id": "pwa-studio",
  "dependencies": ["commerce-backend", "graphql-server"]
}
```

This ensures:
- commerce-backend is installed first
- graphql-server is installed second
- pwa-studio is installed last

### Component Version Tracking

**Purpose**: Track component versions for update system (v1.6.0+)

**Storage Location**: Project manifest (`.demo-builder.json`)

**Structure**:
```json
{
  "name": "my-demo-project",
  "componentInstances": {
    "citisignal-nextjs": {
      "id": "citisignal-nextjs",
      "path": "/path/to/citisignal-nextjs",
      "status": "ready",
      "port": 3000
    }
  },
  "componentVersions": {
    "citisignal-nextjs": {
      "version": "1.0.0",
      "lastUpdated": "2025-01-15T10:30:00Z"
    }
  }
}
```

**Version Lifecycle**:

1. **Project Creation**: Set to `"unknown"` when project is created
   ```json
   {
     "componentVersions": {
       "citisignal-nextjs": {
         "version": "unknown",
         "lastUpdated": "2025-01-15T10:00:00Z"
       }
     }
   }
   ```

2. **First Update**: Set to actual version after first component update
   ```json
   {
     "componentVersions": {
       "citisignal-nextjs": {
         "version": "1.0.0",
         "lastUpdated": "2025-01-15T10:30:00Z"
       }
     }
   }
   ```

3. **Subsequent Updates**: Updated after each successful component update
   ```json
   {
     "componentVersions": {
       "citisignal-nextjs": {
         "version": "1.1.0",
         "lastUpdated": "2025-01-20T14:22:00Z"
       }
     }
   }
   ```

**Version Detection Flow**:
```typescript
// 1. Get current version from project manifest
const current = project.componentVersions[componentId]?.version || 'unknown';

// 2. Fetch latest release from GitHub
const latest = await updateManager.fetchLatestRelease(
    component.repository,
    channel
);

// 3. Compare versions
if (isNewerVersion(latest.version, current)) {
    // Show update notification
    vscode.window.showInformationMessage(
        `Update available for ${component.name}: ${latest.version}`,
        'Update Now'
    );
}
```

**Integration Points**:
- **UpdateManager**: Checks versions against GitHub Releases
- **ComponentUpdater**: Updates version after successful component update
- **Project Creation**: Initializes version tracking structure

**Update Channels**:
- **stable**: Production releases only (e.g., `v1.0.0`, `v1.1.0`)
- **beta**: Pre-release versions included (e.g., `v1.1.0-beta.1`)

## Project Templates

### Template Structure

```
project-templates/
├── commerce-paas/
│   ├── template.json      # Template metadata
│   ├── files/            # Files to copy
│   └── scripts/          # Setup scripts
└── commerce-saas/
    ├── template.json
    ├── files/
    └── scripts/
```

### Template Definition

```json
{
  "id": "commerce-paas",
  "name": "Commerce PaaS",
  "description": "Platform-as-a-Service deployment",
  "components": {
    "required": ["commerce-backend"],
    "optional": ["pwa-studio", "api-mesh"]
  },
  "scripts": {
    "setup": "scripts/setup.sh",
    "postInstall": "scripts/post-install.sh"
  }
}
```

## Validation & Schema

### Using JSON Schema

The `prerequisites.schema.json` ensures:
- Required fields are present
- Data types are correct
- Patterns are valid regex
- References exist

### Validation in Code

```typescript
import schema from './prerequisites.schema.json';
import Ajv from 'ajv';

const ajv = new Ajv();
const validate = ajv.compile(schema);

if (!validate(data)) {
    console.error(validate.errors);
}
```

## Best Practices

### 1. Milestone Design
- Start at 20-30% for initial operations
- Space evenly throughout process
- Always include 100% completion marker
- Use clear, action-oriented messages

### 2. Duration Estimates
- Be conservative (better to finish early)
- Test on slower machines
- Account for network latency
- Add buffer for edge cases

### 3. Error Messages
- Provide actionable solutions
- Include troubleshooting steps
- Never expose internal errors
- Log details for debugging

### 4. Version Management
- Use semantic versioning
- Document breaking changes
- Support version ranges where possible
- Handle missing versions gracefully

## Testing Templates

### Manual Testing
1. Clear all caches
2. Test fresh installation
3. Test with existing tools
4. Test failure scenarios
5. Verify progress accuracy
6. Check all milestones hit

### Automated Validation
```bash
# Validate JSON syntax
npx ajv validate -s prerequisites.schema.json -d prerequisites.json

# Test pattern matching
node scripts/test-patterns.js
```

## Common Patterns

### Dynamic Commands
Use `{placeholder}` syntax:
```json
{
  "commandTemplate": "npm install -g {package}@{version}"
}
```

### Conditional Installation
```json
{
  "condition": {
    "platform": "darwin",  // macOS only
    "check": "which brew"  // Only if homebrew exists
  }
}
```

### Post-Installation Messages
```json
{
  "postInstall": {
    "message": "Please restart your terminal for changes to take effect",
    "action": "restart-terminal"
  }
}
```

## Troubleshooting

### Prerequisites Not Detected
- Check command output format
- Verify regex pattern
- Test in terminal directly
- Check PATH environment

### Installation Fails
- Verify commands work manually
- Check permissions
- Look for missing dependencies
- Review error logs

### Progress Not Updating
- Check milestone patterns match exactly
- Verify output goes to stdout
- Test with verbose flags
- Check progressStrategy setting

---

For implementation details, see `../src/utils/prerequisitesManager.ts`
For UI details, see `../src/webviews/components/steps/PrerequisitesStep.tsx`