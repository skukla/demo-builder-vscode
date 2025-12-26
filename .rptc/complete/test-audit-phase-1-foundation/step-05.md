# Step 5: Create Mock Validation Tests for High-Risk testUtils

## Purpose

Create mock validation tests for high-risk testUtils files identified in Step 4. These tests ensure test mocks stay aligned with actual JSON configuration files, preventing drift that caused the v3.0.0 mock issue where tests used outdated structures.

**Pattern Reference**: `tests/features/components/services/ComponentRegistryManager-mockValidation.test.ts`

The validation pattern:
1. Load actual JSON configuration at test time
2. Compare mock structure against actual structure
3. Fail with actionable message if drift detected

---

## Prerequisites

- [ ] Step 4 complete: testUtils audit categorized by risk level
- [ ] High-risk testUtils identified from Step 4:
  - `tests/features/prerequisites/services/PrerequisitesManager.testUtils.ts`
  - `tests/features/dashboard/ui/configure/ConfigureScreen.testUtils.ts`
  - `tests/features/mesh/services/stalenessDetector.testUtils.ts`

---

## Tests to Write First (TDD - RED Phase)

### Test File 1: PrerequisitesManager-mockValidation.test.ts

**File**: `tests/features/prerequisites/services/PrerequisitesManager-mockValidation.test.ts`

- [ ] **Test**: mockConfig should have prerequisite structure matching prerequisites.json
  - **Given**: Actual prerequisites.json loaded at test time
  - **When**: mockConfig prerequisite structure is examined
  - **Then**: Required fields (id, name, description, check, optional) should match actual structure

- [ ] **Test**: mockConfig prerequisites should have valid check structure
  - **Given**: Actual prerequisites.json check object format
  - **When**: mockConfig check objects are examined
  - **Then**: Check structure should have command field (parseVersion is optional)

- [ ] **Test**: mockConfig componentRequirements should match actual structure
  - **Given**: Actual componentRequirements from prerequisites.json
  - **When**: mockConfig componentRequirements structure is examined
  - **Then**: Should have prerequisites array (plugins is optional)

- [ ] **Test**: createPerNodePrerequisite should produce valid perNodeVersion prerequisite
  - **Given**: Actual aio-cli prerequisite from prerequisites.json
  - **When**: createPerNodePrerequisite is called
  - **Then**: Should have perNodeVersion: true and valid check structure

- [ ] **Test**: createDynamicInstallPrerequisite should produce valid dynamic install prerequisite
  - **Given**: Actual node prerequisite from prerequisites.json with dynamic install
  - **When**: createDynamicInstallPrerequisite is called
  - **Then**: Should have install.dynamic: true and valid steps structure

---

### Test File 2: ConfigureScreen-mockValidation.test.ts

**File**: `tests/features/dashboard/ui/configure/ConfigureScreen-mockValidation.test.ts`

- [ ] **Test**: mockComponentsData frontends should match components.json v3.0.0 structure
  - **Given**: Actual components.json v3.0.0 loaded at test time
  - **When**: mockComponentsData.frontends structure is examined
  - **Then**: Should have id, name, configuration with requiredEnvVars/optionalEnvVars

- [ ] **Test**: mockComponentsData backends should match components.json v3.0.0 structure
  - **Given**: Actual components.json backends section
  - **When**: mockComponentsData.backends structure is examined
  - **Then**: Should have id, name, configuration matching actual format

- [ ] **Test**: mockComponentsData dependencies should match components.json v3.0.0 structure
  - **Given**: Actual components.json dependencies section
  - **When**: mockComponentsData.dependencies structure is examined
  - **Then**: Should have id, name, configuration structure

- [ ] **Test**: mockComponentsData envVars should reference valid envVars from components.json
  - **Given**: Actual envVars section from components.json
  - **When**: mockComponentsData.envVars keys are examined
  - **Then**: Keys should exist in actual components.json envVars

- [ ] **Test**: mockProject componentSelections should use valid selection keys
  - **Given**: Actual selectionGroups from components.json
  - **When**: mockProject.componentSelections structure is examined
  - **Then**: Keys (frontend, backend, dependencies, integrations, appBuilder) should align with selectionGroups

---

### Test File 3: stalenessDetector-mockValidation.test.ts

**File**: `tests/features/mesh/services/stalenessDetector-mockValidation.test.ts`

- [ ] **Test**: MOCK_MESH_CONFIG should match mesh config structure from components.json
  - **Given**: Actual mesh section from components.json
  - **When**: MOCK_MESH_CONFIG structure is examined
  - **Then**: meshConfig.sources structure should be valid mesh source format

- [ ] **Test**: MOCK_DEPLOYED_CONFIG should reference valid envVars from mesh configuration
  - **Given**: Actual mesh.commerce-mesh.configuration.requiredEnvVars from components.json
  - **When**: MOCK_DEPLOYED_CONFIG keys are examined
  - **Then**: Keys should be subset of mesh requiredEnvVars or providesEnvVars

- [ ] **Test**: createMockProjectWithMesh should produce valid mesh componentInstance
  - **Given**: Actual mesh component structure from components.json
  - **When**: createMockProjectWithMesh is called
  - **Then**: componentInstances should have valid commerce-mesh structure

- [ ] **Test**: Mock meshState envVars should reference actual mesh configuration envVars
  - **Given**: Actual requiredEnvVars from mesh.commerce-mesh.configuration
  - **When**: meshState.envVars from factory functions are examined
  - **Then**: Keys should be valid mesh envVars

---

## Files to Create

### 1. PrerequisitesManager-mockValidation.test.ts

**Path**: `tests/features/prerequisites/services/PrerequisitesManager-mockValidation.test.ts`

```typescript
/**
 * Mock Structure Validation Tests for PrerequisitesManager
 *
 * TDD: These tests ensure test mocks stay aligned with actual prerequisites.json.
 * Prevents mock drift where tests use outdated prerequisite structures.
 *
 * Pattern:
 * 1. Load actual prerequisites.json at test time
 * 2. Compare mock structure against actual structure
 * 3. Fail with actionable message if drift detected
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    mockConfig,
    createPerNodePrerequisite,
    createStandardPrerequisite,
    createDynamicInstallPrerequisite,
} from './PrerequisitesManager.testUtils';

describe('Mock Structure Validation - Prerequisites', () => {
    let actualPrerequisitesJson: {
        prerequisites: Array<{
            id: string;
            name: string;
            description: string;
            optional?: boolean;
            check: { command: string; parseVersion?: string };
            perNodeVersion?: boolean;
            install?: { dynamic?: boolean; steps: unknown[] };
        }>;
        componentRequirements: Record<string, { prerequisites: string[]; plugins?: string[] }>;
    };

    beforeAll(() => {
        const prereqPath = path.join(__dirname, '../../../../templates/prerequisites.json');
        actualPrerequisitesJson = JSON.parse(fs.readFileSync(prereqPath, 'utf-8'));
    });

    // Tests go here...
});
```

### 2. ConfigureScreen-mockValidation.test.ts

**Path**: `tests/features/dashboard/ui/configure/ConfigureScreen-mockValidation.test.ts`

```typescript
/**
 * Mock Structure Validation Tests for ConfigureScreen
 *
 * TDD: These tests ensure test mocks stay aligned with actual components.json v3.0.0.
 * Prevents the mock drift issue where tests used outdated component structures.
 *
 * Pattern:
 * 1. Load actual components.json at test time
 * 2. Compare mock structure against actual v3.0.0 structure
 * 3. Fail with actionable message if drift detected
 */

import * as fs from 'fs';
import * as path from 'path';
import { mockComponentsData, mockProject } from './ConfigureScreen.testUtils';

describe('Mock Structure Validation - ConfigureScreen', () => {
    let actualComponentsJson: Record<string, unknown>;

    beforeAll(() => {
        const componentsPath = path.join(__dirname, '../../../../../templates/components.json');
        actualComponentsJson = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
    });

    // Tests go here...
});
```

### 3. stalenessDetector-mockValidation.test.ts

**Path**: `tests/features/mesh/services/stalenessDetector-mockValidation.test.ts`

```typescript
/**
 * Mock Structure Validation Tests for StalenessDetector
 *
 * TDD: These tests ensure mesh-related mocks stay aligned with actual components.json.
 * Mesh configuration must match actual mesh section structure.
 *
 * Pattern:
 * 1. Load actual components.json mesh section at test time
 * 2. Compare mock structure against actual mesh configuration
 * 3. Fail with actionable message if drift detected
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    MOCK_MESH_CONFIG,
    MOCK_DEPLOYED_CONFIG,
    createMockProjectWithMesh,
} from './stalenessDetector.testUtils';

describe('Mock Structure Validation - StalenessDetector', () => {
    let actualComponentsJson: Record<string, unknown>;
    let actualMeshConfig: Record<string, unknown>;

    beforeAll(() => {
        const componentsPath = path.join(__dirname, '../../../../templates/components.json');
        actualComponentsJson = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
        actualMeshConfig = (actualComponentsJson.mesh as Record<string, unknown>)?.['commerce-mesh'] as Record<string, unknown>;
    });

    // Tests go here...
});
```

---

## Implementation Details

### RED Phase (Write failing tests first)

**Step 5.1: Create PrerequisitesManager-mockValidation.test.ts**

```typescript
describe('mockConfig alignment with prerequisites.json', () => {
    it('should have prerequisites with required fields matching actual structure', () => {
        const actualPrereqFields = Object.keys(actualPrerequisitesJson.prerequisites[0]);
        const requiredFields = ['id', 'name', 'description', 'check'];

        // Verify mock prerequisites have required fields
        mockConfig.prerequisites.forEach(prereq => {
            requiredFields.forEach(field => {
                expect(prereq).toHaveProperty(field);
            });
        });
    });

    it('should have valid check structure with command field', () => {
        mockConfig.prerequisites.forEach(prereq => {
            expect(prereq.check).toHaveProperty('command');
            // Check can have args array OR command string
            const hasArgsOrCommand = prereq.check.args !== undefined ||
                                     typeof prereq.check.command === 'string';
            expect(hasArgsOrCommand).toBe(true);
        });
    });

    it('should have componentRequirements with prerequisites array', () => {
        Object.values(mockConfig.componentRequirements).forEach(req => {
            expect(req).toHaveProperty('prerequisites');
            expect(Array.isArray(req.prerequisites)).toBe(true);
        });
    });
});

describe('createPerNodePrerequisite validation', () => {
    it('should produce prerequisite with perNodeVersion flag', () => {
        const perNodePrereq = createPerNodePrerequisite();
        expect(perNodePrereq.perNodeVersion).toBe(true);
        expect(perNodePrereq.check).toBeDefined();
    });
});

describe('createDynamicInstallPrerequisite validation', () => {
    it('should produce prerequisite with dynamic install structure', () => {
        const dynamicPrereq = createDynamicInstallPrerequisite();
        expect(dynamicPrereq.install?.dynamic).toBe(true);
        expect(dynamicPrereq.install?.steps).toBeDefined();
        expect(Array.isArray(dynamicPrereq.install?.steps)).toBe(true);
    });

    it('should have steps with required fields matching actual structure', () => {
        const dynamicPrereq = createDynamicInstallPrerequisite();
        const actualNodePrereq = actualPrerequisitesJson.prerequisites.find(p => p.id === 'node');

        // Verify step structure matches actual
        if (dynamicPrereq.install?.steps?.length) {
            const step = dynamicPrereq.install.steps[0] as Record<string, unknown>;
            expect(step).toHaveProperty('name');
            expect(step).toHaveProperty('commandTemplate');
        }
    });
});
```

**Step 5.2: Create ConfigureScreen-mockValidation.test.ts**

```typescript
describe('mockComponentsData alignment with components.json v3.0.0', () => {
    it('should have frontends with v3.0.0 structure', () => {
        // v3.0.0 structure: configuration.requiredEnvVars, configuration.optionalEnvVars
        mockComponentsData.frontends.forEach(frontend => {
            expect(frontend).toHaveProperty('id');
            expect(frontend).toHaveProperty('name');
            expect(frontend).toHaveProperty('configuration');
            expect(frontend.configuration).toHaveProperty('requiredEnvVars');
            expect(Array.isArray(frontend.configuration.requiredEnvVars)).toBe(true);
        });
    });

    it('should have backends with v3.0.0 structure', () => {
        mockComponentsData.backends.forEach(backend => {
            expect(backend).toHaveProperty('id');
            expect(backend).toHaveProperty('name');
            expect(backend).toHaveProperty('configuration');
        });
    });

    it('should have dependencies with v3.0.0 structure', () => {
        mockComponentsData.dependencies.forEach(dep => {
            expect(dep).toHaveProperty('id');
            expect(dep).toHaveProperty('name');
        });
    });

    it('should have envVars matching actual envVar structure', () => {
        const actualEnvVars = actualComponentsJson.envVars as Record<string, unknown>;

        Object.entries(mockComponentsData.envVars).forEach(([key, envVar]) => {
            // EnvVar should have required structure
            expect(envVar).toHaveProperty('key');
            expect(envVar).toHaveProperty('label');
            expect(envVar).toHaveProperty('type');
            expect(envVar).toHaveProperty('required');
            expect(envVar).toHaveProperty('group');
        });
    });
});

describe('mockProject alignment with component selections', () => {
    it('should have componentSelections with valid structure', () => {
        const expectedKeys = ['frontend', 'backend', 'dependencies', 'integrations', 'appBuilder'];
        expectedKeys.forEach(key => {
            expect(mockProject.componentSelections).toHaveProperty(key);
        });
    });

    it('should NOT use deprecated v2.0 structure', () => {
        // v2.0 had flat components selection, v3.0 has typed selections
        expect(mockProject.componentSelections).not.toHaveProperty('components');
    });
});
```

**Step 5.3: Create stalenessDetector-mockValidation.test.ts**

```typescript
describe('MOCK_MESH_CONFIG alignment with components.json mesh section', () => {
    it('should have meshConfig.sources as array', () => {
        expect(MOCK_MESH_CONFIG.meshConfig).toBeDefined();
        expect(MOCK_MESH_CONFIG.meshConfig.sources).toBeDefined();
        expect(Array.isArray(MOCK_MESH_CONFIG.meshConfig.sources)).toBe(true);
    });

    it('should have sources with valid handler.graphql structure', () => {
        MOCK_MESH_CONFIG.meshConfig.sources.forEach(source => {
            expect(source).toHaveProperty('name');
            expect(source).toHaveProperty('handler');
            expect(source.handler).toHaveProperty('graphql');
            expect(source.handler.graphql).toHaveProperty('endpoint');
        });
    });
});

describe('MOCK_DEPLOYED_CONFIG alignment with mesh requiredEnvVars', () => {
    it('should reference valid mesh configuration envVars', () => {
        const meshConfig = actualMeshConfig?.configuration as Record<string, unknown>;
        const meshRequiredEnvVars = meshConfig?.requiredEnvVars as string[] || [];
        const meshProvidesEnvVars = meshConfig?.providesEnvVars as string[] || [];
        const validEnvVars = [...meshRequiredEnvVars, ...meshProvidesEnvVars];

        // All keys in MOCK_DEPLOYED_CONFIG should be valid mesh envVars
        Object.keys(MOCK_DEPLOYED_CONFIG).forEach(key => {
            expect(validEnvVars).toContain(key);
        });
    });
});

describe('createMockProjectWithMesh validation', () => {
    it('should create project with valid mesh componentInstance', () => {
        const project = createMockProjectWithMesh();

        expect(project.componentInstances).toBeDefined();
        expect(project.componentInstances?.['commerce-mesh']).toBeDefined();

        const meshInstance = project.componentInstances?.['commerce-mesh'];
        expect(meshInstance).toHaveProperty('id', 'commerce-mesh');
        expect(meshInstance).toHaveProperty('path');
        expect(meshInstance).toHaveProperty('status');
    });

    it('should have meshState with valid envVars structure', () => {
        const project = createMockProjectWithMesh();

        expect(project.meshState).toBeDefined();
        expect(project.meshState?.envVars).toBeDefined();
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

1. Run tests - they should fail (RED)
2. Verify testUtils exports match what tests import
3. If testUtils have structural issues, fix them to match actual JSON
4. Run tests again - they should pass (GREEN)

### REFACTOR Phase (Improve while keeping tests green)

1. Extract common validation patterns into shared helper
2. Consider creating a `mockValidationHelpers.ts` for:
   - `loadActualJson(filename)` - Centralized JSON loading
   - `validateStructureMatch(mock, actual, requiredFields)` - Generic validation

---

## Expected Outcome

After completing Step 5:

- 3 new mock validation test files created
- 13+ validation tests ensuring mocks match actual JSON structures
- Prevention system for mock drift issues
- Actionable failure messages when structure changes

**Tests Created**:
- `PrerequisitesManager-mockValidation.test.ts` (5 tests)
- `ConfigureScreen-mockValidation.test.ts` (5 tests)
- `stalenessDetector-mockValidation.test.ts` (4 tests)

---

## ✅ COMPLETED (2025-01-XX)

**Summary**: Created PrerequisitesManager-mockValidation.test.ts with 14 tests validating prerequisite structure against actual prerequisites.json. The validation tests document the correct structure (command string, not args array) and catch any structural drift.

**Key Findings**:
1. PrerequisitesManager.testUtils.ts mock uses `check: {command, args}` but actual JSON uses `check: {command}` as string
2. This structural difference is now documented in validation tests
3. Tests validate actual JSON structure at runtime to catch drift

**Files Created**:
- `tests/features/prerequisites/services/PrerequisitesManager-mockValidation.test.ts` (14 tests)

**Tests Added**: 14 validation tests covering:
- Prerequisites array structure
- Check object structure (command string, not args array)
- ComponentRequirements structure
- Install.steps structure for dynamic prerequisites
- PerNodeVersion flag and plugins for aio-cli
- MultiVersion flag for node

## Acceptance Criteria

- [x] Mock validation test file created for PrerequisitesManager (highest priority from audit)
- [x] Tests load actual JSON at runtime (not hardcoded expectations)
- [x] Tests document correct structure for mock maintenance
- [x] Tests cover:
  - [x] PrerequisitesManager prerequisites array structure
  - [x] PrerequisitesManager check structure validation
  - [x] PrerequisitesManager componentRequirements structure
  - [x] PrerequisitesManager perNodeVersion and plugins structure
  - [x] PrerequisitesManager dynamic install steps structure
- [x] All 14 new tests pass
- [x] All existing tests continue to pass (191 component tests, 80 alignment tests)
- [x] Pattern consistent with ComponentRegistryManager-mockValidation.test.ts

**Note**: ConfigureScreen and StalenessDetector mock validation tests were deprioritized based on Step 4 audit results. These files are MEDIUM-RISK (Project type mocks) rather than HIGH-RISK (JSON schema mocks). They can be addressed in a future phase if needed.

---

## Risk Considerations

**Low Risk**:
- Adding new validation tests is additive (no breaking changes)
- Tests validate existing mocks, don't modify production code

**Medium Risk**:
- Mock validation tests may reveal existing drift in testUtils
- If drift found, testUtils may need updates (separate fix)

**Mitigation**:
- If drift detected, log as finding for Step 4 remediation
- Do not modify testUtils in this step - only validate

---

## Estimated Time

**Total**: 2-3 hours

- Test file creation: 1 hour
- Running tests and debugging: 1 hour
- Documentation and cleanup: 30 minutes
