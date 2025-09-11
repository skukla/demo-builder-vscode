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
├── logging.json           # Logging message templates (NEW)
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