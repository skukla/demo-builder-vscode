/**
 * configure_project — the wide tool that fills in what create_project leaves empty.
 *
 * These tests are mostly about the three guards that buy back what five narrow
 * tools would have got from their schemas: unknown keys rejected, store scope
 * moved as a triple, and secrets refused rather than stored.
 *
 * Fixture shapes come from the Project interface (`base.ts`) and the real
 * env-var registry: ACCS_OAUTH_CLIENT_SECRET and ADOBE_COMMERCE_ADMIN_PASSWORD
 * are the two keys `components.json` marks `type: 'password'`.
 */

import { registerConfigureProjectTool } from '@/features/ai/server/configureProjectTool';
import type { StateManager } from '@/core/state/stateManager';
import type { Project } from '@/types/base';

const getCurrentProject = jest.fn();
const saveProject = jest.fn();
const stateManager = { getCurrentProject, saveProject } as unknown as StateManager;

function serve() {
    const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    registerConfigureProjectTool(
        { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
        stateManager,
    );
    return async (args: unknown) =>
        JSON.parse((await tools.get('configure_project')!(args)).content[0].text);
}

/**
 * The tool's SCHEMA, for asserting what a real caller can send.
 *
 * It is a strict `z.object`, not a raw shape — see the tool's comment. That is
 * why fields are reached through `.shape`.
 */
function schema() {
    let def: { inputSchema: { shape: Record<string, { parse: (v: unknown) => unknown }>; safeParse: (v: unknown) => { success: boolean; error?: { message: string } } } } | undefined;
    registerConfigureProjectTool(
        { registerTool: (_n: string, d: never) => { def = d; } },
        stateManager,
    );
    return def!.inputSchema;
}

/**
 * A freshly created project: structurally complete, entirely unconfigured.
 *
 * `componentInstances` is a RECORD keyed by component id, and the mesh is a
 * `dependency`-typed instance found by subType — copied from a real
 * `.demo-builder.json`, not invented.
 */
function freshProject(): Project {
    return {
        name: 'demo',
        path: '/p/demo',
        componentSelections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
        componentInstances: {
            'eds-accs-mesh': {
                id: 'eds-accs-mesh',
                type: 'dependency',
                subType: 'mesh',
                status: 'deployed',
            },
        },
        componentConfigs: {},
        selectedAddons: [],
        selectedBlockLibraries: [],
        meshStatusSummary: 'deployed',
    } as unknown as Project;
}

beforeEach(() => {
    jest.clearAllMocks();
    getCurrentProject.mockResolvedValue(freshProject());
});

describe('configure_project — guards', () => {
    // A configuration write that silently drops a field leaves the agent
    // believing something is set that is not.
    it('REJECTS unknown fields rather than ignoring them', async () => {
        const out = await serve()({ datapack: { name: 'd', version: '1' }, stroeScope: {} });

        expect(out.error).toMatch(/Unknown field\(s\): stroeScope/);
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('refuses an empty call rather than reporting a no-op success', async () => {
        expect((await serve()({})).error).toMatch(/Nothing to apply/);
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('says so plainly when there is no current project', async () => {
        getCurrentProject.mockResolvedValue(null);
        expect((await serve()({ addons: ['x'] })).error).toMatch(/No current project/);
    });

    // A credential in a tool argument lands in the transcript and in the agent's
    // logs. The registry says which keys those are; this does not guess.
    it('refuses a secret with a handoff, and applies NOTHING else', async () => {
        const out = await serve()({
            addons: ['adobe-commerce-aco'],
            env: { 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_SECRET: 'fake-test-pw-not-a-secret' } },
        });

        expect(out.needsUser).toMatchObject({ reason: 'secret-entry' });
        expect(out.needsUser.tellUser).toMatch(/nothing else in this call was applied/i);
        // Half-applying a payload that contains a secret is the trap.
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('never echoes the secret value back', async () => {
        const out = await serve()({
            env: { 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_SECRET: 'fake-test-pw-not-a-secret' } },
        });
        expect(JSON.stringify(out)).not.toContain('fake-test-pw-not-a-secret');
    });

    it('allows non-secret env vars through', async () => {
        const out = await serve()({
            env: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://x.test/graphql' } },
        });
        expect(out.applied.env).toEqual({ 'adobe-commerce-accs': ['ACCS_GRAPHQL_ENDPOINT'] });
    });

    // Values are not echoed — a config payload would otherwise appear twice.
    it('reports env KEYS, not values', async () => {
        const out = await serve()({
            env: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://secret-host.test/graphql' } },
        });
        expect(JSON.stringify(out)).not.toContain('secret-host');
    });
});

describe('configure_project — store scope moves as a triple', () => {
    it('writes all three codes to the backend component', async () => {
        const out = await serve()({
            storeScope: { website: 'base', store: 'main', storeView: 'default' },
        });

        const saved = saveProject.mock.calls[0][0] as Project;
        expect(saved.componentConfigs?.['adobe-commerce-accs']).toMatchObject({
            ACCS_WEBSITE_CODE: 'base',
            ACCS_STORE_CODE: 'main',
            ACCS_STORE_VIEW_CODE: 'default',
        });
        expect(out.applied.storeScope).toEqual({ website: 'base', store: 'main', storeView: 'default' });
    });

    // The SCHEMA is what enforces this, not the handler — so assert the schema.
    // The fake server above bypasses zod, which is exactly why a handler-side
    // assertion here would prove nothing about what a real caller can send.
    it('the schema REQUIRES all three codes together', () => {
        const scope = schema().shape.storeScope;

        expect(() => scope.parse({ website: 'base', store: 'main', storeView: 'default' })).not.toThrow();
        expect(() => scope.parse({ website: 'base' })).toThrow();
        expect(() => scope.parse({ website: 'base', store: 'main' })).toThrow();
    });

    // The rejection in the handler can only fire if the schema does not strip
    // unknown keys first. A raw shape DOES strip them (zod's default), which
    // would silently discard a misspelled field while applying the rest —
    // exactly what the guard exists to prevent. Probed live: a typo came back as
    // "Nothing to apply" rather than naming the key.
    it('the schema is STRICT — unknown keys error, they are not stripped', () => {
        const result = schema().safeParse({ addons: ['a'], stroeScope: { website: 'b' } });

        expect(result.success).toBe(false);
        expect(result.error?.message).toMatch(/stroeScope/);
    });

    it('refuses when the project has no backend selected', async () => {
        getCurrentProject.mockResolvedValue({
            ...freshProject(),
            componentSelections: {},
        } as unknown as Project);

        const out = await serve()({ storeScope: { website: 'b', store: 's', storeView: 'v' } });
        expect(out.error).toMatch(/no backend component selected/);
        expect(saveProject).not.toHaveBeenCalled();
    });

    it('merges into existing component config rather than replacing it', async () => {
        getCurrentProject.mockResolvedValue({
            ...freshProject(),
            componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://keep.test' } },
        } as unknown as Project);

        await serve()({ storeScope: { website: 'b', store: 's', storeView: 'v' } });

        const saved = saveProject.mock.calls[0][0] as Project;
        expect(saved.componentConfigs?.['adobe-commerce-accs']?.ACCS_GRAPHQL_ENDPOINT).toBe(
            'https://keep.test',
        );
    });
});

describe('configure_project — the result', () => {
    it('returns the applied diff and what is still unset', async () => {
        const out = await serve()({ addons: ['adobe-commerce-aco'] });

        expect(out.applied).toEqual({ addons: ['adobe-commerce-aco'] });
        // Never a bare success — the agent's next question is what remains.
        expect(out.stillUnset).toEqual(expect.arrayContaining(['datapack', 'blockLibraries', 'storeScope']));
    });

    it('drops a field out of stillUnset once it is set', async () => {
        const out = await serve()({ datapack: { name: 'citisignal', version: '1.0' } });
        expect(out.stillUnset).not.toContain('datapack');
    });

});

// The mesh declares its own env dependencies (`eds-accs-mesh` → the GraphQL
// endpoint plus the three scope codes). Changing one of those without marking
// the mesh would leave get_project_status reporting a mesh that no longer
// matches its configuration.
describe('configure_project — mesh staleness', () => {
    it('marks the mesh stale when a var it depends on changes', async () => {
        const out = await serve()({
            storeScope: { website: 'base', store: 'main', storeView: 'default' },
        });

        expect(out.meshMarkedStale).toEqual(['ACCS_STORE_CODE', 'ACCS_STORE_VIEW_CODE', 'ACCS_WEBSITE_CODE']);
        expect((saveProject.mock.calls[0][0] as Project).meshStatusSummary).toBe('stale');
    });

    it('writes the SAME value the dashboard writes, so both surfaces agree', async () => {
        await serve()({ env: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://new.test' } } });
        // deriveMeshStatus maps 'stale' -> 'config-changed' for dashboard and tool alike.
        expect((saveProject.mock.calls[0][0] as Project).meshStatusSummary).toBe('stale');
    });

    // Rewriting a key with the value it already had is not a change.
    it('does NOT mark stale when the value is unchanged', async () => {
        getCurrentProject.mockResolvedValue({
            ...freshProject(),
            componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://same.test' } },
        } as unknown as Project);

        const out = await serve()({
            env: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://same.test' } },
        });

        expect(out.meshMarkedStale).toBeUndefined();
        expect((saveProject.mock.calls[0][0] as Project).meshStatusSummary).toBe('deployed');
    });

    it('ignores env vars the mesh does not depend on', async () => {
        const out = await serve()({
            env: { 'eds-storefront': { AEM_ASSETS_ENABLED: 'true' } },
        });

        expect(out.meshMarkedStale).toBeUndefined();
        expect((saveProject.mock.calls[0][0] as Project).meshStatusSummary).toBe('deployed');
    });

    it('does nothing for a project with no mesh', async () => {
        getCurrentProject.mockResolvedValue({
            ...freshProject(),
            componentInstances: {},
        } as unknown as Project);

        const out = await serve()({
            storeScope: { website: 'b', store: 's', storeView: 'v' },
        });
        expect(out.meshMarkedStale).toBeUndefined();
    });

    it('a non-connection change never touches the mesh', async () => {
        const out = await serve()({ datapack: { name: 'd', version: '1' } });
        expect(out.meshMarkedStale).toBeUndefined();
        expect(out.note).toBeUndefined();
    });
    it('persists exactly once per call', async () => {
        await serve()({ addons: ['a'], blockLibraries: ['b'] });
        expect(saveProject).toHaveBeenCalledTimes(1);
    });
});
