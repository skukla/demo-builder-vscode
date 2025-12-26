# Step 2: Extend type-json-alignment.test.ts for components.json

## Purpose
Add components.json v3.0.0 structure validation to existing type-json-alignment.test.ts, following the established pattern for templates.json, stacks.json, and brands.json.

## Prerequisites
- [ ] Step 1 complete (inventory confirms components.json gap)
- [ ] Understand existing pattern in type-json-alignment.test.ts

## Tests to Write First (RED Phase)

### Test Block: components.json <-> RawComponentRegistry alignment

- [ ] Test: root config has no unknown fields
  - **Given:** components.json loaded
  - **When:** check root-level keys against allowed set
  - **Then:** no unknown fields (allowed: $schema, version, infrastructure, frontends, backends, mesh, brands, stacks, dependencies, appBuilderApps, integrations, addons, tools, services, envVars, selectionGroups)
  - **File:** `tests/templates/type-json-alignment.test.ts`

- [ ] Test: frontends entries have no unknown fields
  - **Given:** frontends section loaded
  - **When:** validate each entry against COMPONENT_DEFINITION_FIELDS
  - **Then:** all fields match RawComponentDefinition interface
  - **File:** `tests/templates/type-json-alignment.test.ts`

- [ ] Test: backends entries have no unknown fields
  - **Given:** backends section loaded
  - **When:** validate each entry against COMPONENT_DEFINITION_FIELDS
  - **Then:** all fields match RawComponentDefinition interface
  - **File:** `tests/templates/type-json-alignment.test.ts`

- [ ] Test: configuration nested fields are valid
  - **Given:** any component with configuration block
  - **When:** validate configuration against COMPONENT_CONFIGURATION_FIELDS
  - **Then:** all nested fields match interface
  - **File:** `tests/templates/type-json-alignment.test.ts`

## Files to Modify

| Action | File | Description |
|--------|------|-------------|
| Extend | tests/templates/type-json-alignment.test.ts | Add COMPONENT_DEFINITION_FIELDS, COMPONENT_CONFIGURATION_FIELDS sets and describe block |

## Implementation Details (GREEN Phase)

1. Add field sets after existing CONTENT_SOURCES_FIELDS (line ~121):
```typescript
const COMPONENT_DEFINITION_FIELDS = new Set([
    'name', 'description', 'type', 'subType', 'icon',
    'source', 'dependencies', 'configuration',
    'compatibleBackends', 'features', 'requiresApiKey',
    'endpoint', 'requiresDeployment', 'submodules'
]);

const COMPONENT_CONFIGURATION_FIELDS = new Set([
    'requiredEnvVars', 'optionalEnvVars', 'port', 'nodeVersion',
    'buildScript', 'required', 'requiredServices', 'services',
    'meshIntegration', 'providesEndpoint', 'providesEnvVars',
    'requiresDeployment', 'deploymentTarget', 'runtime', 'actions',
    'impact', 'removable', 'defaultEnabled', 'position', 'startOpen'
]);
```

2. Add componentsConfig variable in beforeAll block
3. Add describe block following exact pattern of stacks.json/brands.json blocks
4. Validate all v3.0.0 sections: frontends, backends, mesh, dependencies, appBuilderApps

## Expected Outcome
- [ ] components.json has type alignment tests
- [ ] Tests will catch future structure drift (prevents v2.0 vs v3.0 mock issues)
- [ ] Pattern consistent with existing test blocks

## Acceptance Criteria
- [ ] Root config fields validated (all v3.0.0 sections)
- [ ] Component entries in frontends/backends/mesh validated
- [ ] Configuration nested fields validated
- [ ] Tests follow existing findUnknownFields() pattern
- [ ] Tests pass with current components.json
- [ ] No new test file created (extends existing)
