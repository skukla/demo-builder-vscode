/**
 * Type/JSON Alignment Validation Tests - Stacks & Components
 *
 * Tests for TypeScript type synchronization with:
 * - stacks.json
 * - components.json
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Allowed Fields from TypeScript Interfaces
// ============================================================================

const STACK_FIELDS = new Set([
    'id', 'name', 'description', 'icon', 'frontend', 'backend',
    'dependencies', 'optionalAddons', 'features', 'requiresGitHub', 'requiresDaLive',
]);

const COMPONENTS_ROOT_FIELDS = new Set([
    '$schema', 'version', 'infrastructure', 'frontends', 'backends', 'mesh',
    'brands', 'stacks', 'dependencies', 'appBuilderApps', 'integrations',
    'addons', 'tools', 'services', 'envVars', 'selectionGroups',
]);

const COMPONENT_DEFINITION_FIELDS = new Set([
    'name', 'description', 'type', 'subType', 'icon', 'source', 'dependencies',
    'configuration', 'compatibleBackends', 'features', 'requiresApiKey', 'endpoint',
    'requiresDeployment', 'metadata', 'addonFor', 'category', 'hidden',
    'dataRepository', 'installPath', 'configDefaults', 'contentSource', 'frontend',
    'backend', 'requiredComponents', 'optionalComponents', 'requiredEnvVars',
]);

const COMPONENT_CONFIGURATION_FIELDS = new Set([
    'requiredEnvVars', 'optionalEnvVars', 'requiredServices', 'providesServices',
    'port', 'nodeVersion', 'buildScript', 'required', 'meshIntegration',
    'providesEndpoint', 'providesEnvVars', 'requiresDeployment', 'configFiles',
    'deploymentTarget', 'runtime', 'actions', 'impact', 'removable',
    'defaultEnabled', 'position', 'startOpen', 'scripts', 'skipNpmInstall',
    'configFlags',
]);

const COMPONENT_SOURCE_FIELDS = new Set([
    'type', 'url', 'package', 'version', 'branch', 'gitOptions', 'timeouts',
]);

const COMPONENT_GIT_OPTIONS_FIELDS = new Set([
    'shallow', 'tag', 'commit',
]);

const ENV_VAR_DEFINITION_FIELDS = new Set([
    'label', 'type', 'required', 'default', 'placeholder', 'description',
    'help', 'group', 'providedBy', 'usedBy', 'derivedFrom', 'options', 'validation',
]);

const SELECTION_GROUPS_FIELDS = new Set([
    'frontends', 'backends', 'stacks', 'brands', 'dependencies',
    'appBuilderApps', 'integrations', 'addons', 'tools',
]);

const SERVICE_DEFINITION_FIELDS = new Set([
    'name', 'description', 'backendSpecific', 'requiredEnvVars',
    'requiredEnvVarsByBackend', 'optionalEnvVars', 'required', 'endpoint', 'requiresApiKey',
]);

// ============================================================================
// Helper Functions
// ============================================================================

function getObjectFields(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
}

function findUnknownFields(
    obj: Record<string, unknown>,
    allowedFields: Set<string>
): string[] {
    return getObjectFields(obj).filter(field => !allowedFields.has(field));
}

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

describe('Type/JSON Alignment - Stacks & Components', () => {
    let stacksConfig: Record<string, unknown>;
    let componentsConfig: Record<string, unknown>;

    beforeAll(() => {
        const stacksPath = path.join(__dirname, '../../src/features/project-creation/config/stacks.json');
        const componentsPath = path.join(__dirname, '../../src/features/components/config/components.json');

        stacksConfig = JSON.parse(fs.readFileSync(stacksPath, 'utf-8'));
        componentsConfig = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
    });

    describe('stacks.json <-> Stack alignment', () => {
        it('should have no unknown fields in root config', () => {
            const rootAllowed = new Set(['$schema', 'version', 'stacks', 'addonDefinitions']);
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
                        'Stack', stack.id, unknown, 'src/types/stacks.ts - Stack'
                    ));
                }
            });
        });
    });

    describe('components.json <-> RawComponentRegistry alignment', () => {
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
                        typeLabel, id, unknown,
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
});
