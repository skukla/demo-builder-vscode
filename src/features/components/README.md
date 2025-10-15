# Components Feature

## Purpose

The Components feature manages the component registry, definitions, and lifecycle for the extension. It provides a centralized catalog of available components (frontends, backends, dependencies, external systems, App Builder apps) with their metadata, dependencies, configuration requirements, and environment variables.

This feature acts as the source of truth for all component information, enabling the wizard to present component options, validate selections, resolve dependencies, and generate project configurations.

## Responsibilities

- **Component Registry Loading**: Load and parse components.json configuration
- **Component Catalog**: Provide lists of frontends, backends, dependencies, external systems, App Builder apps
- **Dependency Resolution**: Calculate required and optional dependencies for selected components
- **Compatibility Checking**: Verify frontend/backend compatibility
- **Node Version Management**: Determine required Node versions for selected components
- **Environment Variable Registry**: Provide env var definitions with descriptions and defaults
- **Service Registry**: Provide service definitions (Adobe Commerce, Catalog Service, etc.)
- **Configuration Generation**: Generate project configuration from component selections
- **Component Transformation**: Transform flat JSON structure to grouped structure for internal use
- **Component Tree Provider**: File browser integration with .env hiding

## Key Services

### ComponentRegistryManager

**Purpose**: Load and query component registry

**Key Methods**:
- `loadRegistry()` - Load and transform components.json
- `getFrontends()` - Get available frontend components
- `getBackends()` - Get available backend components
- `getDependencies()` - Get available dependency components
- `getExternalSystems()` - Get available external system components
- `getAppBuilder()` - Get available App Builder app components
- `getServices()` - Get service definitions
- `getServiceById(id)` - Get specific service definition
- `getComponentById(id)` - Get specific component by ID
- `checkCompatibility(frontendId, backendId)` - Check if frontend/backend are compatible
- `getRequiredNodeVersions(frontend, backend, dependencies, externalSystems, appBuilder)` - Get required Node versions
- `getNodeVersionToComponentMapping(...)` - Map Node versions to component names

**Example Usage**:
```typescript
import { ComponentRegistryManager } from '@/features/components';

const registry = new ComponentRegistryManager(extensionPath);
await registry.loadRegistry();

// Get available components
const frontends = await registry.getFrontends();
const backends = await registry.getBackends();
const dependencies = await registry.getDependencies();

// Check compatibility
const compatible = await registry.checkCompatibility(
    'citisignal-nextjs',
    'commerce-cloud'
);

// Get required Node versions
const nodeVersions = await registry.getRequiredNodeVersions(
    'citisignal-nextjs',  // Node 20
    'commerce-cloud',     // Node 20
    ['commerce-mesh']     // Node 18
);
// Result: Set { '20', '18' }
```

### DependencyResolver

**Purpose**: Resolve component dependencies and generate configurations

**Key Methods**:
- `resolveDependencies(frontendId, backendId, selectedOptional)` - Resolve all dependencies
- `validateDependencyChain(dependencies)` - Check for circular dependencies and conflicts
- `generateConfiguration(frontend, backend, dependencies)` - Generate project configuration

**Example Usage**:
```typescript
import { DependencyResolver } from '@/features/components';

const resolver = new DependencyResolver(registryManager);

// Resolve dependencies
const result = await resolver.resolveDependencies(
    'citisignal-nextjs',
    'commerce-cloud',
    ['demo-inspector']  // Optional dependencies selected by user
);

// Result contains:
// - required: ComponentDefinition[] (required dependencies)
// - optional: ComponentDefinition[] (available optional dependencies)
// - selected: ComponentDefinition[] (user-selected optional dependencies)
// - all: ComponentDefinition[] (required + selected)

// Validate dependency chain
const validation = await resolver.validateDependencyChain(result.all);

if (!validation.valid) {
    console.error('Dependency errors:', validation.errors);
}

// Generate configuration
const config = await resolver.generateConfiguration(
    frontend,
    backend,
    result.all
);
```

### ComponentManager

**Purpose**: Component lifecycle management (currently minimal, extensible for future component operations)

## Types

See `services/types.ts` and `@/types` for type definitions:

### Core Types (from @/types)
- `ComponentDefinition` - Complete component spec (id, name, type, source, dependencies, configuration)
- `TransformedComponentDefinition` - Component with enriched envVars and services arrays
- `RawComponentDefinition` - Raw component from JSON (before transformation)
- `ComponentRegistry` - Root registry structure (components, services, envVars)
- `RawComponentRegistry` - Raw registry from JSON (before transformation)
- `EnvVarDefinition` - Environment variable definition (key, description, defaultValue, required, usedBy)
- `ServiceDefinition` - Service definition (id, name, type, requiredEnvVars, envVars)
- `PresetDefinition` - Component preset (predefined combination)

### Project Types
- `ProjectConfig` - Generated project configuration (frontend, backend, dependencies, envVars)

## Architecture

**Directory Structure**:
```
features/components/
├── index.ts                     # Public API exports
├── services/
│   ├── componentRegistry.ts    # Registry loading and querying
│   ├── componentManager.ts     # Component lifecycle (extensible)
│   └── types.ts                # Type definitions
├── handlers/
│   ├── componentHandler.ts     # Legacy handler (to be migrated)
│   └── componentHandlers.ts    # Message handlers
├── providers/
│   └── componentTreeProvider.ts # File browser with .env hiding
└── README.md                   # This file
```

**Registry Transformation**:
```
components.json (v2.0 flat structure)
    ↓
ComponentRegistryManager.loadRegistry()
    ↓
transformToGroupedStructure()
    ├─→ Group by selectionGroups (frontend, backend, appBuilder, externalSystems, dependencies)
    ├─→ Build envVars arrays from shared envVars registry
    └─→ Build services arrays from services registry
    ↓
ComponentRegistry (grouped structure)
    ↓
Available for querying
```

## Integration Points

### Dependencies
- `@/types` - ComponentDefinition, ComponentRegistry, EnvVarDefinition, ServiceDefinition types
- `@/types/typeGuards` - parseJSON for safe JSON parsing
- `@/types/handlers` - ProjectConfig type
- `vscode` - TreeDataProvider for component tree view

### Used By
- `src/features/project-creation` - Component selection and dependency resolution
- `src/features/prerequisites` - Component requirements mapping
- `src/webviews/components/wizard/steps/ComponentStep.tsx` - Component selection UI
- `src/providers/componentTreeProvider.ts` - File browser integration

## Usage Examples

### Example 1: Load Registry and Get Components
```typescript
import { ComponentRegistryManager } from '@/features/components';

const registry = new ComponentRegistryManager(extensionPath);
await registry.loadRegistry();

// Get all frontends
const frontends = await registry.getFrontends();
for (const frontend of frontends) {
    console.log(`${frontend.name}: ${frontend.description}`);
    console.log(`  Compatible backends: ${frontend.compatibleBackends?.join(', ')}`);
    console.log(`  Node version: ${frontend.configuration?.nodeVersion}`);
}

// Get specific component
const mesh = await registry.getComponentById('commerce-mesh');
console.log(`${mesh.name}: ${mesh.description}`);
console.log(`  Required services:`, mesh.configuration?.requiredServices);
```

### Example 2: Check Compatibility
```typescript
import { ComponentRegistryManager } from '@/features/components';

const registry = new ComponentRegistryManager(extensionPath);
await registry.loadRegistry();

const frontendId = 'citisignal-nextjs';
const backendId = 'commerce-cloud';

const compatible = await registry.checkCompatibility(frontendId, backendId);

if (compatible) {
    console.log('✓ Components are compatible');
} else {
    console.error('✗ Components are not compatible');
}
```

### Example 3: Resolve Dependencies
```typescript
import { ComponentRegistryManager, DependencyResolver } from '@/features/components';

const registry = new ComponentRegistryManager(extensionPath);
await registry.loadRegistry();

const resolver = new DependencyResolver(registry);

const result = await resolver.resolveDependencies(
    'citisignal-nextjs',
    'commerce-cloud',
    ['demo-inspector']
);

console.log('Required dependencies:');
for (const dep of result.required) {
    console.log(`  - ${dep.name}`);
}

console.log('\nOptional dependencies (available):');
for (const dep of result.optional) {
    console.log(`  - ${dep.name}`);
}

console.log('\nSelected optional dependencies:');
for (const dep of result.selected) {
    console.log(`  - ${dep.name}`);
}
```

### Example 4: Check Node Version Requirements
```typescript
import { ComponentRegistryManager } from '@/features/components';

const registry = new ComponentRegistryManager(extensionPath);
await registry.loadRegistry();

const nodeVersions = await registry.getRequiredNodeVersions(
    'citisignal-nextjs',
    'commerce-cloud',
    ['commerce-mesh'],
    [],
    ['cif-actions-app']
);

console.log('Required Node versions:');
for (const version of nodeVersions) {
    console.log(`  - Node ${version}`);
}

// Get mapping to components
const mapping = await registry.getNodeVersionToComponentMapping(
    'citisignal-nextjs',
    'commerce-cloud',
    ['commerce-mesh'],
    [],
    ['cif-actions-app']
);

console.log('\nNode version mapping:');
for (const [version, componentName] of Object.entries(mapping)) {
    console.log(`  - Node ${version}: ${componentName}`);
}
```

### Example 5: Generate Project Configuration
```typescript
import { ComponentRegistryManager, DependencyResolver } from '@/features/components';

const registry = new ComponentRegistryManager(extensionPath);
await registry.loadRegistry();

const resolver = new DependencyResolver(registry);

// Get components
const frontend = await registry.getComponentById('citisignal-nextjs');
const backend = await registry.getComponentById('commerce-cloud');

// Resolve dependencies
const result = await resolver.resolveDependencies(
    frontend!.id,
    backend!.id,
    ['demo-inspector']
);

// Generate configuration
const config = await resolver.generateConfiguration(
    frontend!,
    backend!,
    result.all
);

console.log('Generated project configuration:');
console.log(JSON.stringify(config, null, 2));

// Config contains:
// - frontend: { id, port, nodeVersion }
// - backend: { id, configuration }
// - dependencies: [{ id, type, configuration }]
// - envVars: { KEY: '${VALUE}' }
```

### Example 6: Validate Dependency Chain
```typescript
import { DependencyResolver } from '@/features/components';

const resolver = new DependencyResolver(registry);

const result = await resolver.resolveDependencies(
    'citisignal-nextjs',
    'commerce-cloud',
    ['demo-inspector']
);

// Validate for circular dependencies and conflicts
const validation = await resolver.validateDependencyChain(result.all);

if (!validation.valid) {
    console.error('Dependency errors:');
    for (const error of validation.errors) {
        console.error(`  - ${error}`);
    }
}

if (validation.warnings.length > 0) {
    console.warn('Dependency warnings:');
    for (const warning of validation.warnings) {
        console.warn(`  - ${warning}`);
    }
}
```

## Configuration

### Components.json Structure (v2.0)
```json
{
    "version": "2.0",
    "components": {
        "citisignal-nextjs": {
            "name": "CitiSignal Next.js",
            "description": "Next.js frontend...",
            "type": "frontend",
            "source": {
                "type": "github",
                "repository": "skukla/citisignal-nextjs",
                "version": "main"
            },
            "compatibleBackends": ["commerce-cloud"],
            "dependencies": {
                "required": [],
                "optional": ["demo-inspector"]
            },
            "configuration": {
                "nodeVersion": "20",
                "port": 3000,
                "envVars": {
                    "requiredEnvVars": ["NEXT_PUBLIC_API_ENDPOINT"],
                    "optionalEnvVars": ["NEXT_PUBLIC_MESH_ENDPOINT"]
                }
            }
        },
        "commerce-mesh": {
            "name": "Commerce Mesh",
            "description": "Adobe API Mesh...",
            "type": "dependency",
            "subType": "mesh",
            "source": {
                "type": "github",
                "repository": "skukla/commerce-mesh",
                "version": "main"
            },
            "configuration": {
                "nodeVersion": "18",
                "providesEndpoint": true,
                "requiredServices": ["adobe-commerce", "catalog-service"],
                "envVars": {
                    "requiredEnvVars": [
                        "ADOBE_COMMERCE_GRAPHQL_ENDPOINT",
                        "ADOBE_CATALOG_SERVICE_ENDPOINT",
                        "ADOBE_CATALOG_API_KEY"
                    ]
                }
            }
        }
    },
    "selectionGroups": {
        "frontend": ["citisignal-nextjs"],
        "backend": ["commerce-cloud"],
        "dependencies": ["commerce-mesh", "demo-inspector"],
        "externalSystems": [],
        "appBuilder": ["cif-actions-app"]
    },
    "envVars": {
        "NEXT_PUBLIC_API_ENDPOINT": {
            "description": "API endpoint URL",
            "defaultValue": "",
            "required": true
        },
        "ADOBE_CATALOG_API_KEY": {
            "description": "Catalog Service API key",
            "defaultValue": "",
            "required": true
        }
    },
    "services": {
        "adobe-commerce": {
            "name": "Adobe Commerce",
            "type": "commerce",
            "requiredEnvVars": ["ADOBE_COMMERCE_GRAPHQL_ENDPOINT"]
        },
        "catalog-service": {
            "name": "Catalog Service",
            "type": "service",
            "requiredEnvVars": [
                "ADOBE_CATALOG_SERVICE_ENDPOINT",
                "ADOBE_CATALOG_API_KEY"
            ]
        }
    }
}
```

## Performance Considerations

### Registry Loading
- **One-time load**: Registry loaded once per session
- **Cached in memory**: No repeated file reads
- **Fast transformation**: Flat to grouped structure transformation is O(n)

### Component Queries
- **Direct lookups**: O(1) for getComponentById
- **Filtered lists**: O(n) for getFrontends, getBackends, etc.
- **Compatibility checks**: O(1) lookup in compatibleBackends array

### Best Practices
1. **Load registry once**: Reuse ComponentRegistryManager instance
2. **Cache resolved dependencies**: Don't re-resolve for same selections
3. **Validate early**: Check compatibility before dependency resolution
4. **Use direct lookups**: getComponentById is faster than filtering

## Testing

### Manual Testing Checklist
- [ ] Registry loads successfully from components.json
- [ ] All component types load correctly (frontends, backends, dependencies, external systems, App Builder)
- [ ] Compatibility checking works
- [ ] Dependency resolution works (required + optional)
- [ ] Node version detection works
- [ ] Circular dependency detection works
- [ ] Configuration generation works
- [ ] EnvVars enrich components correctly
- [ ] Services enrich components correctly
- [ ] Component tree provider shows files correctly
- [ ] .env files hidden in component tree

### Integration Testing
- Test component selection in wizard
- Test dependency resolution with various selections
- Test Node version requirements
- Test configuration generation
- Test with invalid component selections

## See Also

- **[Prerequisites Feature](../prerequisites/README.md)** - Component requirements mapping
- **[Project Creation Feature](../project-creation/README.md)** - Component installation
- **[Components JSON](../../templates/components.json)** - Component registry configuration
- **[Component Types](../../types/index.ts)** - Type definitions
- **[Component Tree Provider](../../providers/componentTreeProvider.ts)** - File browser integration

---

For overall architecture, see `../../CLAUDE.md`
For shared infrastructure, see `../shared/CLAUDE.md`
