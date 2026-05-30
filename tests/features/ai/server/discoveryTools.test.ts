/**
 * Discovery tools tests.
 *
 * Exercises list_stacks / list_demo_packages / list_components against the real
 * bundled config, asserting the lean output shape and that known ids appear.
 * The (package → availableStacks) mapping is the contract create_project will
 * validate against, so it is checked explicitly.
 */

import { registerDiscoveryTools } from '@/features/ai/server/discoveryTools';

/** Fake McpServer capturing registrations. */
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
        tools,
    };
}

describe('registerDiscoveryTools', () => {
    it('registers the three discovery tools', () => {
        const server = fakeServer();
        registerDiscoveryTools(server);
        expect([...server.tools.keys()].sort()).toEqual(['list_components', 'list_demo_packages', 'list_stacks']);
    });

    it('list_stacks returns lean stack rows with frontend/backend and auth flags', async () => {
        const server = fakeServer();
        registerDiscoveryTools(server);

        const stacks = (await server.call('list_stacks')) as Array<Record<string, unknown>>;
        expect(Array.isArray(stacks)).toBe(true);
        const ids = stacks.map((s) => s.id);
        expect(ids).toContain('headless-paas');
        expect(ids).toContain('eds-paas');

        const eds = stacks.find((s) => s.id === 'eds-paas')!;
        expect(eds).toMatchObject({ requiresGitHub: true, requiresDaLive: true });
        expect(eds.frontend).toBeDefined();
        expect(eds.backend).toBeDefined();
    });

    it('list_demo_packages maps each package to the stacks it supports', async () => {
        const server = fakeServer();
        registerDiscoveryTools(server);

        const packages = (await server.call('list_demo_packages')) as Array<{ id: string; availableStacks: string[] }>;
        const citisignal = packages.find((p) => p.id === 'citisignal');
        expect(citisignal).toBeDefined();
        // availableStacks are the keys of the storefronts map — the valid pairs.
        expect(citisignal!.availableStacks.length).toBeGreaterThan(0);
        expect(citisignal!.availableStacks).toContain('eds-paas');
    });

    it('list_components groups components by type with id + name', async () => {
        const server = fakeServer();
        registerDiscoveryTools(server);

        const grouped = (await server.call('list_components')) as Record<string, Array<{ id: string; name: string }>>;
        expect(grouped.frontends.map((c) => c.id)).toContain('eds-storefront');
        expect(grouped.backends.map((c) => c.id)).toContain('adobe-commerce-paas');
        expect(grouped.frontends[0]).toHaveProperty('name');
    });

    it('emits compact JSON (no pretty-print newlines)', async () => {
        const server = fakeServer();
        registerDiscoveryTools(server);
        const handler = server.tools.get('list_stacks')!;
        const text = (await handler()).content[0].text;
        expect(text).not.toContain('\n');
    });
});
