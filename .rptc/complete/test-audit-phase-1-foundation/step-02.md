# Step 2: Extend type-json-alignment for prerequisites.json

## Purpose

Add type alignment tests for `templates/prerequisites.json` following the established pattern in `tests/templates/type-json-alignment.test.ts`. This ensures the TypeScript interfaces in `src/features/prerequisites/services/types.ts` remain synchronized with the JSON configuration, preventing silent runtime failures from type drift.

## Prerequisites

- [ ] Step 1 complete (component registry tests migrated)
- [ ] Understanding of existing type-json-alignment test patterns
- [ ] VERIFY: Type file exists at `src/features/prerequisites/services/types.ts` with PrerequisiteDefinition interface
- [ ] VERIFY: PrerequisiteDefinition type interface exists with expected fields (id, name, description, check, optional, install, etc.)

## Tests to Write First (TDD - RED Phase)

### Test 1: Prerequisites root config field validation
- **Given:** `templates/prerequisites.json` is loaded
- **When:** Root-level fields are scanned
- **Then:** Only `$schema`, `version`, `prerequisites`, `componentRequirements` should be present
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 2: PrerequisiteDefinition field validation
- **Given:** Each prerequisite in the `prerequisites` array
- **When:** Fields are scanned against `PREREQUISITE_DEFINITION_FIELDS`
- **Then:** No unknown fields exist (all fields match TypeScript interface)
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 3: PrerequisiteCheck field validation
- **Given:** Each prerequisite's `check` object
- **When:** Fields are scanned against `PREREQUISITE_CHECK_FIELDS`
- **Then:** Only `command`, `parseVersion`, `contains` allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 4: PrerequisiteInstall field validation
- **Given:** Each prerequisite's `install` object
- **When:** Fields are scanned against `PREREQUISITE_INSTALL_FIELDS`
- **Then:** Only valid install fields (steps, requires, dynamic, legacy fields)
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 5: InstallStep field validation
- **Given:** Each step in prerequisite `install.steps` arrays
- **When:** Fields are scanned against `INSTALL_STEP_FIELDS`
- **Then:** Only valid step fields allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 6: ProgressMilestone field validation
- **Given:** Each milestone in step `milestones` arrays
- **When:** Fields are scanned against `PROGRESS_MILESTONE_FIELDS`
- **Then:** Only `pattern`, `progress`, `message` allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 7: PrerequisitePlugin field validation
- **Given:** Each plugin in prerequisite `plugins` arrays
- **When:** Fields are scanned against `PREREQUISITE_PLUGIN_FIELDS`
- **Then:** Only valid plugin fields allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 8: Plugin install block field validation
- **Given:** Each plugin's `install` object
- **When:** Fields are scanned for valid install fields
- **Then:** Only `commands`, `message`, `steps` allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 9: Uninstall block field validation
- **Given:** Each prerequisite's `uninstall` object (if present)
- **When:** Fields are scanned against `PREREQUISITE_UNINSTALL_FIELDS`
- **Then:** Only `commands`, `message` allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 10: PostInstall block field validation
- **Given:** Each prerequisite's `postInstall` object (if present)
- **When:** Fields are scanned against `PREREQUISITE_POST_INSTALL_FIELDS`
- **Then:** Only `message` allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 11: VersionCheck field validation
- **Given:** Each prerequisite's `versionCheck` object (if present)
- **When:** Fields are scanned against `PREREQUISITE_VERSION_CHECK_FIELDS`
- **Then:** Only `command`, `parseInstalledVersions` allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

### Test 12: ComponentRequirement field validation
- **Given:** Each entry in `componentRequirements`
- **When:** Fields are scanned against `COMPONENT_REQUIREMENT_FIELDS`
- **Then:** Only `prerequisites`, `plugins` allowed
- **File:** `tests/templates/type-json-alignment.test.ts`

## Files to Modify

- [ ] `tests/templates/type-json-alignment.test.ts` - Add prerequisites.json alignment tests

## Implementation Details

### RED Phase (Write failing tests first)

Add the following field sets after the existing component field sets:

```typescript
// ============================================================================
// Prerequisites.json Field Sets
// From src/features/prerequisites/services/types.ts
// ============================================================================

/**
 * Root-level fields for prerequisites.json
 */
const PREREQUISITES_ROOT_FIELDS = new Set([
    '$schema',
    'version',
    'prerequisites',
    'componentRequirements',
]);

/**
 * PrerequisiteDefinition fields
 */
const PREREQUISITE_DEFINITION_FIELDS = new Set([
    'id',
    'name',
    'description',
    'optional',
    'depends',
    'perNodeVersion',
    'check',
    'install',
    'uninstall',
    'postInstall',
    'multiVersion',
    'versionCheck',
    'plugins',
]);

/**
 * PrerequisiteCheck fields
 */
const PREREQUISITE_CHECK_FIELDS = new Set([
    'command',
    'parseVersion',
    'contains',
]);

/**
 * PrerequisiteInstall fields
 */
const PREREQUISITE_INSTALL_FIELDS = new Set([
    // New step-based format
    'steps',
    'requires',
    'dynamic',
    // Legacy format (still supported)
    'commands',
    'message',
    'template',
    'versions',
    'manual',
    'url',
]);

/**
 * InstallStep fields
 */
const INSTALL_STEP_FIELDS = new Set([
    'name',
    'message',
    'commands',
    'commandTemplate',
    'estimatedDuration',
    'progressStrategy',
    'milestones',
    'progressParser',
    'continueOnError',
]);

/**
 * ProgressMilestone fields
 */
const PROGRESS_MILESTONE_FIELDS = new Set([
    'pattern',
    'progress',
    'message',
]);

/**
 * PrerequisitePlugin fields
 */
const PREREQUISITE_PLUGIN_FIELDS = new Set([
    'id',
    'name',
    'description',
    'check',
    'install',
    'requiredFor',
]);

/**
 * Prerequisite uninstall fields
 */
const PREREQUISITE_UNINSTALL_FIELDS = new Set([
    'commands',
    'message',
]);

/**
 * Prerequisite postInstall fields
 */
const PREREQUISITE_POST_INSTALL_FIELDS = new Set([
    'message',
]);

/**
 * Prerequisite versionCheck fields
 */
const PREREQUISITE_VERSION_CHECK_FIELDS = new Set([
    'command',
    'parseInstalledVersions',
]);

/**
 * ComponentRequirement fields
 */
const COMPONENT_REQUIREMENT_FIELDS = new Set([
    'prerequisites',
    'plugins',
]);
```

Add prerequisitesConfig loading in beforeAll:

```typescript
let prerequisitesConfig: Record<string, unknown>;

beforeAll(() => {
    // ... existing loads ...
    const prerequisitesPath = path.join(__dirname, '../../templates/prerequisites.json');
    prerequisitesConfig = JSON.parse(fs.readFileSync(prerequisitesPath, 'utf-8'));
});
```

Add new test describe block:

```typescript
// ========================================================================
// prerequisites.json alignment
// ========================================================================

describe('prerequisites.json <-> PrerequisitesConfig alignment', () => {
    it('should have no unknown fields in root config', () => {
        const unknown = findUnknownFields(prerequisitesConfig, PREREQUISITES_ROOT_FIELDS);
        if (unknown.length > 0) {
            fail(`prerequisites.json root has unknown fields: ${unknown.join(', ')}. ` +
                 `Add to PrerequisitesConfig (src/features/prerequisites/services/types.ts) or remove from JSON.`);
        }
    });

    it('should have no unknown fields in any prerequisite', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            const unknown = findUnknownFields(prereq, PREREQUISITE_DEFINITION_FIELDS);
            if (unknown.length > 0) {
                fail(formatUnknownFieldsError(
                    'Prerequisite',
                    prereq.id,
                    unknown,
                    'src/features/prerequisites/services/types.ts - PrerequisiteDefinition'
                ));
            }
        });
    });

    it('should have no unknown fields in prerequisite.check', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.check) {
                const check = prereq.check as Record<string, unknown>;
                const unknown = findUnknownFields(check, PREREQUISITE_CHECK_FIELDS);
                if (unknown.length > 0) {
                    fail(formatUnknownFieldsError(
                        'Prerequisite check',
                        prereq.id,
                        unknown,
                        'src/features/prerequisites/services/types.ts - PrerequisiteCheck'
                    ));
                }
            }
        });
    });

    it('should have no unknown fields in prerequisite.install', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.install) {
                const install = prereq.install as Record<string, unknown>;
                const unknown = findUnknownFields(install, PREREQUISITE_INSTALL_FIELDS);
                if (unknown.length > 0) {
                    fail(formatUnknownFieldsError(
                        'Prerequisite install',
                        prereq.id,
                        unknown,
                        'src/features/prerequisites/services/types.ts - PrerequisiteInstall'
                    ));
                }
            }
        });
    });

    it('should have no unknown fields in install.steps entries', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.install) {
                const install = prereq.install as Record<string, unknown>;
                if (install.steps) {
                    const steps = install.steps as Array<Record<string, unknown>>;
                    steps.forEach((step, index) => {
                        const unknown = findUnknownFields(step, INSTALL_STEP_FIELDS);
                        if (unknown.length > 0) {
                            fail(`Prerequisite "${prereq.id}" install.steps[${index}] has unknown fields: ` +
                                 `${unknown.join(', ')}. Add to InstallStep (src/features/prerequisites/services/types.ts) ` +
                                 `or remove from JSON.`);
                        }
                    });
                }
            }
        });
    });

    it('should have no unknown fields in step.milestones entries', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.install) {
                const install = prereq.install as Record<string, unknown>;
                if (install.steps) {
                    const steps = install.steps as Array<Record<string, unknown>>;
                    steps.forEach((step, stepIndex) => {
                        if (step.milestones) {
                            const milestones = step.milestones as Array<Record<string, unknown>>;
                            milestones.forEach((milestone, milestoneIndex) => {
                                const unknown = findUnknownFields(milestone, PROGRESS_MILESTONE_FIELDS);
                                if (unknown.length > 0) {
                                    fail(`Prerequisite "${prereq.id}" install.steps[${stepIndex}].milestones[${milestoneIndex}] ` +
                                         `has unknown fields: ${unknown.join(', ')}. Add to ProgressMilestone ` +
                                         `(src/features/prerequisites/services/types.ts) or remove from JSON.`);
                                }
                            });
                        }
                    });
                }
            }
        });
    });

    it('should have no unknown fields in prerequisite.plugins entries', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.plugins) {
                const plugins = prereq.plugins as Array<Record<string, unknown>>;
                plugins.forEach(plugin => {
                    const unknown = findUnknownFields(plugin, PREREQUISITE_PLUGIN_FIELDS);
                    if (unknown.length > 0) {
                        fail(`Prerequisite "${prereq.id}" plugin "${plugin.id}" has unknown fields: ` +
                             `${unknown.join(', ')}. Add to PrerequisitePlugin (src/features/prerequisites/services/types.ts) ` +
                             `or remove from JSON.`);
                    }
                });
            }
        });
    });

    it('should have no unknown fields in plugin.check blocks', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.plugins) {
                const plugins = prereq.plugins as Array<Record<string, unknown>>;
                plugins.forEach(plugin => {
                    if (plugin.check) {
                        const check = plugin.check as Record<string, unknown>;
                        const unknown = findUnknownFields(check, PREREQUISITE_CHECK_FIELDS);
                        if (unknown.length > 0) {
                            fail(`Prerequisite "${prereq.id}" plugin "${plugin.id}" check has unknown fields: ` +
                                 `${unknown.join(', ')}. Add to PrerequisiteCheck (src/features/prerequisites/services/types.ts) ` +
                                 `or remove from JSON.`);
                        }
                    }
                });
            }
        });
    });

    it('should have no unknown fields in plugin.install blocks', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        // Plugin install can have: commands, message, steps (subset of PrerequisiteInstall)
        const pluginInstallFields = new Set(['commands', 'message', 'steps']);
        prerequisites.forEach(prereq => {
            if (prereq.plugins) {
                const plugins = prereq.plugins as Array<Record<string, unknown>>;
                plugins.forEach(plugin => {
                    if (plugin.install) {
                        const install = plugin.install as Record<string, unknown>;
                        const unknown = findUnknownFields(install, pluginInstallFields);
                        if (unknown.length > 0) {
                            fail(`Prerequisite "${prereq.id}" plugin "${plugin.id}" install has unknown fields: ` +
                                 `${unknown.join(', ')}. Add to PrerequisitePlugin.install (src/features/prerequisites/services/types.ts) ` +
                                 `or remove from JSON.`);
                        }
                    }
                });
            }
        });
    });

    it('should have no unknown fields in plugin.install.steps entries', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.plugins) {
                const plugins = prereq.plugins as Array<Record<string, unknown>>;
                plugins.forEach(plugin => {
                    if (plugin.install) {
                        const install = plugin.install as Record<string, unknown>;
                        if (install.steps) {
                            const steps = install.steps as Array<Record<string, unknown>>;
                            steps.forEach((step, index) => {
                                const unknown = findUnknownFields(step, INSTALL_STEP_FIELDS);
                                if (unknown.length > 0) {
                                    fail(`Prerequisite "${prereq.id}" plugin "${plugin.id}" install.steps[${index}] ` +
                                         `has unknown fields: ${unknown.join(', ')}. Add to InstallStep ` +
                                         `(src/features/prerequisites/services/types.ts) or remove from JSON.`);
                                }
                            });
                        }
                    }
                });
            }
        });
    });

    it('should have no unknown fields in prerequisite.uninstall', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.uninstall) {
                const uninstall = prereq.uninstall as Record<string, unknown>;
                const unknown = findUnknownFields(uninstall, PREREQUISITE_UNINSTALL_FIELDS);
                if (unknown.length > 0) {
                    fail(formatUnknownFieldsError(
                        'Prerequisite uninstall',
                        prereq.id,
                        unknown,
                        'src/features/prerequisites/services/types.ts - PrerequisiteDefinition.uninstall'
                    ));
                }
            }
        });
    });

    it('should have no unknown fields in prerequisite.postInstall', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.postInstall) {
                const postInstall = prereq.postInstall as Record<string, unknown>;
                const unknown = findUnknownFields(postInstall, PREREQUISITE_POST_INSTALL_FIELDS);
                if (unknown.length > 0) {
                    fail(formatUnknownFieldsError(
                        'Prerequisite postInstall',
                        prereq.id,
                        unknown,
                        'src/features/prerequisites/services/types.ts - PrerequisiteDefinition.postInstall'
                    ));
                }
            }
        });
    });

    it('should have no unknown fields in prerequisite.versionCheck', () => {
        const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
        prerequisites.forEach(prereq => {
            if (prereq.versionCheck) {
                const versionCheck = prereq.versionCheck as Record<string, unknown>;
                const unknown = findUnknownFields(versionCheck, PREREQUISITE_VERSION_CHECK_FIELDS);
                if (unknown.length > 0) {
                    fail(formatUnknownFieldsError(
                        'Prerequisite versionCheck',
                        prereq.id,
                        unknown,
                        'src/features/prerequisites/services/types.ts - PrerequisiteDefinition.versionCheck'
                    ));
                }
            }
        });
    });

    it('should have no unknown fields in componentRequirements entries', () => {
        const componentRequirements = prerequisitesConfig.componentRequirements as Record<string, Record<string, unknown>> | undefined;
        if (!componentRequirements) return;

        Object.entries(componentRequirements).forEach(([componentId, requirement]) => {
            const unknown = findUnknownFields(requirement, COMPONENT_REQUIREMENT_FIELDS);
            if (unknown.length > 0) {
                fail(`componentRequirements.${componentId} has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to ComponentRequirement (src/features/prerequisites/services/types.ts) or remove from JSON.`);
            }
        });
    });
});
```

### GREEN Phase (Make tests pass)

The tests should pass immediately if:
1. Field sets accurately reflect current TypeScript interfaces
2. prerequisites.json has no fields unknown to the interfaces

If tests fail, either:
- Add missing fields to TypeScript interface in `src/features/prerequisites/services/types.ts`
- Remove extraneous fields from `templates/prerequisites.json`

### REFACTOR Phase

1. Consider extracting reusable validation helpers for nested structures
2. Ensure consistent error message formatting across all alignment tests
3. Consider using `it.each` pattern for repetitive tests (like component sections do)

## Expected Outcome

- All 14 new prerequisite alignment tests pass
- TypeScript interfaces validated against actual JSON structure
- No unknown fields in any prerequisite configuration level
- Type drift between JSON and TypeScript is immediately detectable

## Acceptance Criteria

- [ ] Field sets defined for all prerequisite-related types:
  - [ ] `PREREQUISITES_ROOT_FIELDS`
  - [ ] `PREREQUISITE_DEFINITION_FIELDS`
  - [ ] `PREREQUISITE_CHECK_FIELDS`
  - [ ] `PREREQUISITE_INSTALL_FIELDS`
  - [ ] `INSTALL_STEP_FIELDS`
  - [ ] `PROGRESS_MILESTONE_FIELDS`
  - [ ] `PREREQUISITE_PLUGIN_FIELDS`
  - [ ] `PREREQUISITE_UNINSTALL_FIELDS`
  - [ ] `PREREQUISITE_POST_INSTALL_FIELDS`
  - [ ] `PREREQUISITE_VERSION_CHECK_FIELDS`
  - [ ] `COMPONENT_REQUIREMENT_FIELDS`
- [ ] Prerequisites config loaded in beforeAll
- [ ] Root-level field validation test added
- [ ] PrerequisiteDefinition field validation test added
- [ ] PrerequisiteCheck field validation test added
- [ ] PrerequisiteInstall field validation test added
- [ ] InstallStep field validation test added
- [ ] ProgressMilestone field validation test added
- [ ] PrerequisitePlugin field validation test added
- [ ] Plugin check/install block tests added
- [ ] Uninstall block field validation test added
- [ ] PostInstall block field validation test added
- [ ] VersionCheck block field validation test added
- [ ] ComponentRequirement field validation test added
- [ ] All tests pass with current prerequisites.json
- [ ] Error messages reference correct TypeScript file path

## Estimated Time

1-2 hours

## Notes

- Field sets are derived from `src/features/prerequisites/services/types.ts` interfaces
- This follows the exact pattern established for templates.json, stacks.json, brands.json, and components.json
- The test structure validates every level of nesting in the prerequisites configuration
- Plugin structures have separate validation because they can have their own steps/milestones
