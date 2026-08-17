/**
 * get_component_requirements — drives the REAL components.json.
 *
 * No fixture, on purpose. The defect this tool was rewritten to fix was a
 * source mismatch: it read the registry manager (no addons) while its sibling
 * `list_components` read the config file (addons included), so the config file
 * is the thing under test. A fixture would have agreed with either version.
 */

import componentsConfig from '@/features/components/config/components.json';
import { registerComponentRequirementsTool } from '@/features/ai/server/componentRequirementsTool';
import { expectWithinCeiling } from './responseCeilings';

function serve() {
    const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    registerComponentRequirementsTool({
        registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h),
    });
    const invoke = (componentId?: string) =>
        tools.get('get_component_requirements')!({ componentId });
    return {
        raw: async (id?: string) => (await invoke(id)).content[0].text,
        call: async (id?: string) => JSON.parse((await invoke(id)).content[0].text),
    };
}

const CONFIG = componentsConfig as unknown as Record<string, Record<string, unknown>>;

describe('get_component_requirements', () => {
    it('resolves env-var keys to what they MEAN, not just their names', async () => {
        const out = await serve().call('adobe-commerce-accs');
        const endpoint = (out.requiredEnvVars as Array<Record<string, string>>).find(
            (v) => v.key === 'ACCS_GRAPHQL_ENDPOINT',
        );

        // A key alone is not actionable — the agent needs to know what goes in it.
        expect(endpoint).toMatchObject({ label: expect.any(String), type: 'url' });
        expect(endpoint?.description).toBeTruthy();
    });

    // THE REGRESSION. list_components advertises an `addons` section; the first
    // version read the registry manager, which has no addons concept, and dead-ended
    // on a component the surface had just offered.
    it('answers for every section list_components advertises, addons included', async () => {
        for (const section of ['frontends', 'backends', 'mesh', 'integrations', 'addons']) {
            for (const id of Object.keys(CONFIG[section] ?? {})) {
                const out = await serve().call(id);
                expect(out.error).toBeUndefined();
                expect(out).toMatchObject({ id, category: section });
            }
        }
    });

    it('reports the category it found the component in', async () => {
        expect((await serve().call('eds-storefront')).category).toBe('frontends');
        expect((await serve().call('adobe-commerce-aco')).category).toBe('addons');
    });

    it('keeps an env-var key that has no registry definition', async () => {
        // Dropping it would under-report what the component needs.
        const out = await serve().call('eds-storefront');
        for (const v of out.optionalEnvVars as Array<Record<string, unknown>>) {
            expect(typeof v.key).toBe('string');
        }
    });

    it('names the known ids when the component does not exist', async () => {
        const out = await serve().call('no-such-component');

        expect(out.error).toMatch(/no-such-component/);
        expect(out.known).toContain('eds-storefront');
        expect(out.known).toContain('adobe-commerce-aco');
    });

    it('treats a missing componentId as a miss, not a crash', async () => {
        expect((await serve().call(undefined)).error).toMatch(/No component/);
    });

    it('carries none of the rest of the catalog', async () => {
        const raw = await serve().raw('adobe-commerce-accs');

        expect(raw).not.toContain('eds-storefront');
        // The env-var registry is the bulk of the catalog; only this component's
        // keys should appear.
        expect(raw).not.toContain('AEM_ASSETS_ENABLED');
    });

    it('stays within its recorded ceiling on the largest component', async () => {
        const sizes = await Promise.all(
            ['frontends', 'backends', 'mesh', 'integrations', 'addons'].flatMap((s) =>
                Object.keys(CONFIG[s] ?? {}).map(async (id) => await serve().raw(id)),
            ),
        );
        const largest = sizes.sort((a, b) => b.length - a.length)[0];
        expectWithinCeiling('get_component_requirements', largest);
    });
});
