# EDS Backend Configuration Architecture

## Overview

This document explains how EDS (Edge Delivery Services) projects are configured based on the selected backend component, addressing the design decisions and architecture.

## Answers to Key Questions

### 1a. Repository Clone Polling - Using Timeout Configuration ✅

**Implementation**: Uses `TIMEOUTS` from centralized configuration and `PollingService`

```typescript
async waitForContent(owner: string, repo: string): Promise<boolean> {
    const pollingService = new PollingService();
    
    await pollingService.pollUntilCondition(
        async () => await this.hasContent(owner, repo),
        {
            name: `github-repo-${owner}/${repo}`,
            maxAttempts: 10,
            initialDelay: TIMEOUTS.POLL.INTERVAL,  // ✅ From config
            maxDelay: TIMEOUTS.POLL.MAX,            // ✅ From config
            timeout: TIMEOUTS.NORMAL,               // ✅ From config (30s)
        },
    );
}
```

**Benefits**:
- ✅ Uses centralized `TIMEOUTS` configuration
- ✅ Reuses existing `PollingService` with rate limiting
- ✅ Exponential backoff built-in
- ✅ Proper timeout handling (30 seconds total)
- ✅ Rate limiting prevents API spam (10 ops/sec via RateLimiter)

### 1b. Polling Limits - Protection Against Spam ✅

**Multiple Protection Layers**:

1. **Max Attempts**: 10 attempts maximum
2. **Total Timeout**: 30 seconds (`TIMEOUTS.NORMAL`)
3. **Rate Limiting**: `PollingService` uses `RateLimiter` (10 ops/sec)
4. **Exponential Backoff**: Delays increase from 1s → 5s max

**Total Resource Usage**:
- Max API calls: 10
- Max time: 30 seconds
- Rate limited: Max 10 requests/second
- Won't spam GitHub API even under failure conditions

### 1c. Reusing Existing Polling Mechanisms ✅

**Uses Core Infrastructure**:
- ✅ `PollingService` from `@/core/shell/pollingService`
- ✅ `RateLimiter` for security (prevents resource exhaustion)
- ✅ `TIMEOUTS` configuration for consistency
- ✅ Standard error handling patterns

**Comparison to Other Polling in Codebase**:
- Helix Code Sync verification uses `PollingService` ✅
- Mesh deployment verification uses `PollingService` ✅
- GitHub repo verification NOW uses `PollingService` ✅

### 2. Backend Component Architecture

**Backend components are explicitly defined**, not inferred. The architecture works as follows:

#### Stack Definition (`stacks.json`)
```json
{
  "id": "eds-paas",
  "name": "Edge Delivery + PaaS",
  "frontend": "eds",
  "backend": "adobe-commerce-paas",  // ← Explicit backend
  "dependencies": ["commerce-mesh"]
}
```

#### Backend Component Definition (`components.json`)
```json
{
  "backends": {
    "adobe-commerce-paas": {
      "name": "Adobe Commerce PaaS",
      "configuration": {
        "requiredEnvVars": [
          "ADOBE_COMMERCE_URL",
          "ADOBE_COMMERCE_GRAPHQL_ENDPOINT",
          "ADOBE_COMMERCE_WEBSITE_CODE",
          "ADOBE_COMMERCE_STORE_CODE",
          "ADOBE_COMMERCE_STORE_VIEW_CODE",
          "ADOBE_COMMERCE_ENVIRONMENT_ID",
          "ADOBE_CATALOG_API_KEY"
        ],
        "requiredServices": ["catalog-service", "live-search"]
      }
    },
    "adobe-commerce-accs": {
      "name": "Adobe Commerce Cloud Service",
      "configuration": {
        "requiredEnvVars": [
          "ACCS_HOST",
          "ACCS_STORE_VIEW_CODE"
        ]
      }
    }
  }
}
```

### 3. Service Dependency Resolution - providesServices Architecture ✅

**Components can now declare what services they provide to others**

The architecture now supports intelligent service dependency resolution to avoid prompting users for services that are already provided by their selected backend or addons.

#### Service Provider Architecture

**Problem**: Different backends and addons provide different built-in services:
- **ACCS backend** provides `catalog-service` and `live-search` built-in
- **ACO addon** provides `catalog-service` and `live-search` when included
- **PaaS backend** requires these services to be explicitly added (unless ACO is present)

**Solution**: Add `providesServices` to component definitions

```json
{
  "backends": {
    "adobe-commerce-accs": {
      "configuration": {
        "providesServices": ["catalog-service", "live-search"],
        // ACCS provides these built-in, no additional setup needed
      }
    },
    "adobe-commerce-paas": {
      "configuration": {
        "requiredServices": ["catalog-service", "live-search"],
        // PaaS needs these services (unless provided by addons like ACO)
      }
    }
  },
  "addons": {
    "adobe-commerce-aco": {
      "configuration": {
        "providesServices": ["catalog-service", "live-search"],
        // ACO provides these services when included
      }
    }
  }
}
```

#### Service Resolution Algorithm

When building a stack, the system resolves:
1. **Required Services**: What services does the backend need?
2. **Provided Services**: What services are already provided by backend/addons?
3. **Missing Services**: What services still need to be added?

```typescript
import { resolveServices } from '@/features/components/services/serviceResolver';

// Example: PaaS + ACO
const result = resolveServices(paasBackend, [acoAddon], []);
// Result: missingServices = [] (ACO provides all required services)

// Example: PaaS alone
const result = resolveServices(paasBackend, [], []);
// Result: missingServices = ['catalog-service', 'live-search']

// Example: ACCS (any configuration)
const result = resolveServices(accsBackend, [], []);
// Result: missingServices = [] (ACCS provides all built-in)
```

#### Benefits

✅ **Smart Prompting**: Only prompt users for services they actually need
✅ **No Redundant Config**: Don't ask for catalog-service when using ACCS or ACO
✅ **Transparent**: Service resolution logging shows what's provided and by whom
✅ **Extensible**: Easy to add new services and providers
✅ **Type-Safe**: Full TypeScript support with tests

#### Implementation Files

- **Schema**: `src/features/components/config/components.schema.json`
- **Types**: `src/types/components.ts`
- **Resolver**: `src/features/components/services/serviceResolver.ts`
- **Tests**: `tests/unit/features/components/services/serviceResolver.test.ts`

### 4. Configuration Field Scoping - Reusing PaaS Fields ✅

**EDS DOES use existing PaaS configuration fields!**

Both EDS and Headless frontends use the **same standard env vars** from `components.json`:

```json
{
  "frontends": {
    "eds": {
      "configuration": {
        "requiredEnvVars": [
          "MESH_ENDPOINT",  // ← Shared with headless!
          "ADOBE_COMMERCE_STORE_CODE",
          "ADOBE_COMMERCE_STORE_VIEW_CODE",
          "ADOBE_COMMERCE_WEBSITE_CODE",
          "ADOBE_CATALOG_API_KEY",
          "ADOBE_COMMERCE_ENVIRONMENT_ID"
        ]
      }
    },
    "headless": {
      "configuration": {
        "requiredEnvVars": [
          "MESH_ENDPOINT",  // ← Same as EDS!
          "ADOBE_COMMERCE_URL",
          "ADOBE_COMMERCE_STORE_VIEW_CODE",
          // ... other shared fields
        ]
      }
    }
  }
}
```

**Environment Variable Registry** (`envVars` in `components.json`):
```json
{
  "envVars": {
    "MESH_ENDPOINT": {
      "label": "Mesh Query URL",
      "type": "url",
      "required": true,
      "description": "Automatically supplied after API Mesh deployment",
      "group": "mesh"
    },
    "ACCS_HOST": {
      "label": "ACCS Host URL",
      "type": "url",
      "required": true,
      "description": "The base URL of your Adobe Commerce Cloud Service instance",
      "group": "accs"
    }
  }
}
```

**Key Point**: 
- ✅ `.env` uses **standard component env vars** (`MESH_ENDPOINT`, `ACCS_HOST`)
- ✅ `site.json` uses **EDS runtime format** (`commerce-core-endpoint`, `commerce-endpoint`)
- ✅ NO new env vars needed - reuses existing PaaS fields!

### Why site.json Has Different Field Names

**Two Configuration Layers**:

1. **Component Config** (`.env`) - For build/dev tooling
   - Uses standard registry fields: `MESH_ENDPOINT`
   - Shared across EDS and headless
   - Defined in `components.json`

2. **EDS Runtime Config** (`site.json`) - For browser runtime
   - Uses EDS-specific names: `commerce-core-endpoint`
   - Only for EDS projects
   - Maps to same underlying endpoints

**Why This Makes Sense**:
- ✅ `.env` is for **component configuration** → uses component registry
- ✅ `site.json` is for **EDS runtime** → uses EDS conventions
- ✅ Both point to the same mesh endpoint, just different names

## EDS Project Configuration Flow

### Phase 1: Configuration Building

```typescript
// In executor.ts
const backendComponentId = typedConfig.components?.backend;  // From stack
const meshEndpoint = typedConfig.apiMesh?.endpoint;          // From mesh deployment

const edsProjectConfig: EdsProjectConfig = {
    backendComponentId,      // Explicit backend from stack
    meshEndpoint,            // Optional mesh endpoint
    accsEndpoint,            // Optional ACCS endpoint
    // ... other config
};
```

### Phase 2: Environment File Generation

```typescript
// In edsSetupPhases.ts - EnvConfigPhase
async generateEnvFile(config: EdsProjectConfig, repo: GitHubRepo) {
    // Backend component determines which env vars to generate
    // IMPORTANT: Use STANDARD env var names from components.json registry
    if (config.backendComponentId === 'adobe-commerce-paas' && config.meshEndpoint) {
        // Generate PaaS env vars (standard component fields):
        // - MESH_ENDPOINT (from envVars registry, used by EDS + headless)
    } else if (config.backendComponentId === 'adobe-commerce-accs' && config.accsEndpoint) {
        // Generate ACCS env vars (standard component fields):
        // - ACCS_HOST (from envVars registry)
        // - ACCS_STORE_VIEW_CODE
    }
}
```

### Phase 3: Site.json Generation (PaaS only)

```typescript
async generateSiteJson(config: EdsProjectConfig) {
    const isPaasBackend = config.backendComponentId === 'adobe-commerce-paas';
    
    if (!isPaasBackend || !config.meshEndpoint) {
        return; // Skip for non-PaaS backends
    }
    
    // Generate site.json with PaaS endpoints (EDS runtime config format)
    // NOTE: site.json uses DIFFERENT field names than .env:
    // - site.json: commerce-core-endpoint (mesh GraphQL)
    // - site.json: commerce-endpoint (catalog service GraphQL)  
    // - .env: MESH_ENDPOINT (standard component env var)
}
```

## Data Flow Diagram

```
User Selects Stack (eds-paas)
    ↓
Stack Definition Loaded
    ├── frontend: "eds"
    └── backend: "adobe-commerce-paas"  ← Explicit backend
    ↓
Backend Component Loaded
    └── requiredEnvVars: ["ADOBE_COMMERCE_URL", ...]
    ↓
Frontend Component Loaded  
    └── requiredEnvVars: ["MESH_ENDPOINT", ...]  ← Shared with headless!
    ↓
Project Creation
    ├── Mesh Deployment (provides meshEndpoint)
    └── EDS Setup (receives backendComponentId + meshEndpoint)
    ↓
Environment Generation
    ├── Check backendComponentId === 'adobe-commerce-paas'
    ├── Generate .env with MESH_ENDPOINT (standard component field)
    └── Generate site.json with commerce-core-endpoint (EDS runtime field)
    ↓
EDS Storefront Configured
```

## Key Architectural Principles

1. **Explicit over Implicit**: Backend is explicitly selected via stack, not inferred
2. **Component-Driven**: Configuration fields are defined by components
3. **Single Source of Truth**: Stack definition is authoritative
4. **Reuse Standard Fields**: EDS uses same env vars as headless (no duplication)
5. **Separation of Concerns**: 
   - Stacks define architecture
   - Components define requirements  
   - `.env` uses component registry fields
   - `site.json` uses EDS runtime format
6. **Proper Polling**: Uses centralized PollingService with rate limiting

## Configuration File Differences

### .env (Component Configuration)
```bash
# Uses standard component registry fields
MESH_ENDPOINT=https://edge-sandbox-graph.adobe.io/api/mesh-id/graphql
ADOBE_COMMERCE_STORE_VIEW_CODE=default
```

### site.json (EDS Runtime Configuration)
```json
{
  "commerce-core-endpoint": "https://edge-sandbox-graph.adobe.io/api/mesh-id/graphql",
  "commerce-endpoint": "https://catalog-service.adobe.io/graphql",
  "store-view-code": "default"
}
```

**Note**: Both point to the same endpoints, just different naming conventions.

## Shared Configuration File Generation Pattern

### Overview

As of the refactoring in 2026, EDS configuration generation now uses **shared, reusable utilities** that provide a consistent pattern across the codebase, similar to how `.env` files are generated.

### Pattern Comparison

Both `.env` and `site.json` follow the same conceptual pattern but use appropriate helpers for their format:

| Aspect | .env (Local Dev) | site.json (EDS Runtime) |
|--------|------------------|-------------------------|
| **Format** | KEY=VALUE | JSON |
| **Helper** | `generateComponentEnvFile()` | `generateConfigFile()` |
| **Source** | Component registry + envVars | Template + placeholders |
| **Timing** | Phase 4 (standard) | Phase 0 (EDS setup) + post-mesh update |
| **Scope** | All components | EDS-specific |
| **Location** | `src/features/project-creation/helpers/envFileGenerator.ts` | `src/core/config/configFileGenerator.ts` |

### Key Difference: Two-Phase Configuration

Both `.env` and `site.json` use a **two-phase approach** when mesh endpoint is needed:

1. **Initial generation (Phase 0 for site.json, Phase 4 for .env)**: Create with placeholder/empty endpoint
2. **Post-mesh update**: Fill in actual mesh endpoint after deployment

**Critical Understanding**:
- **`.env` update happens automatically**: Phase 4's `generateEnvironmentFiles()` regenerates `.env` for ALL components (including EDS) using the deployed `project.meshState.endpoint`. No custom hook needed.
- **`site.json` update needs custom hook**: Since `site.json` is EDS-specific and NOT part of Phase 4, it requires a custom `updateSiteJsonWithMesh()` call after mesh deployment.

### Implementation

**Initial site.json generation (Phase 0)**:
```typescript
// In edsSetupPhases.ts - EnvConfigPhase
async generateSiteJson(config: EdsProjectConfig): Promise<void> {
    await generateConfigFile({
        filePath: path.join(config.componentPath, 'site.json'),
        templatePath: path.join(config.componentPath, 'default-site.json'),
        defaultConfig: {
            'commerce-core-endpoint': '',
            'commerce-endpoint': 'https://catalog-service.adobe.io/graphql',
            'store-view-code': 'default',
            'website-code': 'base',
            'store-code': 'main_website_store',
        },
        placeholders: {
            '{ENDPOINT}': config.meshEndpoint || '',  // May be empty initially
            '{CS_ENDPOINT}': 'https://catalog-service.adobe.io/graphql',
            // ... other placeholders
        },
        logger: this.logger,
        description: 'EDS runtime configuration (site.json)',
    });
}
```

**Post-mesh site.json update**:
```typescript
// In executor.ts after mesh deployment
if (isEdsStack && project.meshState?.endpoint && edsComponentPath) {
    await updateSiteJsonWithMesh(
        edsComponentPath,
        project.meshState.endpoint,
        logger
    );
}
```

**Automatic .env update (Phase 4)**:
```typescript
// In projectFinalizationService.ts
export async function generateEnvironmentFiles(context: FinalizationContext) {
    // Get deployed mesh endpoint from meshState (SINGLE SOURCE OF TRUTH)
    const deployedMeshEndpoint = project.meshState?.endpoint;
    
    // Generate .env for all non-mesh components (including EDS!)
    for (const [compId, { definition }] of componentDefinitions) {
        await generateComponentEnvFile(
            componentPath,
            compId,
            definition,
            sharedEnvVars,
            envConfig,  // ← Contains deployedMeshEndpoint
            logger,
        );
    }
}
```

### Benefits

**Code Quality**:
- ✅ **75% reduction** in EDS config code (60+ → 15 lines for generation)
- ✅ **88% reduction** in update code (40+ → 5 lines for updates)
- ✅ **Consistent pattern** across all config files

**Architecture**:
- ✅ **Reusable utilities** for any JSON config file
- ✅ **Same conceptual flow** as .env generation
- ✅ **Extensible** to other components needing JSON configs

### Configuration Error Fix

**Root Cause**: `site.json` generation was being skipped if `config.meshEndpoint` was undefined during EDS setup (Phase 0), but mesh doesn't deploy until Phase 3.

**Fix**: Allow `site.json` to be generated with empty endpoint initially, then update post-mesh:
1. Phase 0: Generate `site.json` with empty `commerce-core-endpoint`
2. Phase 3: Deploy mesh, store endpoint in `project.meshState.endpoint`
3. Post-Phase 3: Update `site.json` with actual mesh endpoint
4. Phase 4: Generate `.env` with mesh endpoint (automatic via standard pattern)

## Summary

- ✅ Backend is **explicit** from stack selection
- ✅ Configuration fields are **component-scoped** and **reused** from PaaS
- ✅ Repository readiness is **verified by PollingService**, not delays  
- ✅ Polling uses **centralized configuration** and **rate limiting**
- ✅ Architecture is **extensible** and **type-safe**
- ✅ NO duplicate env vars - EDS and headless share standard fields
- ✅ **Shared config pattern** for both .env and site.json (conceptually similar, format-specific helpers)
- ✅ **Two-phase configuration** ensures mesh endpoint always populated correctly

## Catalog Service Endpoint Architecture

### Problem
The API Mesh was directly coupled to backend-specific catalog service endpoints (`PAAS_CATALOG_SERVICE_ENDPOINT`), violating the principle of abstract service dependencies.

### Solution: Computed Variable Pattern

**Phase 2**: Update mesh template to use computed variable
```json
// mesh.json
{
  "sources": [
    {
      "name": "CatalogService",
      "handler": {
        "endpoint": "{env.CATALOG_SERVICE_ENDPOINT}"  // Computed at generation time
      }
    }
  ]
}
```

**Phase 3**: Compute value during .env generation (NOT stored in registry)
```typescript
// envFileGenerator.ts - BEFORE processing registry variables
const paasEndpoint = getConfigValue('PAAS_CATALOG_SERVICE_ENDPOINT');
const accsEndpoint = getConfigValue('ACCS_CATALOG_SERVICE_ENDPOINT');

if (paasEndpoint || accsEndpoint) {
    const derivedEndpoint = paasEndpoint || accsEndpoint;
    derivedValues.set('CATALOG_SERVICE_ENDPOINT', derivedEndpoint!);
    
    // Add as synthetic entry (not in registry)
    relevantVars.push({
        key: 'CATALOG_SERVICE_ENDPOINT',
        label: 'CATALOG_SERVICE_ENDPOINT',
        type: 'string',
        required: true,
        description: 'Computed from backend-specific source',
        group: 'catalog-service',
        usedBy: [componentId],
    });
}
```

**Phase 4**: Remove legacy variable
- `ADOBE_CATALOG_SERVICE_ENDPOINT` marked as deprecated
- Will be removed in future version after migration

### Key Architecture Decisions

**❌ NOT in components.json registry**
- `CATALOG_SERVICE_ENDPOINT` is NOT user input
- No UI metadata needed
- Purely a runtime-computed value
- Implementation detail of generation logic

**✅ Computed during generation**
- Derived from `PAAS_CATALOG_SERVICE_ENDPOINT` or `ACCS_CATALOG_SERVICE_ENDPOINT`
- Added as "synthetic entry" to output
- Written to `.env` and `site.json` like any other variable
- But doesn't pollute the registry

### Architecture Benefits

✅ **Separation of Concerns**: Mesh doesn't know about backend implementations  
✅ **Registry Purity**: Only user-facing fields in components.json  
✅ **Clean Interface**: Computed variable for consumers, backend-specific vars for configuration  
✅ **No Breaking Changes**: Phased migration with backward compatibility  
✅ **Maintainable**: Clear ownership - backends own their specific endpoints, generation layer computes consumer interface