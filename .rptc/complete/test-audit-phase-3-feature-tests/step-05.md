# Step 5: Components Feature Tests (30 files)

> **Phase:** 3 - Feature Tests
> **Step:** 5 of 9
> **Feature:** components
> **Test Files:** 30
> **Estimated Time:** 3-4 hours

---

## Purpose

Audit all 30 components test files to ensure tests accurately reflect the current component registry structure (v3.0.0), component definitions, and selection logic. Components define what gets installed in demo projects.

---

## Prerequisites

- [ ] Steps 1-4 complete or in parallel
- [ ] Phase 1 (Foundation) complete (.components! migration done)
- [ ] All current tests pass before starting audit
- [ ] Read current components implementation structure

---

## Test Files to Audit

### UI Components (1 file)

- [ ] `tests/features/components/ui/components/ConfigFieldRenderer.test.tsx`

### UI Steps (5 files)

- [ ] `tests/features/components/ui/steps/ComponentSelectionStep-dependencies.test.tsx`
- [ ] `tests/features/components/ui/steps/ComponentSelectionStep-display.test.tsx`
- [ ] `tests/features/components/ui/steps/ComponentSelectionStep-selection.test.tsx`
- [ ] `tests/features/components/ui/steps/ComponentSelectionStep-simplified.test.tsx`
- [ ] `tests/features/components/ui/steps/ComponentSelectionStep-validation.test.tsx`

### UI Step Hooks (1 file)

- [ ] `tests/features/components/ui/steps/hooks/useConfigValidation.test.tsx`

### UI Hooks (1 file)

- [ ] `tests/features/components/ui/hooks/useConfigNavigation.test.tsx`

### Providers (2 files)

- [ ] `tests/features/components/providers/componentTreeProvider-registration.test.ts`
- [ ] `tests/features/components/providers/componentTreeProvider.test.ts`

### Handlers (1 file)

- [ ] `tests/features/components/handlers/componentHandlers.test.ts`

### Services (19 files)

- [ ] `tests/features/components/services/ComponentRegistryManager-configuration.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-dependencies.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-initialization.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-loading.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-mockValidation.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-nodeVersions.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-registration.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-retrieval.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-security.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-v3Structure.test.ts`
- [ ] `tests/features/components/services/ComponentRegistryManager-validation.test.ts`
- [ ] `tests/features/components/services/componentManager-install-git-clone.test.ts`
- [ ] `tests/features/components/services/componentManager-install-git-dependencies.test.ts`
- [ ] `tests/features/components/services/componentManager-install-simple.test.ts`
- [ ] `tests/features/components/services/componentManager-install-version-detection.test.ts`
- [ ] `tests/features/components/services/componentManager-installNpmDependencies.test.ts`
- [ ] `tests/features/components/services/componentManager-lifecycle.test.ts`
- [ ] `tests/features/components/services/componentManager-query.test.ts`
- [ ] `tests/features/components/services/serviceGroupTransforms.test.ts`

---

## Audit Checklist Per File

### 1. Registry Structure (v3.0.0)

```typescript
// VERIFY: All mocks use v3.0.0 categorical structure
// Check templates/components.json for current structure

// v3.0.0 STRUCTURE (CURRENT):
const registry = {
  version: '3.0.0',
  frontends: {
    eds: { /* component definition */ }
  },
  backends: {
    'adobe-commerce-paas': { /* component definition */ }
  },
  mesh: {
    'commerce-mesh': { /* component definition */ }
  },
  services: {
    'da-live': { /* component definition */ }
  }
};

// OLD v2.0 STRUCTURE (DEPRECATED):
const registry = {
  version: '2.0',
  components: {
    frontend1: { /* ... */ },
    backend1: { /* ... */ }
  }
};
```

### 2. Component Definition Shape

```typescript
// VERIFY: Component definitions match current schema
// Check templates/components.json for field names

// Example: Component definition
const component = {
  id: 'eds',
  name: 'Edge Delivery Services',
  type: 'frontend',
  description: '...',
  repository: '...',
  version: '...',
  dependencies: [],
  nodeVersion: '20',
  envVars: [...],
  // Verify all fields exist and match types
};
```

### 3. Selection State Structure

```typescript
// VERIFY: Selection state uses categorical structure
// Check src/features/components/types.ts

// CURRENT: Categorical selection
const selection = {
  frontends: ['eds'],
  backends: ['adobe-commerce-paas'],
  mesh: ['commerce-mesh'],
  services: ['da-live']
};

// OLD: Flat array
const selection = ['eds', 'adobe-commerce-paas'];
```

### 4. Dependency Resolution

```typescript
// VERIFY: Dependency tests match current resolution logic
// Check src/features/components/services/ComponentRegistryManager.ts

// Key areas:
// - Dependency graph traversal
// - Cross-category dependencies (backend depends on mesh)
// - Circular dependency detection
```

### 5. Node Version Requirements

```typescript
// VERIFY: Node version tests match current requirements
// Check templates/components.json for nodeVersion fields

// Example: Component-specific Node version
const component = {
  id: 'adobe-commerce-paas',
  nodeVersion: '18',
  // Verify this matches actual JSON
};
```

### 6. Installation Logic

```typescript
// VERIFY: Installation tests match current flow
// Check src/features/components/services/componentManager.ts

// Key areas:
// - Git clone parameters
// - npm install options
// - Version detection
// - Dependency ordering
```

### 7. Config Field Rendering

```typescript
// VERIFY: Config field tests match current component config schema
// Check templates/components.json config fields

// Example: Config field
const configField = {
  name: 'commerceUrl',
  type: 'text',
  label: 'Commerce URL',
  required: true,
  // Verify all field properties
};
```

---

## Key Source Files to Reference

| Source File | Purpose |
|-------------|---------|
| `src/features/components/types.ts` | Type definitions |
| `src/features/components/services/` | Service implementations |
| `src/features/components/handlers/` | Handler implementations |
| `src/features/components/ui/` | UI components |
| `templates/components.json` | Component registry (v3.0.0) |
| `src/types/components.ts` | Shared component types |

---

## Common Issues to Look For

### Issue 1: Flat vs Categorical Structure

```typescript
// OLD: Accessing flat components map
const component = registry.components['frontend1'];

// CURRENT: Accessing categorical sections
const component = registry.frontends['eds'];
// OR using helper
const component = getComponent(registry, 'eds');
```

### Issue 2: .components! Non-Null Assertion

```typescript
// OLD: Non-null assertion on deprecated property
const components = registry.components!;

// CURRENT: Access categorical sections
const { frontends, backends, mesh, services } = registry;
```

### Issue 3: Type Assertion Changes

```typescript
// OLD: Might cast to old type
const registry = data as ComponentRegistry; // v2.0 type

// CURRENT: Use current type
const registry = data as RawComponentRegistry; // v3.0.0 type
```

### Issue 4: Selection State Shape

```typescript
// OLD: Array of component IDs
const selected = ['eds', 'commerce-backend'];

// CURRENT: Categorical object
const selected = {
  frontends: ['eds'],
  backends: ['adobe-commerce-paas']
};
```

### Issue 5: Component ID Changes

```typescript
// OLD: Generic IDs
const component = { id: 'frontend1' };

// CURRENT: Specific IDs
const component = { id: 'eds' };
// Verify against actual components.json
```

---

## Expected Outcomes

After auditing all 30 components test files:

- [ ] All registry mocks use v3.0.0 categorical structure
- [ ] No .components! assertions remain (Phase 1 follow-up)
- [ ] All component definitions match current schema
- [ ] All selection state uses categorical structure
- [ ] All dependency tests match current resolution logic
- [ ] All installation tests match current flow
- [ ] No version references (v2/v3) remain

---

## Acceptance Criteria

- [ ] All 30 components test files reviewed
- [ ] Mock data uses v3.0.0 structure exclusively
- [ ] Component definitions match templates/components.json
- [ ] Selection state is categorical (not flat array)
- [ ] Dependency resolution tests match current logic
- [ ] All components tests pass
- [ ] No .components! assertions
- [ ] No version-specific logic remains

---

## Notes

- Components tests are heavily affected by v3.0.0 migration
- Phase 1 should have migrated .components! patterns
- This step verifies Phase 1 work and catches any remaining issues
- Component IDs should match actual templates/components.json

---

## Implementation Log

_To be filled during audit_

### Files Audited

_List files as they are completed_

### Issues Found

_Document any issues requiring follow-up_

### Mock Updates Made

_Track mock structure changes for cross-feature consistency_
