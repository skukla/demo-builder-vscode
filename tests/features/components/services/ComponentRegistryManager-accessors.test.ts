/**
 * The registry's accessors: services, and getComponentById across every section
 * (including the ones no selection group lists).
 */

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import type { RawComponentRegistry } from '@/types/components';
import { getMockLoader, mockRawRegistry } from './ComponentRegistryManager.testUtils';

jest.mock('@/core/config/ConfigurationLoader', () => ({
    ConfigurationLoader: jest.fn().mockImplementation(() => ({ load: jest.fn() })),
}));

function managerFor(raw: RawComponentRegistry = mockRawRegistry) {
    const manager = new ComponentRegistryManager('/fake/extension/path');
    getMockLoader().load.mockResolvedValue(raw);
    return manager;
}

const WITH_SERVICES = {
    ...mockRawRegistry,
    services: {
        catalog: { name: 'Catalog Service', requiredEnvVars: ['API_KEY'] },
        search: { name: 'Live Search' },
    },
} as RawComponentRegistry;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('services', () => {
    it('returns every service the registry declares', async () => {
        const manager = managerFor(WITH_SERVICES);

        const services = await manager.getServices();

        expect(Object.keys(services).sort()).toEqual(['catalog', 'search']);
    });

    it('finds one service by id', async () => {
        const manager = managerFor(WITH_SERVICES);

        await expect(manager.getServiceById('catalog')).resolves.toMatchObject({
            name: 'Catalog Service',
        });
    });

    it('returns undefined for a service id nothing declares', async () => {
        const manager = managerFor(WITH_SERVICES);

        await expect(manager.getServiceById('nope')).resolves.toBeUndefined();
    });
});

describe('getComponentById', () => {
    it('finds a mesh entry, which no selection group lists', async () => {
        const manager = managerFor();

        await expect(manager.getComponentById('commerce-mesh')).resolves.toMatchObject({
            id: 'commerce-mesh',
            subType: 'mesh',
        });
    });

    it('finds an appBuilder entry', async () => {
        const manager = managerFor({
            ...mockRawRegistry,
            appBuilder: { 'my-app': { name: 'My App', description: 'x', type: 'dependency' } },
        } as RawComponentRegistry);

        await expect(manager.getComponentById('my-app')).resolves.toMatchObject({ id: 'my-app' });
    });

    it('finds an integration entry', async () => {
        const manager = managerFor();

        await expect(manager.getComponentById('experience-platform')).resolves.toMatchObject({
            id: 'experience-platform',
        });
    });
});
