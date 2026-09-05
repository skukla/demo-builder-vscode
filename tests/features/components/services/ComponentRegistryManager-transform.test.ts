/**
 * What `loadRegistry` makes of a components.json that is missing sections.
 *
 * The registry file is edited by hand and grew its sections one at a time, so
 * "the section is absent" is a real shape rather than a defensive hypothetical —
 * and every absent section is read with `Object.keys` or spread into a map,
 * either of which throws on undefined. A registry that fails to load takes the
 * whole wizard with it, so the fallbacks are load-bearing.
 *
 * The transform is reached through `loadRegistry` rather than called directly:
 * it is private, and the public method is where the shapes actually cross.
 */

import { ComponentRegistryManager } from '@/features/components/services/ComponentRegistryManager';
import type { RawComponentRegistry } from '@/types/components';
import { getMockLoader, mockRawRegistry } from './ComponentRegistryManager.testUtils';

jest.mock('@/core/config/ConfigurationLoader', () => ({
    ConfigurationLoader: jest.fn().mockImplementation(() => ({ load: jest.fn() })),
}));

/** A manager whose loader answers with `raw`. */
function managerFor(raw: RawComponentRegistry) {
    const manager = new ComponentRegistryManager('/fake/extension/path');
    getMockLoader().load.mockResolvedValue(raw);
    return manager;
}

/** `mockRawRegistry` with the named top-level sections removed. */
function without(...sections: Array<keyof RawComponentRegistry>): RawComponentRegistry {
    const raw = { ...mockRawRegistry };
    for (const section of sections) delete raw[section];
    return raw;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('loading the registry', () => {
    it('asks the loader to report a parse failure as a registry problem', async () => {
        // Without the message the failure surfaces as a bare JSON parse error
        // naming a path the user has never heard of.
        const manager = managerFor(mockRawRegistry);

        await manager.loadRegistry();

        expect(getMockLoader().load).toHaveBeenCalledWith(
            expect.objectContaining({ validationErrorMessage: expect.any(String) }),
        );
    });

    it('reads the file once and serves every later call from memory', async () => {
        const manager = managerFor(mockRawRegistry);

        await manager.loadRegistry();
        await manager.getFrontends();
        await manager.getBackends();

        expect(getMockLoader().load).toHaveBeenCalledTimes(1);
    });
});

describe('sections that are absent', () => {
    it('loads a registry with no mesh section', async () => {
        const manager = managerFor(without('mesh'));

        await expect(manager.getMesh()).resolves.toEqual([]);
    });

    it('loads a registry with no appBuilder section', async () => {
        const manager = managerFor(without('appBuilder'));

        await expect(manager.getAppBuilder()).resolves.toEqual([]);
    });

    it('loads a registry with no infrastructure section', async () => {
        const manager = managerFor(without('infrastructure'));

        await expect(manager.loadRegistry()).resolves.toMatchObject({ infrastructure: [] });
    });

    it('loads a registry with no selectionGroups at all', async () => {
        const manager = managerFor(without('selectionGroups'));

        const registry = await manager.loadRegistry();

        expect(registry.components.frontends).toEqual([]);
        expect(registry.components.backends).toEqual([]);
    });

    it('reports NO services rather than undefined when the section is absent', async () => {
        // Callers index straight into this record.
        const manager = managerFor(without('services'));

        await expect(manager.getServices()).resolves.toEqual({});
    });

    it('reports NO shared env vars rather than undefined when the section is absent', async () => {
        const manager = managerFor(without('envVars'));

        await expect(manager.loadRegistry()).resolves.toMatchObject({ envVars: {} });
    });
});

describe('sections that are present', () => {
    it('carries the services through as written', async () => {
        const manager = managerFor({
            ...mockRawRegistry,
            services: { catalog: { name: 'Catalog Service' } },
        } as RawComponentRegistry);

        await expect(manager.getServices()).resolves.toMatchObject({
            catalog: { name: 'Catalog Service' },
        });
    });

    it('carries the shared env vars through as written', async () => {
        const manager = managerFor({
            ...mockRawRegistry,
            envVars: { API_KEY: { label: 'API key', type: 'password' } },
        } as RawComponentRegistry);

        await expect(manager.loadRegistry()).resolves.toMatchObject({
            envVars: { API_KEY: { label: 'API key', type: 'password' } },
        });
    });

    it('loads mesh and appBuilder entries straight from their sections', async () => {
        // Neither is listed in selectionGroups — they are read from the section's
        // own keys, which is why a missing section is a crash rather than a gap.
        const manager = managerFor({
            ...mockRawRegistry,
            appBuilder: {
                'my-app': { name: 'My App', description: 'x', type: 'dependency' },
            },
        } as RawComponentRegistry);

        await expect(manager.getMesh()).resolves.toMatchObject([{ id: 'commerce-mesh' }]);
        await expect(manager.getAppBuilder()).resolves.toMatchObject([{ id: 'my-app' }]);
    });
});

describe('a selection group naming a component that does not exist', () => {
    it('leaves it out rather than putting a hole in the list', async () => {
        // The groups and the sections are edited separately, so a rename in one
        // and not the other is the normal way this happens. A null in the array
        // reaches the wizard, which reads `.id` off every entry.
        const manager = managerFor({
            ...mockRawRegistry,
            selectionGroups: {
                ...mockRawRegistry.selectionGroups,
                frontends: ['eds', 'renamed-away', 'headless'],
            },
        } as RawComponentRegistry);

        const frontends = await manager.getFrontends();

        expect(frontends.map((c) => c.id)).toEqual(['eds', 'headless']);
    });
});
