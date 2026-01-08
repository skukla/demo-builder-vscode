# Service Resolution Pattern

## Overview

The **Service Resolution Pattern** enables intelligent dependency management in the component registry by allowing components to declare what services they **provide** in addition to what services they **require**.

This eliminates redundant service prompts and configuration when services are already satisfied by the selected backend or addons.

## Problem Statement

### Before: Redundant Service Configuration

Without service resolution, the system would prompt users for services even when they're already available:

```
User selects: ACCS backend
❌ System still prompts: "Add Catalog Service?"
❌ System still prompts: "Add Live Search?"
```

This is wrong because:
- ACCS provides both services built-in
- User wastes time configuring redundant services
- Configuration becomes cluttered with unnecessary entries

### Similar Problem with Addons

```
User selects: PaaS backend + ACO addon
❌ System still prompts: "Add Catalog Service?"
❌ System still prompts: "Add Live Search?"
```

This is wrong because:
- ACO addon provides both services
- User already made the choice by selecting ACO
- Redundant prompts create poor UX

## Solution: providesServices Architecture

### Schema Extension

Add `providesServices` to component configuration:

```json
{
  "component": {
    "configuration": {
      "requiredServices": ["service-a", "service-b"],
      "providesServices": ["service-x", "service-y"]
    }
  }
}
```

### Real-World Examples

#### ACCS Backend (Built-in Services)

```json
{
  "adobe-commerce-accs": {
    "name": "Adobe Commerce Cloud Service",
    "configuration": {
      "providesServices": ["catalog-service", "live-search"],
      "requiredEnvVars": ["ACCS_HOST", "ACCS_STORE_VIEW_CODE"]
    }
  }
}
```

**Meaning**: ACCS includes catalog-service and live-search out of the box.

#### PaaS Backend (Requires Services)

```json
{
  "adobe-commerce-paas": {
    "name": "Adobe Commerce PaaS",
    "configuration": {
      "requiredServices": ["catalog-service", "live-search"],
      "requiredEnvVars": [
        "ADOBE_COMMERCE_URL",
        "ADOBE_COMMERCE_GRAPHQL_ENDPOINT",
        "PAAS_CATALOG_SERVICE_ENDPOINT"
      ]
    }
  }
}
```

**Meaning**: PaaS needs these services to function properly.

#### ACO Addon (Provides Services)

```json
{
  "adobe-commerce-aco": {
    "name": "Adobe Commerce Optimizer",
    "addonFor": ["adobe-commerce-paas", "adobe-commerce-accs"],
    "configuration": {
      "providesServices": ["catalog-service", "live-search"],
      "requiredEnvVars": [
        "ACO_API_URL",
        "ACO_API_KEY",
        "ACO_TENANT_ID",
        "ACO_ENVIRONMENT_ID"
      ]
    }
  }
}
```

**Meaning**: When ACO is added, it provides these services to the stack.

## Service Resolution Algorithm

### Core Function: `resolveServices()`

```typescript
export function resolveServices(
    backend: RawComponentDefinition,
    addons: RawComponentDefinition[],
    explicitServices: string[] = [],
    logger?: Logger,
): ServiceResolutionResult
```

### Resolution Steps

1. **Collect Required Services** from backend
2. **Collect Provided Services** from:
   - Backend's `providesServices`
   - Each addon's `providesServices`
   - Explicitly selected services
3. **Calculate Missing Services**: `required - provided`
4. **Build Provider Map**: Track which components provide each service

### Example Resolutions

#### Scenario 1: PaaS Alone

```typescript
const result = resolveServices(paasBackend, [], []);

// Result:
{
  requiredServices: ['catalog-service', 'live-search'],
  providedServices: [],
  missingServices: ['catalog-service', 'live-search'],
  serviceProviders: Map {}
}
```

**Action**: Prompt user to select these services.

#### Scenario 2: PaaS + ACO

```typescript
const result = resolveServices(paasBackend, [acoAddon], []);

// Result:
{
  requiredServices: ['catalog-service', 'live-search'],
  providedServices: ['catalog-service', 'live-search'],
  missingServices: [],
  serviceProviders: Map {
    'catalog-service' => ['adobe-commerce-aco'],
    'live-search' => ['adobe-commerce-aco']
  }
}
```

**Action**: No additional services needed. ACO satisfies all requirements.

#### Scenario 3: ACCS (Any Configuration)

```typescript
const result = resolveServices(accsBackend, [], []);

// Result:
{
  requiredServices: [],
  providedServices: ['catalog-service', 'live-search'],
  missingServices: [],
  serviceProviders: Map {
    'catalog-service' => ['adobe-commerce-accs'],
    'live-search' => ['adobe-commerce-accs']
  }
}
```

**Action**: No services needed. ACCS provides all built-in.

#### Scenario 4: ACCS + ACO (Redundant but Valid)

```typescript
const result = resolveServices(accsBackend, [acoAddon], []);

// Result:
{
  requiredServices: [],
  providedServices: ['catalog-service', 'live-search'],
  missingServices: [],
  serviceProviders: Map {
    'catalog-service' => ['adobe-commerce-accs', 'adobe-commerce-aco'],
    'live-search' => ['adobe-commerce-accs', 'adobe-commerce-aco']
  }
}
```

**Action**: Multiple providers detected (logged for transparency). No additional services needed.

## Implementation Details

### TypeScript Types

```typescript
// Component configuration with service declarations
export interface RawComponentDefinition {
    id: string;
    name: string;
    configuration?: {
        requiredServices?: string[];
        providesServices?: string[];  // NEW
        // ... other config
    };
}

// Service resolution result
export interface ServiceResolutionResult {
    missingServices: string[];
    providedServices: string[];
    requiredServices: string[];
    serviceProviders: Map<string, string[]>;
}
```

### Helper Functions

```typescript
// Check if a specific service is provided
isServiceProvided(serviceId: string, backend, addons): boolean

// Get all components that provide a service
getServiceProviders(serviceId: string, components): string[]
```

## Integration Points

### 1. Stack Validation

When validating a stack configuration:

```typescript
const { missingServices } = resolveServices(backend, addons);

if (missingServices.length > 0) {
    // Prompt user to select these services
    showServiceSelectionUI(missingServices);
}
```

### 2. Component Selection UI

When rendering service selection:

```typescript
// Filter out services already provided
const availableServices = allServices.filter(service => 
    !isServiceProvided(service.id, selectedBackend, selectedAddons)
);

// Only show services that are actually needed
renderServiceSelection(availableServices);
```

### 3. Configuration Generation

When generating environment files:

```typescript
const { providedServices, serviceProviders } = resolveServices(backend, addons);

// Log what's provided and by whom
logger.info('Services provided:');
serviceProviders.forEach((providers, serviceId) => {
    logger.info(`  ${serviceId}: ${providers.join(', ')}`);
});
```

## Benefits

### ✅ Better User Experience

- **No Redundant Prompts**: Don't ask for services already provided
- **Clear Choices**: Only show what's actually needed
- **Transparent**: Users can see where services come from

### ✅ Correct Configuration

- **No Duplicates**: Avoid configuring the same service twice
- **No Conflicts**: Clear provider precedence
- **Validated**: System verifies all requirements are met

### ✅ Maintainable Architecture

- **Declarative**: Components declare their capabilities
- **Self-Documenting**: `providesServices` makes dependencies explicit
- **Extensible**: Easy to add new services and providers
- **Testable**: Clear inputs/outputs, comprehensive test coverage

## Testing

### Comprehensive Test Coverage

The service resolver has 24 tests covering:

- ✅ PaaS backend scenarios (alone, with ACO, with non-service addons)
- ✅ ACCS backend scenarios (alone, with ACO, with addons)
- ✅ Edge cases (no config, multiple providers, partial coverage)
- ✅ Deduplication logic
- ✅ Logging behavior
- ✅ Helper functions (`isServiceProvided`, `getServiceProviders`)

### Running Tests

```bash
npm test -- serviceResolver.test.ts
```

All tests pass with 100% coverage of the resolver logic.

## Future Enhancements

### 1. Service Version Compatibility

Track service versions for compatibility checking:

```json
{
  "providesServices": [
    { "id": "catalog-service", "version": "2.0" }
  ]
}
```

### 2. Conditional Services

Support conditional service requirements:

```json
{
  "requiredServices": [
    {
      "id": "catalog-service",
      "condition": "when: backend === 'adobe-commerce-paas'"
    }
  ]
}
```

### 3. Service Alternatives

Allow components to satisfy requirements with alternatives:

```json
{
  "providesServices": [
    { "id": "search", "satisfies": ["live-search", "elasticsearch"] }
  ]
}
```

## Related Documentation

- [EDS Backend Configuration](./eds-backend-configuration.md) - Service resolution in EDS context
- [Component Registry Schema](../../src/features/components/config/components.schema.json) - Full schema definition
- [Component Types](../../src/types/components.ts) - TypeScript type definitions

## Files

- **Schema**: `src/features/components/config/components.schema.json`
- **Types**: `src/types/components.ts`
- **Resolver**: `src/features/components/services/serviceResolver.ts`
- **Tests**: `tests/unit/features/components/services/serviceResolver.test.ts`
- **Components**: `src/features/components/config/components.json`
