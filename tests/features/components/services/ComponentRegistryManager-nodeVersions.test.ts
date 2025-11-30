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
            const versions = await manager.getRequiredNodeVersions('frontend1', 'backend1');

            expect(versions.size).toBe(1);
            expect(versions.has('20')).toBe(true);
        });

        it('should include dependency node versions', async () => {
            const versions = await manager.getRequiredNodeVersions('frontend1', 'backend1', ['dep1']);

            expect(versions.size).toBe(2);
            expect(versions.has('20')).toBe(true);
            expect(versions.has('18')).toBe(true);
        });

        it('should include app builder node versions', async () => {
            const versions = await manager.getRequiredNodeVersions(
                'frontend1',
                'backend1',
                undefined,
                undefined,
                ['app1']
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
                components: {
                    ...mockRawRegistry.components!,
                    frontend1: {
                        ...mockRawRegistry.components!.frontend1,
                        configuration: {},
                    },
                },
            });

            const versions = await manager.getRequiredNodeVersions('frontend1');

            expect(versions.size).toBe(0);
        });
    });

    describe('compatibility checking', () => {
        it('should return true for compatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('frontend1', 'backend1');

            expect(isCompatible).toBe(true);
        });

        it('should return false for incompatible frontend and backend', async () => {
            const isCompatible = await manager.checkCompatibility('frontend1', 'nonexistent');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend not found', async () => {
            const isCompatible = await manager.checkCompatibility('nonexistent', 'backend1');

            expect(isCompatible).toBe(false);
        });

        it('should return false when frontend has no compatibleBackends', async () => {
            const isCompatible = await manager.checkCompatibility('frontend2', 'backend1');

            expect(isCompatible).toBe(false);
        });
    });
});
