import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { mockRawRegistry, getMockLoader } from './ComponentRegistryManager.testUtils';

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

describe('Component Registry Manager - Node Version Resolution', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        mockLoader = getMockLoader();
        mockLoader.load.mockResolvedValue(mockRawRegistry);
    });

    describe('node version resolution', () => {
        it('should resolve node versions from frontend and backend', async () => {
            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas');

            expect(versions.size).toBe(1);
            expect(versions.has('20')).toBe(true);
        });

        it('should include dependency node versions', async () => {
            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas', ['demo-inspector']);

            expect(versions.size).toBe(2);
            expect(versions.has('20')).toBe(true);
            expect(versions.has('18')).toBe(true);
        });

        it('should include app builder node versions', async () => {
            const versions = await manager.getRequiredNodeVersions(
                'eds',
                'adobe-commerce-paas',
                undefined,
                undefined,
                ['integration-service']
            );

            expect(versions.size).toBe(2);
            expect(versions.has('20')).toBe(true);
            expect(versions.has('22')).toBe(true);
        });

        it('should return empty set when no components specified', async () => {
            const versions = await manager.getRequiredNodeVersions();

            expect(versions.size).toBe(0);
        });

        it('should handle components without node version', async () => {
            mockLoader.load.mockResolvedValue({
                ...mockRawRegistry,
                frontends: {
                    ...mockRawRegistry.frontends,
                    eds: {
                        ...mockRawRegistry.frontends!.eds,
                        configuration: {},
                    },
                },
            });

            const versions = await manager.getRequiredNodeVersions('eds');

            expect(versions.size).toBe(0);
        });
    });

    describe('node version to component mapping', () => {
        it('should aggregate component names when multiple components share same version', async () => {
            // Given: EDS frontend and PaaS backend both require Node 20
            // When: Getting the version-to-component mapping
            const mapping = await manager.getNodeVersionToComponentMapping('eds', 'adobe-commerce-paas');

            // Then: Both component names should be listed for Node 20
            expect(mapping['20']).toBe('Edge Delivery Services, Adobe Commerce PaaS');
        });

        it('should aggregate dependency component with frontend and backend when same version', async () => {
            // Given: A custom registry where demo-inspector also uses Node 20
            mockLoader.load.mockResolvedValue({
                ...mockRawRegistry,
                dependencies: {
                    'demo-inspector': {
                        ...mockRawRegistry.dependencies!['demo-inspector'],
                        configuration: {
                            nodeVersion: '20', // Same as frontend/backend
                        },
                    },
                },
            });

            // When: Getting the version-to-component mapping with dependency
            const mapping = await manager.getNodeVersionToComponentMapping(
                'eds',
                'adobe-commerce-paas',
                ['demo-inspector']
            );

            // Then: All three component names should be listed for Node 20
            expect(mapping['20']).toBe('Edge Delivery Services, Adobe Commerce PaaS, Demo Inspector');
        });

        it('should keep separate versions distinct', async () => {
            // Given: Different components require different Node versions
            // When: Getting the version-to-component mapping with app builder app
            const mapping = await manager.getNodeVersionToComponentMapping(
                'eds',
                'adobe-commerce-paas',
                undefined,
                undefined,
                ['integration-service']
            );

            // Then: Each version should have its own component list
            expect(mapping['20']).toBe('Edge Delivery Services, Adobe Commerce PaaS');
            expect(mapping['22']).toBe('Kukla Integration Service');
        });

        it('should show single component name when only one component uses a version', async () => {
            // Given: Headless frontend uses Node 24 alone
            // When: Getting the version-to-component mapping
            const mapping = await manager.getNodeVersionToComponentMapping('headless');

            // Then: Should show single component name without commas
            expect(mapping['24']).toBe('Headless Storefront');
        });

        it('should not duplicate component names when same component referenced multiple times', async () => {
            // Given: A registry where same component could be referenced twice
            // (e.g., frontend explicitly specifying same dependency that's already included)
            mockLoader.load.mockResolvedValue({
                ...mockRawRegistry,
                dependencies: {
                    'demo-inspector': {
                        ...mockRawRegistry.dependencies!['demo-inspector'],
                        configuration: {
                            nodeVersion: '20', // Same as frontend/backend
                        },
                    },
                },
            });

            // When: Getting the mapping with demo-inspector explicitly listed twice
            // (simulating a case where component might be added from multiple sources)
            const mapping = await manager.getNodeVersionToComponentMapping(
                'eds',
                'adobe-commerce-paas',
                ['demo-inspector', 'demo-inspector'] // Duplicate in the array
            );

            // Then: Should not have duplicates in the Node 20 list
            const node20Components = mapping['20'].split(', ');
            const uniqueComponents = new Set(node20Components);
            expect(node20Components.length).toBe(uniqueComponents.size);
            expect(mapping['20']).toBe('Edge Delivery Services, Adobe Commerce PaaS, Demo Inspector');
        });
    });

    describe('compatibility checking', () => {
        it('should return true for compatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('eds', 'adobe-commerce-paas');

            expect(isCompatible).toBe(true);
        });

        it('should return false for incompatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('eds', 'nonexistent');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend not found', async () => {
            const isCompatible = await manager.checkCompatibility('nonexistent', 'adobe-commerce-paas');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend has no compatibleBackends', async () => {
            const isCompatible = await manager.checkCompatibility('headless', 'adobe-commerce-paas');

            expect(isCompatible).toBe(false);
        });
    });
});
