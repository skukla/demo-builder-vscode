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
            expect(registry.components.mesh![0].configuration?.nodeVersion).toBe('20');
        });

        it('should preserve component configuration including nodeVersion where defined', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            // EDS doesn't have nodeVersion (it's a remote service)
            const eds = registry.components.frontends.find(f => f.id === 'eds');
            expect(eds?.configuration?.nodeVersion).toBeUndefined();

            // Headless (Next.js) has nodeVersion for local development
            const headless = registry.components.frontends.find(f => f.id === 'headless');
            expect(headless?.configuration?.nodeVersion).toBe('24');
        });
    });

    describe('getComponentById', () => {
        it('should find frontend by id (eds)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const component = await manager.getComponentById('eds');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Edge Delivery Services');
            // EDS doesn't have nodeVersion requirement
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
            expect(component?.configuration?.nodeVersion).toBe('20');
        });
    });

    describe('getNodeVersionToComponentMapping', () => {
        it('should return empty mapping for eds + paas (no Node requirements)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const mapping = await manager.getNodeVersionToComponentMapping('eds', 'adobe-commerce-paas');

            // EDS and PaaS don't have Node requirements
            expect(Object.keys(mapping).length).toBe(0);
        });

        it('should return node version mapping for headless frontend', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const mapping = await manager.getNodeVersionToComponentMapping('headless');

            // headless requires Node 24
            expect(mapping['24']).toBe('Headless Storefront');
        });

    });

    describe('getRequiredNodeVersions', () => {
        it('should return empty set for eds + paas (no Node requirements)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas');

            expect(versions.size).toBe(0);
        });

        it('should return node versions for headless frontend', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const versions = await manager.getRequiredNodeVersions('headless');

            expect(versions.has('24')).toBe(true); // headless
            expect(versions.size).toBe(1);
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
