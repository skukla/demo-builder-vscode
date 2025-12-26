/**
 * ComponentRegistryManager Structure Tests
 *
 * These tests validate that ComponentRegistryManager correctly handles the
 * current components.json structure where components are in separate sections
 * (frontends, backends, mesh, dependencies, appBuilderApps) rather than a
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
            expect(registry.components.dependencies[0].id).toBe('demo-inspector');
        });

        it('should load app builder apps from separate "appBuilderApps" section', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            expect(registry.components.appBuilder).toHaveLength(1);
            expect(registry.components.appBuilder[0].id).toBe('integration-service');
        });

        it('should preserve component configuration including nodeVersion', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const registry = await manager.loadRegistry();

            const eds = registry.components.frontends.find(f => f.id === 'eds');
            expect(eds?.configuration?.nodeVersion).toBe('20');

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
            expect(component?.configuration?.nodeVersion).toBe('20');
        });

        it('should find backend by id (adobe-commerce-paas)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const component = await manager.getComponentById('adobe-commerce-paas');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Adobe Commerce PaaS');
        });

        it('should find dependency by id (demo-inspector)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const component = await manager.getComponentById('demo-inspector');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Demo Inspector');
        });

        it('should find app builder app by id (integration-service)', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const component = await manager.getComponentById('integration-service');

            expect(component).toBeDefined();
            expect(component?.name).toBe('Kukla Integration Service');
            expect(component?.configuration?.nodeVersion).toBe('22');
        });
    });

    describe('getNodeVersionToComponentMapping', () => {
        it('should return node version mapping for eds frontend', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const mapping = await manager.getNodeVersionToComponentMapping('eds', 'adobe-commerce-paas');

            // eds requires Node 20, adobe-commerce-paas requires Node 20
            expect(mapping['20']).toBeDefined();
        });

        it('should return node version mapping for headless frontend', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const mapping = await manager.getNodeVersionToComponentMapping('headless', 'adobe-commerce-paas');

            // headless requires Node 24, adobe-commerce-paas requires Node 20
            expect(mapping['24']).toBe('Headless Storefront');
            expect(mapping['20']).toBe('Adobe Commerce PaaS');
        });

        it('should include app builder node versions', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const mapping = await manager.getNodeVersionToComponentMapping(
                'eds',
                'adobe-commerce-paas',
                undefined,
                undefined,
                ['integration-service']
            );

            // integration-service requires Node 22
            expect(mapping['22']).toBe('Kukla Integration Service');
        });
    });

    describe('getRequiredNodeVersions', () => {
        it('should return required node versions for eds + paas', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const versions = await manager.getRequiredNodeVersions('eds', 'adobe-commerce-paas');

            expect(versions.has('20')).toBe(true);
        });

        it('should return multiple node versions for headless + paas + app builder', async () => {
            mockLoader.load.mockResolvedValue(mockRawRegistry);

            const versions = await manager.getRequiredNodeVersions(
                'headless',
                'adobe-commerce-paas',
                undefined,
                undefined,
                ['integration-service']
            );

            expect(versions.has('24')).toBe(true); // headless
            expect(versions.has('20')).toBe(true); // adobe-commerce-paas
            expect(versions.has('22')).toBe(true); // integration-service
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
