/**
 * Discovery tools tests.
 *
 * Exercises list_stacks / list_demo_packages / list_components against the real
 * bundled config, asserting the lean output shape and that known ids appear.
 * The (package → availableStacks) mapping is the contract create_project will
 * validate against, so it is checked explicitly.
 */

jest.mock('@/features/project-creation/services/addedDemoSettings', () => ({
    readAddedDemos: jest.fn(() => []),
}));

import { registerDiscoveryTools } from '@/features/ai/server/discoveryTools';
import { readAddedDemos } from '@/features/project-creation/services/addedDemoSettings';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { fakeServer } from './discoveryTools.testUtils';
import { expectWithinCeiling } from './responseCeilings';

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

    it('list_demo_packages lists the added demos after the shipped ones, with their repository and the stacks of their kind', async () => {
        (readAddedDemos as jest.Mock).mockReturnValueOnce([
            makeAddedDemo(),
            makeAddedDemo({ name: 'Bob', source: { owner: 'bob', repo: 'next-shop' }, storefrontKind: 'headless' }),
        ]);
        const server = fakeServer();
        registerDiscoveryTools(server);

        const packages = (await server.call('list_demo_packages')) as Array<Record<string, unknown>>;

        expect(packages.find((p) => p.id === 'citisignal')).toMatchObject({ source: 'shipped' });
        const jen = packages.find((p) => p.id === 'added:jen/isle5-demo');
        expect(jen).toMatchObject({ name: 'Isle5 by Jen', source: 'added', repository: 'jen/isle5-demo' });
        expect(jen!.availableStacks).toContain('eds-paas');
        expect(jen!.availableStacks).not.toContain('headless-paas');
        const bob = packages.find((p) => p.id === 'added:bob/next-shop');
        expect(bob!.availableStacks).toContain('headless-paas');
        expect(packages.indexOf(jen!)).toBeGreaterThan(packages.indexOf(packages.find((p) => p.id === 'citisignal')!));
    });

    it('list_components groups components by type with id + name', async () => {
        const server = fakeServer();
        registerDiscoveryTools(server);

        const grouped = (await server.call('list_components')) as Record<string, Array<{ id: string; name: string }>>;
        expect(grouped.frontends.map((c) => c.id)).toContain('eds-storefront');
        expect(grouped.backends.map((c) => c.id)).toContain('adobe-commerce-paas');
        expect(grouped.frontends[0]).toHaveProperty('name');
    });

    it('list_components carries the App Builder catalog — the ids add_integration names', async () => {
        // add_integration's description says "from list_components"; until
        // 2026-08-27 the listing did not carry these ids (traced live: the
        // documented discovery route dead-ended on its own instruction).
        const server = fakeServer();
        registerDiscoveryTools(server);

        const grouped = (await server.call('list_components')) as Record<string, Array<{ id: string; name: string }>>;
        const ids = grouped.appBuilderIntegrations.map((c) => c.id);
        expect(ids).toContain('commerce-integration-starter-kit');
        expect(ids).toContain('app-builder-shell');
    });

    it('a stack that declares no auth requirements comes back false, not true', async () => {
        // `headless-paas` carries neither flag in stacks.json; the tool's job is
        // to turn "absent" into an explicit false an agent can read.
        const server = fakeServer();
        registerDiscoveryTools(server);

        const stacks = (await server.call('list_stacks')) as Array<Record<string, unknown>>;
        const headless = stacks.find((s) => s.id === 'headless-paas')!;
        expect(headless).toMatchObject({ requiresGitHub: false, requiresDaLive: false });
    });

    it('emits compact JSON (no pretty-print newlines)', async () => {
        const server = fakeServer();
        registerDiscoveryTools(server);
        expect(await server.callText('list_stacks')).not.toContain('\n');
    });
});

// ─── response-size ceilings (phase 2 audit) ──────────────────────────────────
describe('response-size ceilings', () => {
    it.each(['list_components', 'list_demo_packages', 'list_stacks'])(
        '%s stays within its ceiling',
        async (tool) => {
            const s = fakeServer();
            registerDiscoveryTools(s);
            expectWithinCeiling(tool, JSON.stringify(await s.call(tool)));
        },
    );
});

// ─── what each tool is registered AS ─────────────────────────────────────────
describe('discovery tool declarations', () => {
    it.each([
        ['list_stacks', 'List Stacks'],
        ['list_demo_packages', 'List Demo Packages'],
        ['list_components', 'List Components'],
    ])('%s registers read-only, non-destructive and without auth', (tool, title) => {
        const server = fakeServer();
        registerDiscoveryTools(server);

        const def = server.defs.get(tool)!;
        expect(def.title).toBe(title);
        // Discovery is the pre-auth surface: an agent must be able to see the
        // choice space before anyone signs in.
        expect(def.needsAuth).toBe(false);
        expect(def.annotations).toStrictEqual({ readOnlyHint: true, destructiveHint: false });
        expect(def.inputSchema).toStrictEqual({});
        // The wording is free to change; that there IS one is not.
        expect(typeof def.description).toBe('string');
    });
});
