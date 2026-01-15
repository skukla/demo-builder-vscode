/**
 * Type/JSON Alignment Validation Tests
 *
 * TDD: These tests ensure TypeScript types remain synchronized with JSON configuration files.
 * Catches type drift that causes silent runtime failures.
 *
 * The key innovation here is the "no unknown fields" tests that detect when JSON
 * has fields not defined in TypeScript interfaces.
 *
 * Pattern:
 * 1. Define expected fields from TypeScript interfaces (source of truth)
 * 2. Load JSON files at test time
 * 3. Scan each object for fields not in the allowed list
 * 4. Fail with actionable error message identifying specific field and file
 *
 * Note: templates.json tests removed - replaced by demo-packages.json architecture
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Allowed Fields from TypeScript Interfaces
// These MUST stay in sync with the corresponding TypeScript interfaces.
// If you add a field to an interface, add it here too!
// ============================================================================

/**
 * Stack fields from src/types/stacks.ts
 */
const STACK_FIELDS = new Set([
    'id',
    'name',
    'description',
    'icon',
    'frontend',
    'backend',
    'dependencies',
    'optionalAddons',
    'features',
    'requiresGitHub',
    'requiresDaLive',
]);

// Note: Brand fields removed - brands.json replaced by demo-packages.json
// See: .rptc/plans/demo-packages-simplification/

// ============================================================================
// Components.json Field Sets
// From src/types/components.ts - RawComponentRegistry, RawComponentDefinition
// ============================================================================

/**
 * Root-level fields for components.json
 * All top-level sections that can appear in components.json
 */
const COMPONENTS_ROOT_FIELDS = new Set([
    '$schema',
    'version',
    'infrastructure',
    'frontends',
    'backends',
    'mesh',
    'brands',
    'stacks',
    'dependencies',
    'appBuilderApps',
    'integrations',
    'addons',
    'tools',
    'services',
    'envVars',
    'selectionGroups',
]);

/**
 * Component definition fields from RawComponentDefinition interface
 * Common fields across frontend, backend, mesh, dependencies, appBuilderApps, etc.
 */
const COMPONENT_DEFINITION_FIELDS = new Set([
    'name',
    'description',
    'type',
    'subType',
    'icon',
    'source',
    'dependencies',
    'configuration',
    'compatibleBackends',
    'features',
    'requiresApiKey',
    'endpoint',
    'requiresDeployment',
    'submodules',
    'metadata',           // Runtime metadata (e.g., EDS URLs populated at creation)
    // Additional fields found in specific sections:
    'addonFor',           // addons section
    'category',           // tools section
    'hidden',             // tools section
    'dataRepository',     // tools section
    'installPath',        // tools section
    'configDefaults',     // brands section (in components.json)
    'contentSource',      // brands section (in components.json)
    'frontend',           // stacks section
    'backend',            // stacks section
    'requiredComponents', // stacks section
    'optionalComponents', // stacks section
    'requiredEnvVars',    // services section (at top level, not in configuration)
]);

/**
 * Component configuration fields
 * From RawComponentDefinition.configuration
 */
const COMPONENT_CONFIGURATION_FIELDS = new Set([
    'requiredEnvVars',
    'optionalEnvVars',
    'requiredServices',
    'providesServices',
    'port',
    'nodeVersion',
    'buildScript',
    'required',
    'meshIntegration',
    'providesEndpoint',
    'providesEnvVars',
    'requiresDeployment',
    'configFiles',  // Config file generation settings (e.g., .env, site.json)
    'deploymentTarget',
    'runtime',
    'actions',
    'impact',
    'removable',
    'defaultEnabled',
    'position',
    'startOpen',
    'scripts',            // tools configuration
    'skipNpmInstall',     // Skip npm install (e.g., EDS is static site)
]);

/**
 * Component source fields
 * From RawComponentDefinition.source
 */
const COMPONENT_SOURCE_FIELDS = new Set([
    'type',
    'url',
    'package',
    'version',
    'branch',
    'gitOptions',
    'timeouts',
]);

/**
 * Git options fields
 */
const COMPONENT_GIT_OPTIONS_FIELDS = new Set([
    'shallow',
    'recursive',
    'tag',
    'commit',
]);

/**
 * EnvVar definition fields from components.json envVars section
 */
const ENV_VAR_DEFINITION_FIELDS = new Set([
    'label',
    'type',
    'required',
    'default',
    'placeholder',
    'description',
    'help',
    'group',
    'providedBy',
    'usedBy',
    'derivedFrom',  // NEW: For computed variables (e.g., ADOBE_CATALOG_SERVICE_ENDPOINT from PAAS_...)
    'options',
    'validation',
]);

/**
 * Selection groups fields
 */
const SELECTION_GROUPS_FIELDS = new Set([
    'frontends',
    'backends',
    'stacks',
    'brands',
    'dependencies',
    'appBuilderApps',
    'integrations',
    'addons',
    'tools',
]);

/**
 * Service definition fields
 * From ServiceDefinition
 */
const SERVICE_DEFINITION_FIELDS = new Set([
    'name',
    'description',
    'backendSpecific',
    'requiredEnvVars',
    'requiredEnvVarsByBackend',
    'optionalEnvVars',
    'required',
    'endpoint',
    'requiresApiKey',
]);

// ============================================================================
// Prerequisites.json Field Sets
// From src/features/prerequisites/services/types.ts
// ============================================================================

/**
 * Root-level fields for prerequisites.json
 * From PrerequisitesConfig interface
 */
const PREREQUISITES_ROOT_FIELDS = new Set([
    '$schema',
    'version',
    'prerequisites',
    'componentRequirements',
]);

/**
 * PrerequisiteDefinition fields
 * From src/features/prerequisites/services/types.ts
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
 * From src/features/prerequisites/services/types.ts
 */
const PREREQUISITE_CHECK_FIELDS = new Set([
    'command',
    'parseVersion',
    'contains',
    'parseInstalledVersions',
]);

/**
 * PrerequisiteInstall fields
 * From src/features/prerequisites/services/types.ts
 */
const PREREQUISITE_INSTALL_FIELDS = new Set([
    'commands',
    'message',
    'requires',
    'dynamic',
    'template',
    'versions',
    'manual',
    'url',
    'steps',
]);

/**
 * InstallStep fields
 * From src/features/prerequisites/services/types.ts
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
 * From src/features/prerequisites/services/types.ts
 */
const PROGRESS_MILESTONE_FIELDS = new Set([
    'pattern',
    'progress',
    'message',
]);

/**
 * PrerequisitePlugin fields
 * From src/features/prerequisites/services/types.ts
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
 * ComponentRequirement fields
 * From src/features/prerequisites/services/types.ts
 */
const COMPONENT_REQUIREMENT_FIELDS = new Set([
    'prerequisites',
    'plugins',
    'nodeVersions',
]);

/**
 * PostInstall fields
 * From src/features/prerequisites/services/types.ts
 */
const POST_INSTALL_FIELDS = new Set([
    'message',
    'action',
]);

// ============================================================================
// Logging.json Field Sets
// From src/core/logging/stepLogger.ts - LoggingTemplates interface
// ============================================================================

/**
 * Root-level fields for logging.json
 * From LoggingTemplates interface: operations, statuses, [key: string] index signature
 * Note: Index signature allows extensibility, but current implementation only uses these two
 */
const LOGGING_ROOT_FIELDS = new Set([
    'operations',
    'statuses',
]);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all field names from an object (shallow)
 */
function getObjectFields(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
}

/**
 * Find fields in object that are not in the allowed set
 */
function findUnknownFields(
    obj: Record<string, unknown>,
    allowedFields: Set<string>
): string[] {
    return getObjectFields(obj).filter(field => !allowedFields.has(field));
}

/**
 * Format an actionable error message for unknown fields
 */
function formatUnknownFieldsError(
    objectType: string,
    objectId: string | unknown,
    unknownFields: string[],
    typeFile: string
): string {
    return `${objectType} "${objectId}" has unknown fields: ${unknownFields.join(', ')}. ` +
           `Add these to TypeScript interface (${typeFile}) or remove from JSON.`;
}

// ============================================================================
// Tests
// ============================================================================

describe('Type/JSON Alignment Validation', () => {
    let stacksConfig: Record<string, unknown>;
    let componentsConfig: Record<string, unknown>;
    let prerequisitesConfig: Record<string, unknown>;
    let loggingConfig: Record<string, unknown>;

    beforeAll(() => {
        const stacksPath = path.join(__dirname, '../../src/features/project-creation/config/stacks.json');
        const componentsPath = path.join(__dirname, '../../src/features/components/config/components.json');
        const prerequisitesPath = path.join(__dirname, '../../src/features/prerequisites/config/prerequisites.json');
        const loggingPath = path.join(__dirname, '../../src/core/logging/config/logging.json');

        stacksConfig = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
        componentsConfig = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
        prerequisitesConfig = JSON.parse(fs.readFileSync(prerequisitesPath, 'utf-8'));
        loggingConfig = JSON.parse(fs.readFileSync(loggingPath, 'utf-8'));
    });

    // ========================================================================
    // stacks.json alignment
    // ========================================================================

    describe('stacks.json <-> Stack alignment', () => {
        it('should have no unknown fields in root config', () => {
            const rootAllowed = new Set(['$schema', 'version', 'stacks']);
            const unknown = findUnknownFields(stacksConfig, rootAllowed);
            if (unknown.length > 0) {
                throw new Error(`stacks.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to StacksConfig (src/types/stacks.ts) or remove from JSON.`);
            }
        });

        it('should have no unknown fields in any stack', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            stacks.forEach(stack => {
                const unknown = findUnknownFields(stack, STACK_FIELDS);
                if (unknown.length > 0) {
                    throw new Error(formatUnknownFieldsError(
                        'Stack',
                        stack.id,
                        unknown,
                        'src/types/stacks.ts - Stack'
                    ));
                }
            });
        });
    });

    // ========================================================================
    // brands.json alignment - REMOVED
    // brands.json replaced by demo-packages.json
    // See: .rptc/plans/demo-packages-simplification/
    // ========================================================================

    // ========================================================================
    // components.json alignment
    // ========================================================================

    describe('components.json <-> RawComponentRegistry alignment', () => {
        /**
         * Helper to validate all entries in a section have no unknown fields
         */
        function validateSectionEntries(
            sectionName: string,
            allowedFields: Set<string>,
            typeLabel: string
        ): void {
            const section = componentsConfig[sectionName] as Record<string, Record<string, unknown>> | undefined;
            if (!section) return;

            Object.entries(section).forEach(([id, entry]) => {
                const unknown = findUnknownFields(entry, allowedFields);
                if (unknown.length > 0) {
                    throw new Error(formatUnknownFieldsError(
                        typeLabel,
                        id,
                        unknown,
                        'src/types/components.ts - RawComponentDefinition'
                    ));
                }
            });
        }

        it('should have no unknown fields in root config', () => {
            const unknown = findUnknownFields(componentsConfig, COMPONENTS_ROOT_FIELDS);
            if (unknown.length > 0) {
                throw new Error(`components.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to COMPONENTS_ROOT_FIELDS or RawComponentRegistry (src/types/components.ts) or remove from JSON.`);
            }
        });

        // Component section tests - parameterized to eliminate duplication
        const componentSections = [
            ['frontends', 'Frontend component'],
            ['backends', 'Backend component'],
            ['mesh', 'Mesh component'],
            ['dependencies', 'Dependency component'],
            ['appBuilderApps', 'App Builder app'],
            ['integrations', 'Integration'],
            ['addons', 'Addon'],
            ['tools', 'Tool'],
            ['infrastructure', 'Infrastructure component'],
            ['brands', 'Brand (in components.json)'],
            ['stacks', 'Stack (in components.json)'],
        ] as const;

        it.each(componentSections)(
            'should have no unknown fields in %s entries',
            (sectionName, typeLabel) => {
                validateSectionEntries(sectionName, COMPONENT_DEFINITION_FIELDS, typeLabel);
            }
        );

        it('should have no unknown fields in component configuration blocks', () => {
            const sectionsWithConfig = [
                'frontends', 'backends', 'mesh', 'appBuilderApps',
                'integrations', 'addons', 'tools'
            ] as const;

            sectionsWithConfig.forEach(section => {
                const components = componentsConfig[section] as Record<string, Record<string, unknown>> | undefined;
                if (!components) return;

                Object.entries(components).forEach(([id, component]) => {
                    if (!component.configuration) return;
                    const config = component.configuration as Record<string, unknown>;
                const unknown = findUnknownFields(config, COMPONENT_CONFIGURATION_FIELDS);
                if (unknown.length > 0) {
                    throw new Error(`${section}.${id}.configuration has unknown fields: ${unknown.join(', ')}. ` +
                         `Add to COMPONENT_CONFIGURATION_FIELDS or RawComponentDefinition.configuration (src/types/components.ts) or remove from JSON.`);
                }
                });
            });
        });

        it('should have no unknown fields in component source blocks', () => {
            const sectionsWithSource = ['frontends', 'backends', 'mesh', 'appBuilderApps', 'tools'] as const;

            sectionsWithSource.forEach(section => {
                const components = componentsConfig[section] as Record<string, Record<string, unknown>> | undefined;
                if (!components) return;

                Object.entries(components).forEach(([id, component]) => {
                    if (!component.source) return;
                    const source = component.source as Record<string, unknown>;
                    const unknown = findUnknownFields(source, COMPONENT_SOURCE_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`${section}.${id}.source has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to COMPONENT_SOURCE_FIELDS or RawComponentDefinition.source (src/types/components.ts) or remove from JSON.`);
                    }
                });
            });
        });

        it('should have no unknown fields in source.gitOptions blocks', () => {
            const sectionsWithSource = ['frontends', 'backends', 'mesh', 'appBuilderApps', 'tools'] as const;

            sectionsWithSource.forEach(section => {
                const components = componentsConfig[section] as Record<string, Record<string, unknown>> | undefined;
                if (!components) return;

                Object.entries(components).forEach(([id, component]) => {
                    if (!component.source) return;
                    const source = component.source as Record<string, unknown>;
                    if (!source.gitOptions) return;
                    const gitOptions = source.gitOptions as Record<string, unknown>;
                    const unknown = findUnknownFields(gitOptions, COMPONENT_GIT_OPTIONS_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`${section}.${id}.source.gitOptions has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to COMPONENT_GIT_OPTIONS_FIELDS (src/types/components.ts) or remove from JSON.`);
                    }
                });
            });
        });

        it('should have no unknown fields in envVars entries', () => {
            const envVars = componentsConfig.envVars as Record<string, Record<string, unknown>> | undefined;
            if (!envVars) return;

            Object.entries(envVars).forEach(([key, envVar]) => {
            const unknown = findUnknownFields(envVar, ENV_VAR_DEFINITION_FIELDS);
            if (unknown.length > 0) {
                throw new Error(`envVars.${key} has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to ENV_VAR_DEFINITION_FIELDS or EnvVarDefinition (src/types/components.ts) or remove from JSON.`);
            }
            });
        });

        it('should have no unknown fields in selectionGroups', () => {
            const selectionGroups = componentsConfig.selectionGroups as Record<string, unknown> | undefined;
            if (!selectionGroups) return;

            const unknown = findUnknownFields(selectionGroups, SELECTION_GROUPS_FIELDS);
            if (unknown.length > 0) {
                throw new Error(`selectionGroups has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to SELECTION_GROUPS_FIELDS or RawComponentRegistry.selectionGroups (src/types/components.ts) or remove from JSON.`);
            }
        });

        it('should have no unknown fields in services', () => {
            const services = componentsConfig.services as Record<string, Record<string, unknown>> | undefined;
            if (!services) return;

            Object.entries(services).forEach(([serviceId, service]) => {
                const unknown = findUnknownFields(service, SERVICE_DEFINITION_FIELDS);
                if (unknown.length > 0) {
                    throw new Error(`services.${serviceId} has unknown fields: ${unknown.join(', ')}. ` +
                         `Add to SERVICE_DEFINITION_FIELDS or ServiceDefinition (src/types/components.ts) or remove from JSON.`);
                }
            });
        });
    });

    // ========================================================================
    // prerequisites.json alignment
    // ========================================================================

    describe('prerequisites.json <-> PrerequisitesConfig alignment', () => {
        it('should have no unknown fields in root config', () => {
            const unknown = findUnknownFields(prerequisitesConfig, PREREQUISITES_ROOT_FIELDS);
            if (unknown.length > 0) {
                throw new Error(`prerequisites.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to PrerequisitesConfig (src/features/prerequisites/services/types.ts) or remove from JSON.`);
            }
        });

        it('should have no unknown fields in any prerequisite definition', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                const unknown = findUnknownFields(prereq, PREREQUISITE_DEFINITION_FIELDS);
                if (unknown.length > 0) {
                    throw new Error(formatUnknownFieldsError(
                        'Prerequisite',
                        prereq.id,
                        unknown,
                        'src/features/prerequisites/services/types.ts - PrerequisiteDefinition'
                    ));
                }
            });
        });

        it('should have no unknown fields in prerequisite.check blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.check) {
                    const check = prereq.check as Record<string, unknown>;
                    const unknown = findUnknownFields(check, PREREQUISITE_CHECK_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" check has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PrerequisiteCheck (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.versionCheck blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.versionCheck) {
                    const versionCheck = prereq.versionCheck as Record<string, unknown>;
                    const unknown = findUnknownFields(versionCheck, PREREQUISITE_CHECK_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" versionCheck has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PrerequisiteCheck (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.install blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.install) {
                    const install = prereq.install as Record<string, unknown>;
                    const unknown = findUnknownFields(install, PREREQUISITE_INSTALL_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" install has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PrerequisiteInstall (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.uninstall blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.uninstall) {
                    const uninstall = prereq.uninstall as Record<string, unknown>;
                    const unknown = findUnknownFields(uninstall, PREREQUISITE_INSTALL_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" uninstall has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PrerequisiteInstall (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                    }
                }
            });
        });

        it('should have no unknown fields in prerequisite.postInstall blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.postInstall) {
                    const postInstall = prereq.postInstall as Record<string, unknown>;
                    const unknown = findUnknownFields(postInstall, POST_INSTALL_FIELDS);
                    if (unknown.length > 0) {
                        throw new Error(`Prerequisite "${prereq.id}" postInstall has unknown fields: ${unknown.join(', ')}. ` +
                             `Add to PostInstall (src/features/prerequisites/services/types.ts) or remove from JSON.`);
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
                                throw new Error(`Prerequisite "${prereq.id}" install.steps[${index}] has unknown fields: ` +
                                     `${unknown.join(', ')}. Add to InstallStep (src/features/prerequisites/services/types.ts) or remove from JSON.`);
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
                                        throw new Error(`Prerequisite "${prereq.id}" install.steps[${stepIndex}].milestones[${milestoneIndex}] ` +
                                             `has unknown fields: ${unknown.join(', ')}. ` +
                                             `Add to ProgressMilestone (src/features/prerequisites/services/types.ts) or remove from JSON.`);
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
                    plugins.forEach((plugin, index) => {
                        const unknown = findUnknownFields(plugin, PREREQUISITE_PLUGIN_FIELDS);
                        if (unknown.length > 0) {
                            throw new Error(`Prerequisite "${prereq.id}" plugins[${index}] has unknown fields: ` +
                                 `${unknown.join(', ')}. Add to PrerequisitePlugin (src/features/prerequisites/services/types.ts) or remove from JSON.`);
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
                    plugins.forEach((plugin, index) => {
                        if (plugin.check) {
                            const check = plugin.check as Record<string, unknown>;
                            const unknown = findUnknownFields(check, PREREQUISITE_CHECK_FIELDS);
                            if (unknown.length > 0) {
                                throw new Error(`Prerequisite "${prereq.id}" plugins[${index}].check has unknown fields: ` +
                                     `${unknown.join(', ')}. Add to PrerequisiteCheck (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                            }
                        }
                    });
                }
            });
        });

        it('should have no unknown fields in plugin.install blocks', () => {
            const prerequisites = prerequisitesConfig.prerequisites as Array<Record<string, unknown>>;
            prerequisites.forEach(prereq => {
                if (prereq.plugins) {
                    const plugins = prereq.plugins as Array<Record<string, unknown>>;
                    plugins.forEach((plugin, index) => {
                        if (plugin.install) {
                            const install = plugin.install as Record<string, unknown>;
                            const unknown = findUnknownFields(install, PREREQUISITE_INSTALL_FIELDS);
                            if (unknown.length > 0) {
                                throw new Error(`Prerequisite "${prereq.id}" plugins[${index}].install has unknown fields: ` +
                                     `${unknown.join(', ')}. Add to PrerequisiteInstall (src/features/prerequisites/services/types.ts) or remove from JSON.`);
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
                    plugins.forEach((plugin, pluginIndex) => {
                        if (plugin.install) {
                            const install = plugin.install as Record<string, unknown>;
                            if (install.steps) {
                                const steps = install.steps as Array<Record<string, unknown>>;
                                steps.forEach((step, stepIndex) => {
                                    const unknown = findUnknownFields(step, INSTALL_STEP_FIELDS);
                                    if (unknown.length > 0) {
                                        throw new Error(`Prerequisite "${prereq.id}" plugins[${pluginIndex}].install.steps[${stepIndex}] ` +
                                             `has unknown fields: ${unknown.join(', ')}. ` +
                                             `Add to InstallStep (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                                    }
                                });
                            }
                        }
                    });
                }
            });
        });

        it('should have no unknown fields in componentRequirements entries', () => {
            const requirements = prerequisitesConfig.componentRequirements as Record<string, Record<string, unknown>> | undefined;
            if (!requirements) return;

            Object.entries(requirements).forEach(([componentId, requirement]) => {
                const unknown = findUnknownFields(requirement, COMPONENT_REQUIREMENT_FIELDS);
                if (unknown.length > 0) {
                    throw new Error(`componentRequirements["${componentId}"] has unknown fields: ${unknown.join(', ')}. ` +
                         `Add to ComponentRequirement (src/features/prerequisites/services/types.ts) or remove from JSON.`);
                }
            });
        });
    });

    // ========================================================================
    // logging.json alignment
    // ========================================================================

    describe('logging.json <-> LoggingTemplates alignment', () => {
        it('should have no unknown fields in root config', () => {
            const unknown = findUnknownFields(loggingConfig, LOGGING_ROOT_FIELDS);
            if (unknown.length > 0) {
                throw new Error(`logging.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to LoggingTemplates (src/core/logging/stepLogger.ts) or remove from JSON.`);
            }
        });

        it('should have operations section as an object', () => {
            expect(loggingConfig.operations).toBeDefined();
            expect(typeof loggingConfig.operations).toBe('object');
            expect(loggingConfig.operations).not.toBeNull();
        });

        it('should have statuses section as an object', () => {
            expect(loggingConfig.statuses).toBeDefined();
            expect(typeof loggingConfig.statuses).toBe('object');
            expect(loggingConfig.statuses).not.toBeNull();
        });

        it('should have only string values in operations section', () => {
            const operations = loggingConfig.operations as Record<string, unknown>;
            Object.entries(operations).forEach(([key, value]) => {
                if (typeof value !== 'string') {
                    throw new Error(`logging.json operations.${key} is not a string: found ${typeof value}. ` +
                         `All logging template values must be strings.`);
                }
            });
        });

        it('should have non-empty string values in operations section', () => {
            const operations = loggingConfig.operations as Record<string, unknown>;
            Object.entries(operations).forEach(([key, value]) => {
                if (typeof value === 'string' && value.trim() === '') {
                    throw new Error(`logging.json operations.${key} is empty. ` +
                         `Logging templates must contain message text.`);
                }
            });
        });

        it('should have only string values in statuses section', () => {
            const statuses = loggingConfig.statuses as Record<string, unknown>;
            Object.entries(statuses).forEach(([key, value]) => {
                if (typeof value !== 'string') {
                    throw new Error(`logging.json statuses.${key} is not a string: found ${typeof value}. ` +
                         `All logging template values must be strings.`);
                }
            });
        });

        it('should have non-empty string values in statuses section', () => {
            const statuses = loggingConfig.statuses as Record<string, unknown>;
            Object.entries(statuses).forEach(([key, value]) => {
                if (typeof value === 'string' && value.trim() === '') {
                    throw new Error(`logging.json statuses.${key} is empty. ` +
                         `Logging templates must contain message text.`);
                }
            });
        });
    });

});
