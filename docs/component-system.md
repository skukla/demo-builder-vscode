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

### Target Integration
Enables personalization and A/B testing capabilities through Adobe Target.

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

## Future Enhancements

- Dynamic component discovery
- Version compatibility matrix
- Component marketplace integration
- Custom component templates
- Automated dependency updates