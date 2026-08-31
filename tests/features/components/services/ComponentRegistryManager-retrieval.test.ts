/**
 * ComponentRegistryManager - Retrieval Tests
 *
 * Tests component retrieval by category and ID lookup operations.
 *
 * These nine tests existed TWICE, byte-identical, in this file and in
 * `ComponentRegistryManager-registration.test.ts`, from the 2025-11-18 file split
 * that copied rather than moved them. The twin was deleted on 2026-08-31.
 *
 * The twin's name was wrong from the day it was created: `ComponentRegistryManager`
 * has no registration method — every public member is a getter or `loadRegistry` —
 * and the twin's own docblock described retrieval. So nothing was lost with it, and
 * there is no missing registration suite to write.
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
            expect(frontends[0].id).toBe('eds');
            expect(frontends[1].id).toBe('headless');
        });

        it('should return backends', async () => {
            const backends = await manager.getBackends();

            expect(backends).toHaveLength(1);
            expect(backends[0].id).toBe('adobe-commerce-paas');
        });

        it('should return dependencies', async () => {
            const dependencies = await manager.getDependencies();

            expect(dependencies).toHaveLength(1);
            expect(dependencies[0].id).toBe('test-tool');
        });

        it('should return integrations', async () => {
            const integrations = await manager.getIntegrations();

            expect(integrations).toHaveLength(1);
            expect(integrations[0].id).toBe('experience-platform');
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
            const component = await manager.getComponentById('eds');

            expect(component).toBeDefined();
            expect(component?.id).toBe('eds');
            expect(component?.name).toBe('Edge Delivery Services');
        });

        it('should find backend by ID', async () => {
            const component = await manager.getComponentById('adobe-commerce-paas');

            expect(component).toBeDefined();
            expect(component?.id).toBe('adobe-commerce-paas');
        });

        it('should find dependency by ID', async () => {
            const component = await manager.getComponentById('test-tool');

            expect(component).toBeDefined();
            expect(component?.id).toBe('test-tool');
        });

        it('should return undefined for non-existent component', async () => {
            const component = await manager.getComponentById('nonexistent');

            expect(component).toBeUndefined();
        });
    });
});
