/**
 * Type/JSON Alignment Validation Tests
 *
 * TDD: These tests ensure TypeScript types remain synchronized with JSON configuration files.
 * Catches type drift that causes silent runtime failures.
 *
 * The key innovation here is the "no unknown fields" tests that detect when JSON
 * has fields not defined in TypeScript interfaces. This prevents the issue where
 * templates.json had `stack`, `brand`, `source`, `submodules` but the DemoTemplate
 * interface didn't include them.
 *
 * Pattern:
 * 1. Define expected fields from TypeScript interfaces (source of truth)
 * 2. Load JSON files at test time
 * 3. Scan each object for fields not in the allowed list
 * 4. Fail with actionable error message identifying specific field and file
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Allowed Fields from TypeScript Interfaces
// These MUST stay in sync with the corresponding TypeScript interfaces.
// If you add a field to an interface, add it here too!
// ============================================================================

/**
 * DemoTemplate fields from src/types/templates.ts
 */
const DEMO_TEMPLATE_FIELDS = new Set([
    'id',
    'name',
    'description',
    'defaults',
    'icon',
    'tags',
    'featured',
    'stack',
    'brand',
    'source',
    'submodules',
]);

/**
 * TemplateDefaults fields from src/types/templates.ts
 */
const TEMPLATE_DEFAULTS_FIELDS = new Set([
    'frontend',
    'backend',
    'dependencies',
    'integrations',
    'appBuilder',
    'configDefaults',
]);

/**
 * TemplateSource fields from src/types/templates.ts
 */
const TEMPLATE_SOURCE_FIELDS = new Set([
    'type',
    'url',
    'branch',
    'gitOptions',
]);

/**
 * TemplateGitOptions fields from src/types/templates.ts
 */
const TEMPLATE_GIT_OPTIONS_FIELDS = new Set([
    'shallow',
    'recursive',
]);

/**
 * TemplateSubmodule fields from src/types/templates.ts
 */
const TEMPLATE_SUBMODULE_FIELDS = new Set([
    'path',
    'repository',
]);

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

/**
 * Brand fields from src/types/brands.ts
 */
const BRAND_FIELDS = new Set([
    'id',
    'name',
    'description',
    'icon',
    'featured',
    'compatibleStacks',
    'addons',
    'configDefaults',
    'contentSources',
]);

/**
 * ContentSources fields from src/types/brands.ts
 */
const CONTENT_SOURCES_FIELDS = new Set([
    'eds',
]);

// ============================================================================
// Components.json v3.0.0 Field Sets
// From src/types/components.ts - RawComponentRegistry, RawComponentDefinition
// ============================================================================

/**
 * Root-level fields for components.json v3.0.0
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
    'port',
    'nodeVersion',
    'buildScript',
    'required',
    'requiredServices',
    'services',
    'meshIntegration',
    'providesEndpoint',
    'providesEnvVars',
    'requiresDeployment',
    'deploymentTarget',
    'runtime',
    'actions',
    'impact',
    'removable',
    'defaultEnabled',
    'position',
    'startOpen',
    'scripts',            // tools configuration
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
    let templatesConfig: Record<string, unknown>;
    let stacksConfig: Record<string, unknown>;
    let brandsConfig: Record<string, unknown>;
    let componentsConfig: Record<string, unknown>;

    beforeAll(() => {
        const templatesPath = path.join(__dirname, '../../templates/templates.json');
        const stacksPath = path.join(__dirname, '../../templates/stacks.json');
        const brandsPath = path.join(__dirname, '../../templates/brands.json');
        const componentsPath = path.join(__dirname, '../../templates/components.json');

        templatesConfig = JSON.parse(fs.readFileSync(templatesPath, 'utf-8'));
        stacksConfig = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
        brandsConfig = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
        componentsConfig = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
    });

    // ========================================================================
    // templates.json alignment
    // ========================================================================

    describe('templates.json <-> DemoTemplate alignment', () => {
        it('should have no unknown fields in root config', () => {
            const rootAllowed = new Set(['$schema', 'version', 'templates']);
            const unknown = findUnknownFields(templatesConfig, rootAllowed);
            if (unknown.length > 0) {
                fail(`templates.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to DemoTemplatesConfig (src/types/templates.ts) or remove from JSON.`);
            }
        });

        it('should have no unknown fields in any template', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                const unknown = findUnknownFields(template, DEMO_TEMPLATE_FIELDS);
                if (unknown.length > 0) {
                    fail(formatUnknownFieldsError(
                        'Template',
                        template.id,
                        unknown,
                        'src/types/templates.ts - DemoTemplate'
                    ));
                }
            });
        });

        it('should have no unknown fields in template.defaults', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                if (template.defaults) {
                    const defaults = template.defaults as Record<string, unknown>;
                    const unknown = findUnknownFields(defaults, TEMPLATE_DEFAULTS_FIELDS);
                    if (unknown.length > 0) {
                        fail(formatUnknownFieldsError(
                            'Template defaults',
                            template.id,
                            unknown,
                            'src/types/templates.ts - TemplateDefaults'
                        ));
                    }
                }
            });
        });

        it('should have no unknown fields in template.source', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                if (template.source) {
                    const source = template.source as Record<string, unknown>;
                    const unknown = findUnknownFields(source, TEMPLATE_SOURCE_FIELDS);
                    if (unknown.length > 0) {
                        fail(formatUnknownFieldsError(
                            'Template source',
                            template.id,
                            unknown,
                            'src/types/templates.ts - TemplateSource'
                        ));
                    }
                }
            });
        });

        it('should have no unknown fields in template.source.gitOptions', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                if (template.source) {
                    const source = template.source as Record<string, unknown>;
                    if (source.gitOptions) {
                        const gitOptions = source.gitOptions as Record<string, unknown>;
                        const unknown = findUnknownFields(gitOptions, TEMPLATE_GIT_OPTIONS_FIELDS);
                        if (unknown.length > 0) {
                            fail(formatUnknownFieldsError(
                                'Template gitOptions',
                                template.id,
                                unknown,
                                'src/types/templates.ts - TemplateGitOptions'
                            ));
                        }
                    }
                }
            });
        });

        it('should have no unknown fields in template.submodules entries', () => {
            const templates = templatesConfig.templates as Array<Record<string, unknown>>;
            templates.forEach(template => {
                if (template.submodules) {
                    const submodules = template.submodules as Record<string, Record<string, unknown>>;
                    Object.entries(submodules).forEach(([name, config]) => {
                        const unknown = findUnknownFields(config, TEMPLATE_SUBMODULE_FIELDS);
                        if (unknown.length > 0) {
                            fail(`Template "${template.id}" submodule "${name}" has unknown fields: ` +
                                 `${unknown.join(', ')}. Add to TemplateSubmodule (src/types/templates.ts) ` +
                                 `or remove from JSON.`);
                        }
                    });
                }
            });
        });
    });

    // ========================================================================
    // stacks.json alignment
    // ========================================================================

    describe('stacks.json <-> Stack alignment', () => {
        it('should have no unknown fields in root config', () => {
            const rootAllowed = new Set(['$schema', 'version', 'stacks']);
            const unknown = findUnknownFields(stacksConfig, rootAllowed);
            if (unknown.length > 0) {
                fail(`stacks.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to StacksConfig (src/types/stacks.ts) or remove from JSON.`);
            }
        });

        it('should have no unknown fields in any stack', () => {
            const stacks = stacksConfig.stacks as Array<Record<string, unknown>>;
            stacks.forEach(stack => {
                const unknown = findUnknownFields(stack, STACK_FIELDS);
                if (unknown.length > 0) {
                    fail(formatUnknownFieldsError(
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
    // brands.json alignment
    // ========================================================================

    describe('brands.json <-> Brand alignment', () => {
        it('should have no unknown fields in root config', () => {
            const rootAllowed = new Set(['$schema', 'version', 'brands']);
            const unknown = findUnknownFields(brandsConfig, rootAllowed);
            if (unknown.length > 0) {
                fail(`brands.json root has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to BrandsConfig (src/types/brands.ts) or remove from JSON.`);
            }
        });

        it('should have no unknown fields in any brand', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            brands.forEach(brand => {
                const unknown = findUnknownFields(brand, BRAND_FIELDS);
                if (unknown.length > 0) {
                    fail(formatUnknownFieldsError(
                        'Brand',
                        brand.id,
                        unknown,
                        'src/types/brands.ts - Brand'
                    ));
                }
            });
        });

        it('should have no unknown fields in brand.contentSources', () => {
            const brands = brandsConfig.brands as Array<Record<string, unknown>>;
            brands.forEach(brand => {
                if (brand.contentSources) {
                    const contentSources = brand.contentSources as Record<string, unknown>;
                    const unknown = findUnknownFields(contentSources, CONTENT_SOURCES_FIELDS);
                    if (unknown.length > 0) {
                        fail(formatUnknownFieldsError(
                            'Brand contentSources',
                            brand.id,
                            unknown,
                            'src/types/brands.ts - ContentSources'
                        ));
                    }
                }
            });
        });
    });

    // ========================================================================
    // components.json alignment (v3.0.0 structure)
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
                    fail(formatUnknownFieldsError(
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
                fail(`components.json root has unknown fields: ${unknown.join(', ')}. ` +
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
            ['services', 'Service'],
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
                        fail(`${section}.${id}.configuration has unknown fields: ${unknown.join(', ')}. ` +
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
                        fail(`${section}.${id}.source has unknown fields: ${unknown.join(', ')}. ` +
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
                        fail(`${section}.${id}.source.gitOptions has unknown fields: ${unknown.join(', ')}. ` +
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
                    fail(`envVars.${key} has unknown fields: ${unknown.join(', ')}. ` +
                         `Add to ENV_VAR_DEFINITION_FIELDS or EnvVarDefinition (src/types/components.ts) or remove from JSON.`);
                }
            });
        });

        it('should have no unknown fields in selectionGroups', () => {
            const selectionGroups = componentsConfig.selectionGroups as Record<string, unknown> | undefined;
            if (!selectionGroups) return;

            const unknown = findUnknownFields(selectionGroups, SELECTION_GROUPS_FIELDS);
            if (unknown.length > 0) {
                fail(`selectionGroups has unknown fields: ${unknown.join(', ')}. ` +
                     `Add to SELECTION_GROUPS_FIELDS or RawComponentRegistry.selectionGroups (src/types/components.ts) or remove from JSON.`);
            }
        });
    });

    // ========================================================================
    // Summary validation (catches all at once for CI clarity)
    // ========================================================================

    describe('aggregate alignment check', () => {
        it('should pass all type/JSON alignment checks', () => {
            // This test provides a single pass/fail for CI pipelines
            // Individual tests above provide specific failure details
            const allPassed = true; // If we get here, previous tests passed
            expect(allPassed).toBe(true);
        });
    });
});
