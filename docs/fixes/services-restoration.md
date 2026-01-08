# Services Abstraction Restoration

## Context
After implementing Option A (removing the service abstraction entirely), the user requested to roll back to Option B (keeping services but fixing the duplication issue properly).

## Problem with Option A
While Option A simplified the code by removing the service abstraction, it lost several important benefits:
- **DRY principle**: Service env vars were duplicated across multiple components
- **Semantic meaning**: Couldn't distinguish between backends that "provide" vs "require" services
- **Documentation**: Lost service descriptions and centralized definitions
- **Change management**: Adding a new catalog service variable required updating multiple places

## Option B Solution: Services with Smart Deduplication

### What We Restored

1. **`services` registry in `components.json`**:
   ```json
   {
       "services": {
           "catalog-service": {
               "name": "Catalog Service",
               "description": "Enhanced product information management",
               "backendSpecific": true,
               "requiredEnvVarsByBackend": {
                   "adobe-commerce-paas": [
                       "PAAS_CATALOG_SERVICE_ENDPOINT",
                       "ADOBE_COMMERCE_ENVIRONMENT_ID",
                       "ADOBE_CATALOG_API_KEY"
                   ],
                   "adobe-commerce-accs": [
                       "ACCS_CATALOG_SERVICE_ENDPOINT",
                       "ADOBE_COMMERCE_ENVIRONMENT_ID",
                       "ADOBE_CATALOG_API_KEY"
                   ]
               }
           }
       }
   }
   ```

2. **`requiredServices` and `providesServices` in component configurations**:
   ```json
   {
       "backends": {
           "adobe-commerce-paas": {
               "configuration": {
                   "requiredServices": ["catalog-service", "live-search"]
               }
           },
           "adobe-commerce-accs": {
               "configuration": {
                   "providesServices": ["catalog-service", "live-search"]
               }
           }
       }
   }
   ```

3. **Smart deduplication in `envVarResolver.ts`**:
   - Service env vars are collected from the services registry
   - **BUT** only added if NOT already explicitly declared by the component
   - This prevents duplication where a component declares a derived variable (e.g., `ADOBE_CATALOG_SERVICE_ENDPOINT`) but would also get the backend-specific source variable (e.g., `PAAS_CATALOG_SERVICE_ENDPOINT`) from the service

### Key Implementation Details

#### `envVarResolver.ts` Deduplication Logic
```typescript
// Start with component's own env vars
const requiredKeys = componentDef.configuration?.requiredEnvVars || [];
const optionalKeys = componentDef.configuration?.optionalEnvVars || [];
const explicitKeys = new Set([...requiredKeys, ...optionalKeys]); // For deduplication check

// Add backend-specific service env vars
// ONLY add vars that are NOT already explicitly declared by the component
if (componentDef.configuration?.requiredServices && backendId) {
    for (const serviceId of componentDef.configuration.requiredServices) {
        const serviceDef = registry.services?.[serviceId];
        
        if (serviceDef?.backendSpecific && serviceDef.requiredEnvVarsByBackend) {
            const backendSpecificVars = serviceDef.requiredEnvVarsByBackend[backendId];
            if (backendSpecificVars) {
                // Filter out vars already explicitly declared
                const newVars = backendSpecificVars.filter(v => !explicitKeys.has(v));
                allEnvVarKeys.push(...newVars);
            }
        }
    }
}
```

#### Review Step Service Resolution
- `resolveServiceNames()` helper extracts service IDs from backend configuration
- Maps service IDs to human-readable names from the services registry
- Handles `providesServices` by appending " (built-in)" suffix
- `buildComponentInfoList()` receives resolved service names as `backendServiceNames` parameter

### Files Modified

1. **Configuration Files**:
   - `src/features/components/config/components.json` - Restored `services` section, added `requiredServices`/`providesServices` to backends
   - `src/features/components/config/components.schema.json` - Restored service schema definitions

2. **Type Definitions**:
   - `src/types/components.ts` - Restored `ServiceDefinition` interface, added `requiredServices`/`providesServices` to component config
   - `src/types/base.ts` - Added `ServiceDefinition` import and `services` property

3. **Core Logic**:
   - `src/features/components/services/envVarResolver.ts` - Restored service resolution with smart deduplication
   - `src/features/project-creation/ui/steps/reviewStepHelpers.tsx` - Restored `resolveServiceNames()` helper
   - `src/features/project-creation/ui/steps/ReviewStep.tsx` - Added service name resolution to `useMemo` hooks

4. **Tests**:
   - `tests/features/project-creation/ui/steps/ReviewStep.helpers.test.tsx` - Added tests for `resolveServiceNames()`
   - `tests/templates/type-json-alignment.test.ts` - Added `SERVICE_DEFINITION_FIELDS`, `derivedFrom` to env var fields, `configFiles` to component config fields

### Benefits Regained

✅ **DRY** - Catalog service env vars defined once in services registry  
✅ **Semantic** - Clear distinction between "requires" vs "provides" services  
✅ **Documentation** - Service descriptions available in registry  
✅ **Centralized** - Change catalog service requirements in one place  
✅ **No Duplication** - Smart deduplication prevents redundant env vars in `.env` files  

### Example: API Mesh with PaaS Backend

**Before (Option A)**:
```json
{
    "commerce-mesh": {
        "configuration": {
            "requiredEnvVars": [
                "ADOBE_COMMERCE_GRAPHQL_ENDPOINT",
                "ADOBE_CATALOG_SERVICE_ENDPOINT",
                "ADOBE_COMMERCE_ENVIRONMENT_ID",
                "ADOBE_CATALOG_API_KEY"
            ]
        }
    }
}
```
Result: Mesh gets both `ADOBE_CATALOG_SERVICE_ENDPOINT` (explicit) AND `PAAS_CATALOG_SERVICE_ENDPOINT` (from backend) ❌

**After (Option B)**:
```json
{
    "commerce-mesh": {
        "configuration": {
            "requiredEnvVars": [
                "ADOBE_COMMERCE_GRAPHQL_ENDPOINT",
                "ADOBE_CATALOG_SERVICE_ENDPOINT"
            ]
        }
    },
    "backends": {
        "adobe-commerce-paas": {
            "configuration": {
                "requiredServices": ["catalog-service"]
            }
        }
    },
    "services": {
        "catalog-service": {
            "requiredEnvVarsByBackend": {
                "adobe-commerce-paas": [
                    "PAAS_CATALOG_SERVICE_ENDPOINT",
                    "ADOBE_COMMERCE_ENVIRONMENT_ID",
                    "ADOBE_CATALOG_API_KEY"
                ]
            }
        }
    }
}
```
Result: Mesh gets `ADOBE_CATALOG_SERVICE_ENDPOINT` (explicit), but skips `PAAS_CATALOG_SERVICE_ENDPOINT` (already has derived version) ✅

## Testing
- All 95 tests pass
- `ReviewStep.helpers.test.tsx` validates service name resolution
- `type-json-alignment.test.ts` ensures schema/type alignment
