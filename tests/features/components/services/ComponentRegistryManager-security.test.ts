import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import {
    mockRawRegistry,
    getMockLoader,
    injectionPayloads,
    createMaliciousRegistry
} from './ComponentRegistryManager.testUtils';

// Mock ConfigurationLoader (Jest hoisting requirement)
jest.mock('@/core/config/ConfigurationLoader', () => {
    return {
        ConfigurationLoader: jest.fn().mockImplementation(() => {
            return {
                load: jest.fn(),
            };
        }),
    };
});

describe('Component Registry Manager - Security Validation', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        mockLoader = getMockLoader();
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

            // Then: All versions returned without error (only deps have Node versions)
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
            // Given: Dependency with malicious version
            const maliciousRegistry = createMaliciousRegistry('dependencies.demo-inspector', '20; rm -rf /');
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
            // Given: Dependency with malicious version
            const maliciousRegistry = createMaliciousRegistry('dependencies.demo-inspector', '20; rm -rf /');
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
