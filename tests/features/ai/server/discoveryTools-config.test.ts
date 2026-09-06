/**
 * discoveryTools against a MALFORMED component registry.
 *
 * `list_components` reads the bundled components.json, in which every section is
 * a well-formed object — so the guards that handle a missing or non-object
 * section, and the fallback that names an entry after its id, are unreachable
 * from the real config. This suite hands the module a registry with each of
 * those shapes in it and asserts what comes out.
 */

import { registerDiscoveryTools } from '@/features/ai/server/discoveryTools';

/**
 * Handed in through the registrar's `registry` seam — NOT a jest.mock of the
 * JSON leaf, which `tests/sop/no-config-leaf-mocks` refuses.
 */
const MALFORMED_REGISTRY = {
    frontends: {
        'eds-storefront': { name: 'EDS Storefront' },
        'nameless-frontend': {},
    },
    // A section the registry does not carry at all.
    backends: null,
    // A section carrying something that is not a map of entries.
    mesh: 'not-an-object',
    integrations: {},
    addons: { 'null-entry': null },
};

type Grouped = Record<string, Array<{ id: string; name: string }>>;

function fakeServer() {
    const tools = new Map<string, () => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(name: string, _def: unknown, handler: () => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        async call(name: string): Promise<unknown> {
            const result = await tools.get(name)!();
            return JSON.parse(result.content[0].text);
        },
    };
}

async function listComponents(): Promise<Grouped> {
    const server = fakeServer();
    registerDiscoveryTools(server, MALFORMED_REGISTRY);
    return (await server.call('list_components')) as Grouped;
}

describe('list_components against a malformed registry', () => {
    it('a section that is absent comes back as an empty list, not a crash', async () => {
        expect((await listComponents()).backends).toStrictEqual([]);
    });

    it('a section that is not a map of entries comes back as an empty list', async () => {
        // Without the typeof guard a string section enumerates into one row per
        // character, which an agent would read as thirteen components.
        expect((await listComponents()).mesh).toStrictEqual([]);
    });

    it('an empty section comes back as an empty list', async () => {
        expect((await listComponents()).integrations).toStrictEqual([]);
    });

    it('an entry with no name is named for its id', async () => {
        expect((await listComponents()).frontends).toStrictEqual([
            { id: 'eds-storefront', name: 'EDS Storefront' },
            { id: 'nameless-frontend', name: 'nameless-frontend' },
        ]);
    });

    it('an entry that is null is named for its id rather than throwing', async () => {
        expect((await listComponents()).addons).toStrictEqual([
            { id: 'null-entry', name: 'null-entry' },
        ]);
    });
});
