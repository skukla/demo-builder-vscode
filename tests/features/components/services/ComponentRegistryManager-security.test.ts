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
            // Given: components.json has valid numeric versions ("20", "22", "24")
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            // When: getRequiredNodeVersions() is called
            const versions = await manager.getRequiredNodeVersions(
                'frontend1',  // Node 20
                'backend1',   // Node 20
                ['dep1'],     // Node 18
                undefined,
                ['app1']      // Node 22
            );

            // Then: All versions returned without error
            expect(versions.size).toBeGreaterThan(0);
            expect(versions.has('20')).toBe(true);
            expect(versions.has('18')).toBe(true);
            expect(versions.has('22')).toBe(true);
        });

        it('should accept valid semantic versions', async () => {
            // Given: Component with semantic version
            const registryWithSemver = {
                ...mockRawRegistry,
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        configuration: {
                            ...mockRawRegistry.components!.frontend1.configuration,
                            nodeVersion: '20.11.0'
                        }
                    }
                }
            };
            mockLoader.load.mockResolvedValue(registryWithSemver);

            // When: getRequiredNodeVersions() is called
            const versions = await manager.getRequiredNodeVersions('frontend1');

            // Then: Semantic version accepted
            expect(versions.has('20.11.0')).toBe(true);
        });

        it('should throw error for injection payload in nodeVersion', async () => {
            // Given: components.json manually edited with malicious version
            const maliciousRegistry = createMaliciousRegistry('components.frontend1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('frontend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should throw error for invalid version format with v prefix', async () => {
            // Given: Component with "v" prefix (invalid)
            const invalidRegistry = createMaliciousRegistry('components.frontend1', 'v20');
            mockLoader.load.mockResolvedValue(invalidRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('frontend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should throw error for invalid version format "latest"', async () => {
            // Given: Component with "latest" keyword (invalid - not in allowlist)
            const invalidRegistry = createMaliciousRegistry('components.frontend1', 'latest');
            mockLoader.load.mockResolvedValue(invalidRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions('frontend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate all 9 injection payloads', async () => {
            // Given: All known injection payloads from security agent
            // When & Then: Each payload rejected
            for (const payload of injectionPayloads) {
                const maliciousRegistry = createMaliciousRegistry('components.frontend1', payload);
                mockLoader.load.mockResolvedValue(maliciousRegistry);

                await expect(
                    manager.getRequiredNodeVersions('frontend1')
                ).rejects.toThrow(/Invalid Node/);
            }
        });

        it('should validate nodeVersion in backend component', async () => {
            // Given: Backend with malicious version
            const maliciousRegistry = createMaliciousRegistry('components.backend1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, 'backend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate nodeVersion in dependencies', async () => {
            // Given: Dependency with malicious version
            const maliciousRegistry = createMaliciousRegistry('components.dep1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, undefined, ['dep1'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate nodeVersion in app builder components', async () => {
            // Given: App Builder with malicious version
            const maliciousRegistry = createMaliciousRegistry('components.app1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getRequiredNodeVersions(undefined, undefined, undefined, undefined, ['app1'])
            ).rejects.toThrow(/Invalid Node/);
        });
    });

    describe('getNodeVersionToComponentMapping - security validation', () => {
        it('should validate versions in infrastructure components', async () => {
            // Given: Infrastructure with malicious version
            const maliciousRegistry = createMaliciousRegistry('infrastructure.infra1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping()
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in frontend mapping', async () => {
            // Given: Frontend with malicious version
            const maliciousRegistry = createMaliciousRegistry('components.frontend1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping('frontend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in backend mapping', async () => {
            // Given: Backend with malicious version
            const maliciousRegistry = createMaliciousRegistry('components.backend1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, 'backend1')
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in dependencies mapping', async () => {
            // Given: Dependency with malicious version
            const maliciousRegistry = createMaliciousRegistry('components.dep1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, undefined, ['dep1'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should validate versions in app builder mapping', async () => {
            // Given: App Builder with malicious version
            const maliciousRegistry = createMaliciousRegistry('components.app1', '20; rm -rf /');
            mockLoader.load.mockResolvedValue(maliciousRegistry);

            // When & Then: Validation error thrown
            await expect(
                manager.getNodeVersionToComponentMapping(undefined, undefined, undefined, undefined, ['app1'])
            ).rejects.toThrow(/Invalid Node/);
        });

        it('should accept valid versions in mapping', async () => {
            // Given: Registry with valid versions
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            // When: getNodeVersionToComponentMapping() is called
            const mapping = await manager.getNodeVersionToComponentMapping(
                'frontend1',
                'backend1',
                ['dep1'],
                undefined,
                ['app1']
            );

            // Then: Mapping returned without errors
            expect(Object.keys(mapping).length).toBeGreaterThan(0);
            expect(mapping['20']).toBeDefined();
            expect(mapping['18']).toBeDefined();
            expect(mapping['22']).toBeDefined();
        });
    });
});
