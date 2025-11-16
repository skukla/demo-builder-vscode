# Component System Documentation

## Overview

The Demo Builder VSCode Extension uses a flexible component-based architecture that allows users to mix and match different frontend frameworks, backend systems, and optional dependencies to create customized demo environments.

## Architecture

### Component Types

1. **Frontend Components**: User-facing applications (e.g., NextJS storefronts)
2. **Backend Components**: Commerce platforms and data sources
3. **Dependencies**: Supporting tools and services (required or optional)
4. **External Systems**: Third-party integrations (e.g., Target, Experience Platform)
5. **App Builder Apps**: Custom Adobe App Builder applications

### Component Registry

All components are defined in `templates/components.json`, which serves as the single source of truth for available components and their relationships.

## Component Definition Structure

### Frontend Component Example

```json
{
  "id": "citisignal-nextjs",
  "name": "CitiSignal NextJS Headless Storefront",
  "description": "Modern, performant NextJS-based storefront",
  "source": {
    "type": "git",
    "url": "https://github.com/adobe/citisignal-nextjs.git",
    "branch": "main"
  },
  "dependencies": {
    "required": ["commerce-mesh"],
    "optional": ["demo-inspector"]
  },
  "compatibleBackends": ["adobe-commerce-paas", "adobe-commerce-saas"],
  "configuration": {
    "envVars": ["MESH_ENDPOINT", "ADOBE_COMMERCE_URL"],
    "port": 3000,
    "nodeVersion": "20"
  }
}
```

### Backend Component Example

```json
{
  "id": "adobe-commerce-paas",
  "name": "Adobe Commerce (Platform-as-a-Service)",
  "configuration": {
    "required": {
      "commerceUrl": {
        "type": "url",
        "label": "Commerce Instance URL"
      },
      "environmentId": {
        "type": "string",
        "label": "Environment ID"
      }
    },
    "services": [
      {
        "id": "catalog-service",
        "name": "Catalog Service",
        "required": false,
        "requiresApiKey": true
      }
    ]
  }
}
```

## Dependency Resolution

### Required vs Optional Dependencies

- **Required Dependencies**: Automatically included when a component is selected
- **Optional Dependencies**: User can choose to include based on needs

### Dependency Chain Validation

The system validates:
- Circular dependencies
- Version conflicts
- Compatibility issues

## User Workflow

### 1. Component Selection

Users can choose between:
- **Presets**: Pre-configured component combinations
- **Custom Selection**: Choose individual components

### 2. Dependency Management

The wizard:
1. Automatically includes required dependencies
2. Presents optional dependencies with impact indicators
3. Validates the complete dependency chain

### 3. Configuration Generation

Based on selections, the system generates:
- Environment variables
- Service configurations
- Deployment settings

## External Systems Integration

External systems provide optional integrations with Adobe Experience Cloud services:

### Experience Platform
```json
{
  "id": "experience-platform",
  "name": "Experience Platform",
  "description": "Adobe Experience Platform integration via Commerce Data Sharing",
  "requiresApiKey": true,
  "endpoint": "https://platform.adobe.io",
  "configuration": {
    "datastream": {
      "type": "string",
      "required": true
    }
  }
}
```

## App Builder Applications

App Builder apps extend functionality with custom serverless applications:

### Kukla Integration Service
```json
{
  "id": "integration-service",
  "name": "Kukla Integration Service",
  "description": "Custom integration service for Target Product Recommendations, AEM Assets, and more",
  "source": {
    "type": "git",
    "url": "https://github.com/skukla/kukla-integration-service"
  },
  "requiresDeployment": true,
  "configuration": {
    "runtime": "nodejs:18",
    "actions": ["browse-files", "get-products", "download-file", "delete-file"]
  }
}
```

These apps are deployed to Adobe I/O Runtime and provide custom business logic and integrations.

## Adding New Components

### Step 1: Define Component in Registry

Add the component definition to `templates/components.json`:

```json
{
  "id": "my-new-frontend",
  "name": "My Custom Frontend",
  "type": "frontend",
  "source": {
    "type": "git",
    "url": "https://github.com/myorg/my-frontend.git"
  },
  "dependencies": {
    "required": ["commerce-mesh"],
    "optional": []
  },
  "compatibleBackends": ["adobe-commerce-paas"]
}
```

### Step 2: Update Compatibility Matrix

Add compatibility information:

```json
"compatibilityMatrix": {
  "my-new-frontend": {
    "adobe-commerce-paas": {
      "compatible": true,
      "recommended": true,
      "notes": "Full support for all features"
    }
  }
}
```

### Step 3: Test Integration

1. Validate JSON against schema
2. Test component selection in wizard
3. Verify dependency resolution
4. Test installation process

## API Reference

### ComponentRegistryManager

```typescript
class ComponentRegistryManager {
  loadRegistry(): Promise<ComponentRegistry>
  getFrontends(): Promise<ComponentDefinition[]>
  getBackends(): Promise<ComponentDefinition[]>
  getDependencies(): Promise<ComponentDefinition[]>
  getExternalSystems(): Promise<ComponentDefinition[]>
  getAppBuilder(): Promise<ComponentDefinition[]>
  getComponentById(id: string): Promise<ComponentDefinition>
  checkCompatibility(frontend: string, backend: string): Promise<boolean>
}
```

### DependencyResolver

```typescript
class DependencyResolver {
  resolveDependencies(
    frontend: string,
    backend: string,
    selectedOptional: string[]
  ): Promise<ResolvedDependencies>
  
  validateDependencyChain(
    dependencies: ComponentDefinition[]
  ): Promise<ValidationResult>
  
  generateConfiguration(
    frontend: ComponentDefinition,
    backend: ComponentDefinition,
    dependencies: ComponentDefinition[]
  ): Promise<Configuration>
}
```

## Configuration Output

The component system generates a configuration object that includes:

```typescript
{
  envVars: {
    MESH_ENDPOINT: "${MESH_ENDPOINT}",
    DEMO_INSPECTOR_ENABLED: "true"
  },
  frontend: {
    id: "citisignal-nextjs",
    port: 3000,
    nodeVersion: "20"
  },
  backend: {
    id: "adobe-commerce-paas",
    configuration: { /* backend-specific config */ }
  },
  dependencies: [
    {
      id: "commerce-mesh",
      type: "mesh",
      configuration: { /* dependency config */ }
    }
  ]
}
```

## Benefits

1. **Flexibility**: Mix and match components
2. **Maintainability**: Centralized component definitions
3. **Scalability**: Easy to add new components
4. **Clear Dependencies**: Explicit required/optional relationships
5. **Type Safety**: Full TypeScript support

## Component Tree Provider

The Component Tree Provider offers a VS Code tree view for browsing component source files within the Demo Builder sidebar.

### Features

- **File Browser**: Navigate component source code directly from VS Code
- **Smart Filtering**: Hides `.env` files (managed via Configure UI)
- **Quick Access**: Click to open component files in editor
- **Status Indicators**: Visual indicators for component state

### Implementation

Located in `src/providers/componentTreeProvider.ts`:

```typescript
class ComponentTreeProvider implements vscode.TreeDataProvider<FileSystemItem> {
  // Provides tree structure for all project components
  // Filters out .env files and build artifacts
  // Updates automatically when components change
}
```

### Usage

Available in the Demo Builder sidebar view:
- **Demo Builder: Components** tree view
- Shows all installed components
- Expandable file tree for each component
- Click to open files in editor

## Component Version Tracking

The extension tracks component versions to support the auto-update system.

### Version Storage

Stored in project manifest (`.demo-builder.json`):

```json
{
  "componentVersions": {
    "citisignal-nextjs": {
      "version": "1.0.0",
      "lastUpdated": "2025-01-15T10:30:00Z"
    },
    "commerce-mesh": {
      "version": "main",
      "lastUpdated": "2025-01-15T10:35:00Z"
    }
  }
}
```

### Version Lifecycle

1. **Initial Creation**: Set to `"unknown"` when project is created
2. **First Update**: Set to actual version after first component update
3. **Subsequent Updates**: Updated after each successful component update

### Update Detection

```typescript
// UpdateManager checks for newer versions
const current = project.componentVersions[componentId]?.version || 'unknown';
const latest = await fetchLatestRelease(repo, channel);

if (isNewerVersion(latest, current)) {
  // Show update notification
}
```

### Integration Points

- **UpdateManager**: Checks versions against GitHub Releases
- **ComponentUpdater**: Updates version after successful component update
- **Project Creation**: Initializes version tracking structure

## Auto-Update System Integration

Components integrate with the auto-update system introduced in v1.6.0.

### Update Flow

1. **Check for Updates**: UpdateManager queries GitHub Releases
2. **User Confirmation**: Show notification with available updates
3. **Component Update**: ComponentUpdater performs safe update with snapshot/rollback
4. **Version Tracking**: Update componentVersions in project manifest
5. **Restart Notification**: Prompt user to restart demo if running

### Safety Features

- **Snapshot Before Update**: Full component directory backed up
- **Automatic Rollback**: Restore snapshot on ANY failure
- **Smart .env Merging**: Preserve user config, add new variables
- **Verification**: Check package.json validity after extraction
- **Concurrent Lock**: Prevent multiple updates to same component

See `src/utils/componentUpdater.ts` for implementation details.

## Future Enhancements

- Dynamic component discovery from custom registries
- Version compatibility matrix
- Component marketplace integration
- Custom component templates
- ~~Automated dependency updates~~ ✅ **Implemented in v1.6.0**