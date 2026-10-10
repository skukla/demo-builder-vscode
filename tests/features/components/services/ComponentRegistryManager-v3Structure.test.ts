/**
 * ComponentRegistryManager Structure Tests
 *
 * These tests validate that ComponentRegistryManager correctly handles the
 * current components.json structure where components are in separate sections
 * (frontends, backends, mesh, dependencies) rather than a
 * unified 'components' map.
 *
 * This test suite was added after a bug where the 'eds' frontend wasn't
 * recognized because the code only looked in raw.components (legacy structure)
 * instead of raw.frontends (current section-based structure).
 */

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

describe('ComponentRegistryManager - Section-Based Structure', () => {
    let manager: ComponentRegistryManager;
    let mockLoader: ReturnType<typeof getMockLoader>;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new ComponentRegistryManager('/fake/extension/path');
        mockLoader = getMockLoader();
    });

    describe('loading registry structure', () => {
        it('should load frontends from separate "frontends" section', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.components.frontends).toHaveLength(2);
            expect(registry.components.frontends.map(f => f.id)).toContain('eds');
            expect(registry.components.frontends.map(f => f.id)).toContain('headless');
        });

        it('should load backends from separate "backends" section', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.components.backends).toHaveLength(1);
            expect(registry.components.backends[0].id).toBe('adobe-commerce-paas');
        });

        it('should load dependencies from separate "dependencies" section', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.components.dependencies).toHaveLength(1);
            expect(registry.components.dependencies[0].id).toBe('test-tool');
        });

        it('should load mesh components from separate "mesh" section', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.components.mesh).toHaveLength(1);
            expect(registry.components.mesh![0].id).toBe('commerce-mesh');
        });
    });

    describe('getComponentById', () => {
        it('should find frontend by id (eds)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const component = await manager.getComponentById('eds');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Edge Delivery Services');
        });

        it('should find backend by id (adobe-commerce-paas)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const component = await manager.getComponentById('adobe-commerce-paas');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Adobe Commerce PaaS');
        });

        it('should find dependency by id (test-tool)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const component = await manager.getComponentById('test-tool');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Test Tool');
        });

        it('should find mesh component by id (commerce-mesh)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const component = await manager.getComponentById('commerce-mesh');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Adobe Commerce API Mesh');
        });
    });

    describe('getFrontends/getBackends', () => {
        it('should return all frontends', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const frontends = await manager.getFrontends();

            expect(frontends).toHaveLength(2);
            expect(frontends.find(f => f.id === 'eds')).toBeDefined();
            expect(frontends.find(f => f.id === 'headless')).toBeDefined();
        });

        it('should return all backends', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const backends = await manager.getBackends();

            expect(backends).toHaveLength(1);
            expect(backends[0].id).toBe('adobe-commerce-paas');
        });
    });
});
