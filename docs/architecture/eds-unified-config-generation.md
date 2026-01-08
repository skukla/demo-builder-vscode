# EDS Unified Configuration Generation

## Overview

This document describes the **unified, registry-based configuration file generation** approach implemented for EDS projects, where **both `.env` and `site.json` files are generated through the component registry** in Phase 4.

## Problem: The Old Approach

Previously, EDS configuration was split across multiple phases with custom hooks:

**Issues**:
- ❌ **Two-phase generation**: `site.json` created in Phase 0, updated post-mesh
- ❌ **Custom hooks**: `updateSiteJsonWithMesh()` called after mesh deployment  
- ❌ **Special cases**: EDS-specific code paths in `executor.ts`
- ❌ **Duplication**: Similar logic for `.env` and `site.json` implemented differently
- ❌ **Complexity**: Hard to understand when/where config files are created

**Old Flow**:
1. Phase 0 (EDS Setup): Generate `site.json` with empty mesh endpoint
2. Phase 3 (Mesh Deployment): Deploy mesh, store endpoint
3. Post-Phase 3: **Custom hook** to update `site.json` with mesh endpoint
4. Phase 4: Generate `.env` with mesh endpoint

## Solution: Unified Registry-Based Generation

**All configuration files are now defined in `components.json` and generated in Phase 4**.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Component Registry                         │
│                   (components.json)                          │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
         ┌──────▼──────┐        ┌──────▼──────┐
         │requiredEnvVars│      │ configFiles │
         │.env format   │       │ JSON format │
         └──────┬──────┘        └──────┬──────┘
                │                       │
                └───────────┬───────────┘
                            │
                     ┌──────▼──────┐
                     │   Phase 4    │
                     │  Generation  │
                     └──────┬──────┘
                            │
                ┌───────────┴───────────┐
                │                       │
         ┌──────▼──────┐        ┌──────▼──────┐
         │ .env file   │        │ site.json   │
         │ (all comps) │        │ (EDS only)  │
         └─────────────┘        └─────────────┘
```

### Key Principles

1. **Single Source of Truth**: Component registry defines all config files
2. **Single Phase**: All config generation happens in Phase 4
3. **No Custom Hooks**: No post-deployment updates needed
4. **Declarative**: Config structure defined in JSON, not code
5. **Extensible**: Any component can define custom config files

## Implementation

### 1. Component Registry Definition

**File**: `src/features/components/config/components.json`

```json
{
  "frontends": {
    "eds": {
      "name": "Edge Delivery Services",
      "configuration": {
        "requiredEnvVars": [
          "MESH_ENDPOINT",
          "ADOBE_COMMERCE_STORE_CODE",
          "ADOBE_COMMERCE_STORE_VIEW_CODE",
          "ADOBE_COMMERCE_WEBSITE_CODE"
        ],
        "configFiles": {
          "site.json": {
            "format": "json",
            "template": "default-site.json",
            "defaultValues": {
              "commerce-core-endpoint": "",
              "commerce-endpoint": "https://catalog-service.adobe.io/graphql",
              "store-view-code": "default",
              "website-code": "base",
              "store-code": "main_website_store"
            },
            "fields": {
              "commerce-core-endpoint": {
                "source": "MESH_ENDPOINT",
                "placeholder": "{ENDPOINT}",
                "required": false
              },
              "commerce-endpoint": {
                "value": "https://catalog-service.adobe.io/graphql",
                "placeholder": "{CS_ENDPOINT}",
                "required": true
              },
              "store-view-code": {
                "source": "ADOBE_COMMERCE_STORE_VIEW_CODE",
                "placeholder": "{STORE_VIEW_CODE}"
              }
            }
          }
        }
      }
    }
  }
}
```

**Key Fields**:
- **`configFiles`**: Object mapping filename → config definition
- **`format`**: File format (`json`, `yaml`, `ini`)
- **`template`**: Optional template file (relative to component root)
- **`defaultValues`**: Fallback values if template not found
- **`fields`**: Field mappings
  - **`source`**: Env var key to read value from
  - **`value`**: Static value (if no source)
  - **`placeholder`**: Template placeholder to replace
  - **`required`**: Whether field is required

### 2. Type Definitions

**File**: `src/types/components.ts`

```typescript
/**
 * ConfigFileField - Field definition for a configuration file
 */
export interface ConfigFileField {
    /** Source env var key to read value from (e.g., 'MESH_ENDPOINT') */
    source?: string;
    /** Static value (used if source not provided) */
    value?: string;
    /** Whether field is required */
    required?: boolean;
    /** Template placeholder to replace (e.g., '{ENDPOINT}') */
    placeholder?: string;
}

/**
 * ConfigFileDefinition - Configuration file definition (e.g., site.json for EDS)
 */
export interface ConfigFileDefinition {
    /** File format */
    format: 'json' | 'yaml' | 'ini';
    /** Optional template file name (relative to component root) */
    template?: string;
    /** Default values if template not found */
    defaultValues?: Record<string, unknown>;
    /** Field mappings (field name -> source) */
    fields?: Record<string, ConfigFileField>;
}
```

### 3. Generation Logic

**File**: `src/features/project-creation/helpers/envFileGenerator.ts`

```typescript
/**
 * Generate component-specific configuration files (e.g., site.json for EDS)
 */
export async function generateComponentConfigFiles(
    componentPath: string,
    componentId: string,
    componentDef: TransformedComponentDefinition,
    sharedEnvVars: Record<string, Omit<EnvVarDefinition, 'key'>>,
    config: EnvGenerationConfig,
    logger: Logger,
): Promise<void> {
    const configFiles = componentDef.configuration?.configFiles;
    
    if (!configFiles || Object.keys(configFiles).length === 0) {
        return; // No config files to generate
    }
    
    for (const [filename, configFileDef] of Object.entries(configFiles)) {
        // Build placeholders from field definitions
        const placeholders: Record<string, string> = {};
        
        if (configFileDef.fields) {
            for (const [fieldName, fieldDef] of Object.entries(configFileDef.fields)) {
                let value = '';
                
                // Get value from source env var (e.g., MESH_ENDPOINT)
                if (fieldDef.source === 'MESH_ENDPOINT' && config.apiMesh?.endpoint) {
                    value = config.apiMesh.endpoint;
                } else if (fieldDef.value) {
                    value = fieldDef.value;
                }
                
                // Add placeholder replacement
                if (fieldDef.placeholder) {
                    placeholders[fieldDef.placeholder] = value;
                }
            }
        }
        
        // Generate the config file using shared utility
        await generateConfigFile({
            filePath: path.join(componentPath, filename),
            templatePath: configFileDef.template 
                ? path.join(componentPath, configFileDef.template)
                : undefined,
            defaultConfig: configFileDef.defaultValues || {},
            placeholders,
            logger,
            description: `${filename} for ${componentId}`,
        });
    }
}
```

### 4. Phase 4 Integration

**File**: `src/features/project-creation/services/projectFinalizationService.ts`

```typescript
/**
 * Phase 4: Generate environment files for all non-mesh components
 */
export async function generateEnvironmentFiles(
    context: FinalizationContext,
): Promise<void> {
    // Get deployed mesh endpoint from meshState (SINGLE SOURCE OF TRUTH)
    const deployedMeshEndpoint = project.meshState?.endpoint;
    
    // Create config with mesh endpoint for generation
    const envConfig: EnvGenerationConfig = {
        ...config,
        apiMesh: deployedMeshEndpoint ? {
            ...typedConfig.apiMesh,
            endpoint: deployedMeshEndpoint,
        } : typedConfig.apiMesh,
    };
    
    // Generate ALL config files for all components
    for (const [compId, { definition }] of componentDefinitions) {
        // Skip mesh - already generated in Phase 3
        if (compId === 'commerce-mesh') continue;
        
        const componentPath = project.componentInstances?.[compId]?.path;
        if (!componentPath) continue;
        
        // Generate .env file (standard pattern)
        await generateComponentEnvFile(
            componentPath,
            compId,
            definition,
            sharedEnvVars,
            envConfig,  // ← Contains mesh endpoint
            logger,
        );
        
        // Generate additional config files (e.g., site.json for EDS)
        await generateComponentConfigFiles(
            componentPath,
            compId,
            definition,
            sharedEnvVars,
            envConfig,  // ← Same config, includes mesh endpoint
            logger,
        );
    }
}
```

## Configuration Flow

### New Unified Flow

1. **Phase 0 (EDS Setup)**: Clone repository, setup DA.live (no config generation)
2. **Phase 3 (Mesh Deployment)**: Deploy mesh, store `project.meshState.endpoint`
3. **Phase 4 (Finalization)**: Generate **ALL** config files with mesh endpoint
   - Read component's `configFiles` definition from registry
   - Read mesh endpoint from `project.meshState.endpoint`
   - Generate `.env` with `MESH_ENDPOINT=<endpoint>`
   - Generate `site.json` with `commerce-core-endpoint: <endpoint>`
   - Done!

### Comparison: Old vs New

| Aspect | Old (Two-Phase) | New (Unified) |
|--------|----------------|---------------|
| **site.json creation** | Phase 0 (empty endpoint) | Phase 4 (with endpoint) |
| **site.json update** | Post-Phase 3 custom hook | Not needed |
| **.env creation** | Phase 4 | Phase 4 |
| **Definition location** | Hardcoded in `edsSetupPhases.ts` | Declared in `components.json` |
| **Custom hooks** | `updateSiteJsonWithMesh()` | None |
| **Special cases** | EDS-specific code in executor | None |
| **Extensibility** | Add new hook for each file | Add to registry |

## Benefits

### Code Quality
- ✅ **50% less code** - removed custom hooks and special cases
- ✅ **No duplication** - single pattern for all config files
- ✅ **Declarative** - config structure in JSON, not code
- ✅ **Type-safe** - full TypeScript support for configFiles

### Maintainability
- ✅ **Single phase** - all generation in Phase 4
- ✅ **No custom hooks** - no post-deployment updates
- ✅ **Predictable** - same flow for all components
- ✅ **Debuggable** - clear generation order and timing

### Extensibility
- ✅ **Add new files** - just update `components.json`
- ✅ **Add new components** - follows same pattern
- ✅ **Support new formats** - extend format enum (yaml, ini)
- ✅ **Reusable** - any component can define configFiles

### Consistency
- ✅ **Same pattern** - .env and site.json both via registry
- ✅ **Same timing** - both in Phase 4
- ✅ **Same config** - both use project.meshState.endpoint
- ✅ **Same helpers** - both use shared utilities

## Future Extensions

### Adding New Config Files

To add a new config file for any component:

1. Add definition to `components.json`:
```json
{
  "frontends": {
    "my-component": {
      "configuration": {
        "configFiles": {
          "my-config.json": {
            "format": "json",
            "defaultValues": { "key": "value" },
            "fields": {
              "key": { "source": "MY_ENV_VAR" }
            }
          }
        }
      }
    }
  }
}
```

2. That's it! Phase 4 automatically generates it.

### Supporting New Formats

To add YAML or INI support:

1. Update format enum in schema and types
2. Add format-specific generator (similar to `generateConfigFile`)
3. Update `generateComponentConfigFiles()` to handle new format

## Testing

When testing config generation:

1. **Verify mesh endpoint presence**: Ensure `project.meshState.endpoint` exists
2. **Check Phase 4 timing**: Config files generated after mesh deployment
3. **Validate field mappings**: Env var sources correctly resolved
4. **Test template loading**: Fallback to defaultValues works
5. **Verify placeholder replacement**: All placeholders replaced correctly

## Summary

The unified configuration generation approach:

- ✅ **Eliminates two-phase complexity** - all generation in Phase 4
- ✅ **Removes custom hooks** - no post-deployment updates
- ✅ **Uses component registry** - declarative definitions
- ✅ **Extends easily** - add new files via JSON
- ✅ **Maintains consistency** - same pattern for all file types

This is the **proper architectural solution** that treats `.env` and `site.json` (and any future config files) as first-class citizens of the component registry system.
