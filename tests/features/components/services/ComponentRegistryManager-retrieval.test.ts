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

describe('Component Registry Manager - Component Retrieval', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: any;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        mockLoader = getMockLoader();
        mockLoader.load.mockResolvedValue(mockRawRegistry);
    });

    describe('component retrieval by category', () => {
        it('should return frontends', async () => {
            const frontends = await manager.getFrontends();

            expect(frontends).toHaveLength(2);
            expect(frontends[0].id).toBe('frontend1');
            expect(frontends[1].id).toBe('frontend2');
        });

        it('should return backends', async () => {
            const backends = await manager.getBackends();

            expect(backends).toHaveLength(1);
            expect(backends[0].id).toBe('backend1');
        });

        it('should return dependencies', async () => {
            const dependencies = await manager.getDependencies();

            expect(dependencies).toHaveLength(1);
            expect(dependencies[0].id).toBe('dep1');
        });

        it('should return integrations', async () => {
            const integrations = await manager.getIntegrations();

            expect(integrations).toHaveLength(1);
            expect(integrations[0].id).toBe('integration1');
        });

        it('should return app builder components', async () => {
            const appBuilder = await manager.getAppBuilder();

            expect(appBuilder).toHaveLength(1);
            expect(appBuilder[0].id).toBe('app1');
        });

        it('should return empty array for missing integrations', async () => {
            mockLoader.load.mockResolvedValue({
                ...mockRawRegistry,
                selectionGroups: {
                    ...mockRawRegistry.selectionGroups,
                    integrations: undefined,
                },
            });

            const integrations = await manager.getIntegrations();

            expect(integrations).toEqual([]);
        });
    });

    describe('component lookup by ID', () => {
        it('should find frontend by ID', async () => {
            const component = await manager.getComponentById('frontend1');

            expect(component).toBeDefined();
            expect(component?.id).toBe('frontend1');
            expect(component?.name).toBe('Frontend 1');
        });

        it('should find backend by ID', async () => {
            const component = await manager.getComponentById('backend1');

            expect(component).toBeDefined();
            expect(component?.id).toBe('backend1');
        });

        it('should find dependency by ID', async () => {
            const component = await manager.getComponentById('dep1');

            expect(component).toBeDefined();
            expect(component?.id).toBe('dep1');
        });

        it('should return undefined for non-existent component', async () => {
            const component = await manager.getComponentById('nonexistent');

            expect(component).toBeUndefined();
        });
    });
});
