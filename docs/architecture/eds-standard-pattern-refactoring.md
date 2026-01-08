# EDS Standard Pattern Refactoring

## Overview

Refactored EDS configuration to follow the same standard pattern as headless and other components, eliminating custom .env generation logic and leveraging existing infrastructure.

## What Changed

### Before: Custom Pattern ❌

```
EDS Setup (Phase 0)
  ├── Clone EDS repository
  ├── Custom .env generation (manual string building)
  ├── Generate site.json
  └── NOT registered in componentDefinitions

Mesh Deployment (Phase 3)
  └── Stores endpoint in project.meshState.endpoint

Post-Mesh Hook (Custom)
  └── updateEdsConfigWithMesh() - manually updates both .env and site.json

Phase 4: Environment Files
  └── Skips EDS (not in componentDefinitions)
```

**Problems**:
- Custom .env generation duplicated standard logic
- Didn't use `sharedEnvVars` registry
- Didn't use `generateComponentEnvFile()` helper
- Didn't benefit from standard priority order
- Required custom post-mesh hook
- Different from how headless works

### After: Standard Pattern ✅

```
EDS Setup (Phase 0)
  ├── Clone EDS repository
  ├── Generate site.json (EDS-specific, not .env)
  └── Register EDS in componentDefinitions

Mesh Deployment (Phase 3)
  └── Stores endpoint in project.meshState.endpoint

Post-Mesh Hook (Simplified)
  └── updateSiteJsonWithMesh() - ONLY updates site.json

Phase 4: Environment Files (Standard)
  └── generateComponentEnvFile() handles EDS
      ├── Reads requiredEnvVars from components.json
      ├── Uses sharedEnvVars registry
      ├── Auto-populates MESH_ENDPOINT
      └── Uses standard priority order
```

**Benefits**:
- ✅ Uses `generateComponentEnvFile()` (standard helper)
- ✅ Reads from `components.json` (single source of truth)
- ✅ Uses `sharedEnvVars` registry (standard definitions)
- ✅ Auto-populates MESH_ENDPOINT (line 91 of envFileGenerator.ts)
- ✅ Standard priority order (runtime → wizard → defaults)
- ✅ Same formatting as headless
- ✅ No custom .env logic needed

## Files Modified

### 1. `executor.ts` - Register EDS in Component Definitions

```typescript
// After EDS setup, register it so Phase 4 handles its .env
if (isEdsStack && edsComponentPath && project.componentInstances?.[EDS_COMPONENT_ID]) {
    const registryManager = new ComponentRegistryManager(context.context.extensionPath);
    const registry = await registryManager.loadRegistry();
    
    const edsDefinition = registry.components?.frontends?.find(f => f.id === 'eds');
    if (edsDefinition) {
        componentDefinitions.set(EDS_COMPONENT_ID, {
            definition: edsDefinition,
            installOptions: { skipDependencies: true },
        });
    }
}
```

### 2. `edsSetupPhases.ts` - Remove Custom .env Generation

**Removed**:
- `EnvConfigPhase.generateEnvFile()` method (97 lines of custom logic)

**Kept**:
- `EnvConfigPhase.generateSiteJson()` - EDS-specific runtime config
- `updateSiteJsonWithMesh()` - Post-mesh site.json update only

**Added Comment**:
```typescript
/**
 * NOTE: .env generation is now handled by Phase 4's generateComponentEnvFile()
 * This uses the standard pattern:
 * - Reads requiredEnvVars from components.json
 * - Uses sharedEnvVars registry
 * - Auto-populates MESH_ENDPOINT from project.meshState.endpoint
 * - Applies standard priority order: runtime → wizard → defaults
 */
```

### 3. `edsProjectService.ts` - Don't Call .env Generation

```typescript
// Before
await this.envPhase.generateSiteJson(config);
await this.envPhase.generateEnvFile(config, createdRepo);  // ❌ Custom logic

// After
await this.envPhase.generateSiteJson(config);  // ✅ Only EDS-specific config
// NOTE: Standard .env happens in Phase 4
```

### 4. `executor.ts` - Simplified Post-Mesh Hook

```typescript
// Before: updateEdsConfigWithMesh()
// - Updated both .env AND site.json
// - Custom string manipulation
// - Duplicated standard logic

// After: updateSiteJsonWithMesh()
// - ONLY updates site.json (EDS-specific)
// - .env handled by Phase 4 standard pattern
// - Much simpler
```

## How It Works Now

### EDS .env Generation (Standard Pattern)

**Phase 4: `generateEnvironmentFiles()`**
```typescript
// Gets mesh endpoint from authoritative source
const deployedMeshEndpoint = project.meshState?.endpoint;

// Creates config for env generation
const envConfig: EnvGenerationConfig = {
    ...config,
    apiMesh: deployedMeshEndpoint ? {
        endpoint: deployedMeshEndpoint
    } : undefined,
};

// Iterates all components (including EDS now!)
for (const [compId, { definition }] of componentDefinitions) {
    await generateComponentEnvFile(
        componentPath,
        compId,
        definition,        // From components.json
        sharedEnvVars,     // From envVars registry
        envConfig          // Has apiMesh.endpoint
    );
}
```

**`generateComponentEnvFile()` (lines 85-92)**:
```typescript
// Priority order for values:
// 1. Runtime values (e.g., MESH_ENDPOINT from deployment)
if (key === 'MESH_ENDPOINT' && config.apiMesh?.endpoint) {
    value = config.apiMesh.endpoint;
}
// 2. User-provided values (from wizard)
// 3. Default value (from components.json)
// 4. Empty string
```

### EDS site.json Generation (EDS-Specific)

**Phase 0: EDS Setup**
```typescript
// Generate initial site.json (may not have mesh endpoint yet)
await this.envPhase.generateSiteJson(config);
```

**Post-Mesh: After Phase 3**
```typescript
// Update site.json with mesh endpoint
await updateSiteJsonWithMesh(edsComponentPath, project.meshState.endpoint, logger);
```

## Configuration Timeline

```
Time 0: EDS Setup
  ├── Clone repository ✅
  ├── Generate fstab.yaml ✅
  ├── Generate site.json (may be template) ✅
  └── NO .env generation (handled by Phase 4)

Time 1: Mesh Deployment
  └── Mesh deploys → endpoint in project.meshState.endpoint

Time 2: Post-Mesh Hook
  └── Update site.json with mesh endpoint ✅

Time 3: Phase 4 - Standard Env Generation
  ├── EDS registered in componentDefinitions ✅
  └── generateComponentEnvFile() for EDS
      ├── Reads requiredEnvVars: ["MESH_ENDPOINT", ...]
      ├── Auto-populates from project.meshState.endpoint
      └── Writes .env with standard formatting ✅

Result: Complete configuration using standard pattern
```

## Comparison: EDS vs Headless

| Aspect | Headless | EDS (Before) | EDS (After) |
|--------|----------|--------------|-------------|
| **Registered in componentDefinitions** | ✅ Yes | ❌ No | ✅ Yes |
| **Uses generateComponentEnvFile()** | ✅ Yes | ❌ No | ✅ Yes |
| **Reads from components.json** | ✅ Yes | ❌ No | ✅ Yes |
| **Uses sharedEnvVars registry** | ✅ Yes | ❌ No | ✅ Yes |
| **Auto-populates MESH_ENDPOINT** | ✅ Yes | ❌ Custom | ✅ Yes |
| **Standard priority order** | ✅ Yes | ❌ Custom | ✅ Yes |
| **Phase 4 inclusion** | ✅ Yes | ❌ No | ✅ Yes |
| **Custom post-mesh hook** | ❌ No | ✅ Yes | ⚠️ Only site.json |

## Benefits of Refactoring

### Code Quality
- ✅ Removed 97 lines of duplicate logic
- ✅ Single source of truth (envFileGenerator.ts)
- ✅ Consistent with other components
- ✅ Easier to maintain

### Functionality
- ✅ Standard priority order works for EDS
- ✅ Wizard values properly populated
- ✅ Default values from registry
- ✅ Same formatting as headless

### Architecture
- ✅ Follows established patterns
- ✅ Uses existing infrastructure
- ✅ No special-casing in Phase 4
- ✅ Extensible for future components

## Testing

To verify the refactoring:

1. **Create EDS + PaaS project**
2. **Check .env generation**:
   - File exists at `components/eds-storefront/.env`
   - Contains `MESH_ENDPOINT=` with correct value
   - Uses standard formatting (matches headless)
   - Contains all required env vars from components.json

3. **Check site.json**:
   - File exists at `components/eds-storefront/site.json`
   - Contains `commerce-core-endpoint` with mesh endpoint
   - Updated post-mesh deployment

4. **Compare with headless**:
   - Both should use same env var names (`MESH_ENDPOINT`)
   - Both should have same formatting
   - Both should be in Phase 4 logs

## Backwards Compatibility

- ✅ Existing projects unaffected (only affects new project creation)
- ✅ Same env var names (`MESH_ENDPOINT`, not changed)
- ✅ Same file locations
- ✅ site.json still EDS-specific (not standardized)

## Summary

EDS now follows the **same pattern as headless** for .env generation:
- Registered in `componentDefinitions`
- Uses `generateComponentEnvFile()` in Phase 4
- Reads from `components.json` and `envVars` registry
- Auto-populates `MESH_ENDPOINT` from `project.meshState.endpoint`
- Only EDS-specific file (`site.json`) requires custom handling

**Result**: Less code, better consistency, easier maintenance! 🎉
