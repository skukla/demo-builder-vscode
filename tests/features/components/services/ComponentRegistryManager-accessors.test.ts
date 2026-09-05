/**
 * The accessors, and the shapes a missing component makes them read through.
 *
 * Every node-version reader walks `component?.configuration?.nodeVersion`, and
 * BOTH links of that chain are load-bearing against the real registry: a
 * selection can name a component that has been renamed away (the first link),
 * and a component can carry no `configuration` block at all — `test-tool` in the
 * shared mock has none, mirroring the tool entries in components.json (the
 * second). Dropping either link turns a skip into a TypeError that takes down
 * the prerequisites step.
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

/**
 * A registry whose selectable frontend and backend carry NO `configuration` key.
 *
 * components.json has entries shaped this way — `test-tool` in the shared mock
 * is one — and a selection group can list one, so the second link of
 * `component?.configuration?.nodeVersion` is reached in practice.
 */
const NO_CONFIGURATION_BLOCK = {
    ...mockRawRegistry,
    selectionGroups: {
        ...mockRawRegistry.selectionGroups,
        frontends: ['bare-frontend'],
        backends: ['bare-backend'],
    },
    frontends: {
        'bare-frontend': { name: 'Bare Frontend', description: 'x', type: 'frontend' },
    },
    backends: {
        'bare-backend': { name: 'Bare Backend', description: 'x', type: 'backend' },
    },
} as RawComponentRegistry;

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

describe('presets', () => {
    it('reports none — components.json has carried no presets since v2', async () => {
        const manager = managerFor();

        await expect(manager.getPresets()).resolves.toEqual([]);
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

describe('reading a node version off a component that is not there', () => {
    it('skips a frontend id nothing in the registry matches', async () => {
        const manager = managerFor();

        await expect(manager.getRequiredNodeVersions('renamed-away')).resolves.toEqual(new Set());
    });

    it('skips a backend id nothing matches', async () => {
        const manager = managerFor();

        await expect(
            manager.getRequiredNodeVersions(undefined, 'renamed-away'),
        ).resolves.toEqual(new Set());
    });

    it('skips a dependency id nothing matches', async () => {
        const manager = managerFor();

        await expect(
            manager.getRequiredNodeVersions(undefined, undefined, ['renamed-away']),
        ).resolves.toEqual(new Set());
    });

    it('skips a component carrying no configuration block', async () => {
        const manager = managerFor();

        await expect(
            manager.getRequiredNodeVersions(undefined, undefined, ['test-tool']),
        ).resolves.toEqual(new Set());
    });

    it('skips a FRONTEND that carries no configuration block', async () => {
        const manager = managerFor(NO_CONFIGURATION_BLOCK);

        await expect(manager.getRequiredNodeVersions('bare-frontend')).resolves.toEqual(new Set());
    });

    it('skips a BACKEND that carries no configuration block', async () => {
        const manager = managerFor(NO_CONFIGURATION_BLOCK);

        await expect(
            manager.getRequiredNodeVersions(undefined, 'bare-backend'),
        ).resolves.toEqual(new Set());
    });

    it('still collects the versions of the selections that ARE present', async () => {
        // The complement: without this, "skips everything" would pass against a
        // reader that had stopped collecting anything at all.
        const manager = managerFor();

        await expect(
            manager.getRequiredNodeVersions('headless', 'renamed-away', ['commerce-mesh']),
        ).resolves.toEqual(new Set(['24', '20']));
    });
});

describe('the NAME mapping reads through the same chain', () => {
    it('skips a frontend id nothing matches', async () => {
        const manager = managerFor();

        await expect(manager.getNodeVersionToComponentMapping('renamed-away')).resolves.toEqual(
            {},
        );
    });

    it('skips a backend id nothing matches', async () => {
        const manager = managerFor();

        await expect(
            manager.getNodeVersionToComponentMapping(undefined, 'renamed-away'),
        ).resolves.toEqual({});
    });

    it('skips a component carrying no configuration block', async () => {
        const manager = managerFor();

        await expect(
            manager.getNodeVersionToComponentMapping(undefined, undefined, ['test-tool']),
        ).resolves.toEqual({});
    });

    it('skips a frontend and a backend carrying no configuration block', async () => {
        const manager = managerFor(NO_CONFIGURATION_BLOCK);

        await expect(
            manager.getNodeVersionToComponentMapping('bare-frontend', 'bare-backend'),
        ).resolves.toEqual({});
    });

    it('skips a dependency id nothing matches', async () => {
        const manager = managerFor();

        await expect(
            manager.getNodeVersionToComponentMapping(undefined, undefined, ['renamed-away']),
        ).resolves.toEqual({});
    });

    it('names the components it DID find', async () => {
        const manager = managerFor();

        await expect(
            manager.getNodeVersionToComponentMapping('headless', undefined, ['commerce-mesh']),
        ).resolves.toEqual({ '24': 'Headless Storefront', '20': 'Adobe Commerce API Mesh' });
    });

    it('refuses an infrastructure version carrying shell metacharacters', async () => {
        const manager = managerFor({
            ...mockRawRegistry,
            infrastructure: {
                'adobe-cli': {
                    ...mockRawRegistry.infrastructure!['adobe-cli'],
                    configuration: { nodeVersion: '20$(id)' },
                },
            },
        } as RawComponentRegistry);

        await expect(manager.getNodeVersionToComponentMapping()).rejects.toThrow(
            /Invalid Node version in infrastructure "Adobe I\/O CLI & SDK"/,
        );
    });
});
