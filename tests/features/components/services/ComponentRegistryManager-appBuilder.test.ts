/**
 * ComponentRegistryManager App Builder Category Tests
 *
 * Validates that the registry transform surfaces a first-class `appBuilder`
 * category that mirrors the existing `mesh` category:
 * - transform always produces `components.appBuilder` (empty section -> [])
 * - app-builder components load from the `appBuilder` section
 * - getAppBuilder() returns the list (mirrors getMesh())
 * - getComponentById resolves an app-builder id
 *
 * Slice 1: the live components.json `appBuilder` section is empty, so these
 * tests inject a fake app-builder entry into the raw registry fixture to
 * exercise the transform + lookup paths.
 */

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import { mockRawRegistry, getMockLoader } from './ComponentRegistryManager.testUtils';
import type { RawComponentRegistry } from '@/types';

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

const registryWithApp: RawComponentRegistry = {
    ...mockRawRegistry,
    appBuilder: {
        'custom-app': {
            id: 'custom-app',
            name: 'Custom App Builder App',
            description: 'A custom App Builder app',
            type: 'app-builder',
            subType: 'app',
            configuration: {
                nodeVersion: '22',
            },
        },
    },
};

describe('ComponentRegistryManager - App Builder Category', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: ReturnType<typeof getMockLoader>;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        mockLoader = getMockLoader();
    });

    describe('transform', () => {
        it('should always surface components.appBuilder as [] when no appBuilder section exists', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.components.appBuilder).toBeDefined();
            expect(registry.components.appBuilder).toEqual([]);
        });

        it('should load app-builder components from the "appBuilder" section', async () => {
            mockLoader.load.mockResolvedValue(registryWithApp);

            const registry = await manager.loadRegistry();

            expect(registry.components.appBuilder).toHaveLength(1);
            expect(registry.components.appBuilder![0].id).toBe('custom-app');
            expect(registry.components.appBuilder![0].subType).toBe('app');
        });

        it('should not affect the mesh category when an appBuilder section is present', async () => {
            mockLoader.load.mockResolvedValue(registryWithApp);

            const registry = await manager.loadRegistry();

            expect(registry.components.mesh).toHaveLength(1);
            expect(registry.components.mesh![0].id).toBe('commerce-mesh');
        });
    });

    describe('getAppBuilder', () => {
        it('should return the app-builder component list', async () => {
            mockLoader.load.mockResolvedValue(registryWithApp);

            const appBuilders = await manager.getAppBuilder();

            expect(appBuilders).toHaveLength(1);
            expect(appBuilders[0].id).toBe('custom-app');
        });

        it('should return an empty array when no appBuilder section exists', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const appBuilders = await manager.getAppBuilder();

            expect(appBuilders).toEqual([]);
        });
    });

    describe('getComponentById', () => {
        it('should resolve an app-builder component by id', async () => {
            mockLoader.load.mockResolvedValue(registryWithApp);

            const component = await manager.getComponentById('custom-app');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Custom App Builder App');
            expect(component?.configuration?.nodeVersion).toBe('22');
        });

        it('should still resolve a mesh component by id when appBuilder is present', async () => {
            mockLoader.load.mockResolvedValue(registryWithApp);

            const component = await manager.getComponentById('commerce-mesh');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Adobe Commerce API Mesh');
        });
    });
});
