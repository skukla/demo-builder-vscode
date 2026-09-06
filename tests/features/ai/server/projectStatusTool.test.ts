/**
 * get_project_status — the read that verifies every action tool.
 *
 * Two things these tests exist to hold: the tool must never prompt (it has no UI
 * to prompt in), and it must report the same mesh the dashboard does.
 */

import { registerProjectStatusTool } from '@/features/ai/server/projectStatusTool';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { expectWithinCeiling } from './responseCeilings';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const isAuthenticated = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: () => ({ isAuthenticated }) },
}));

const detectFrontendChanges = jest.fn();
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    detectFrontendChanges: (...a: unknown[]) => detectFrontendChanges(...a),
}));

function fakeServer() {
    const tools = new Map<string, () => Promise<{ content: Array<{ text: string }> }>>();
    const defs = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: () => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
            defs.set(name, def);
        },
        definition: (): McpToolSchema => defs.get('get_project_status')!,
        raw: async (): Promise<string> =>
            (await tools.get('get_project_status')!()).content[0].text,
        call: async (): Promise<Record<string, unknown>> =>
            JSON.parse((await tools.get('get_project_status')!()).content[0].text),
    };
}

const getCurrentProject = jest.fn();
const stateManager = createMockStateManager({ getCurrentProject });

function serve() {
    const s = fakeServer();
    registerProjectStatusTool(s, stateManager);
    return s;
}

/**
 * Shapes copied from a real project's `.demo-builder.json`, not invented.
 *
 * The first draft of this file guessed `components: [...]` and `frontendPort`,
 * and three tests failed against the real accessors: `componentInstances` is a
 * RECORD keyed by component id, the port lives on the instance whose `type` is
 * `frontend`, and the mesh is found by `subType` — on a `dependency`-typed
 * instance, not a mesh-typed one.
 */
const FRONTEND = { id: 'eds-storefront', type: 'frontend', status: 'ready', port: 3000 };
const MESH = { id: 'eds-accs-mesh', type: 'dependency', subType: 'mesh', status: 'deployed' };

const RUNNING = {
    name: 'alpha',
    path: '/p/alpha',
    status: 'running',
    componentInstances: { 'eds-storefront': FRONTEND },
};

/** The same project, with a mesh installed. */
const WITH_MESH = {
    ...RUNNING,
    componentInstances: { 'eds-storefront': FRONTEND, 'eds-accs-mesh': MESH },
};

beforeEach(() => {
    jest.clearAllMocks();
    isAuthenticated.mockResolvedValue(true);
    detectFrontendChanges.mockReturnValue(false);
});

describe('get_project_status', () => {
    it('reports the running state and port — what start_demo could not confirm', async () => {
        getCurrentProject.mockResolvedValue(RUNNING);
        const out = await serve().call();

        expect(out.name).toBe('alpha');
        expect(out.status).toBe('running');
        expect(out.port).toBe(3000);
    });

    it('says so plainly when there is no current project', async () => {
        getCurrentProject.mockResolvedValue(null);
        expect(await serve().raw()).toMatch(/^Error: no current project/);
    });

    it('omits mesh entirely for a project that has none', async () => {
        getCurrentProject.mockResolvedValue(RUNNING);
        const out = await serve().call();

        // Absent, not "not-deployed" — the dashboard payload distinguishes them
        // and a project without a mesh has no mesh status to report.
        expect(out.mesh).toBeUndefined();
    });

    // The tool has no surface to show a sign-in prompt on. `needs-auth` is the
    // honest answer; a dialog an agent cannot see is a hang.
    it('never prompts — it asks silently and reports needs-auth', async () => {
        isAuthenticated.mockResolvedValue(false);
        getCurrentProject.mockResolvedValue(WITH_MESH);

        expect((await serve().call()).mesh).toMatchObject({ status: 'needs-auth' });
        expect(isAuthenticated).toHaveBeenCalled();
    });

    // Reading the project's files is not free, and the answer is meaningless
    // while stopped — the dashboard guards it the same way.
    it('skips the staleness scan unless the demo is running', async () => {
        getCurrentProject.mockResolvedValue({ ...RUNNING, status: 'ready' });
        const out = await serve().call();

        expect(detectFrontendChanges).not.toHaveBeenCalled();
        expect(out.frontendConfigChanged).toBe(false);
    });

    it('runs the staleness scan while running, and reports it', async () => {
        detectFrontendChanges.mockReturnValue(true);
        getCurrentProject.mockResolvedValue(RUNNING);

        expect((await serve().call()).frontendConfigChanged).toBe(true);
        expect(detectFrontendChanges).toHaveBeenCalledTimes(1);
    });

    // The declaration, not the answer. Registration is a set of arguments the
    // server acts on — the consent prompt, the auth gate and the write-arg guard
    // all read them — and a test that only calls the handler never sees any of
    // it. `readOnlyHint: true` with `destructiveHint: false` is what keeps this
    // tool out of the confirmation path an agent cannot answer.
    it('registers itself as a read that needs no auth and destroys nothing', () => {
        const def = serve().definition();

        expect(def.needsAuth).toBe(false);
        expect(def.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
        expect(def.inputSchema).toStrictEqual({});
    });

    // The ServiceLocator may not be built yet — this is the read an agent uses
    // to find its feet, so the honest answer is `needs-auth`, not a throw.
    it('reports needs-auth when the auth service itself blows up', async () => {
        isAuthenticated.mockRejectedValue(new Error('ServiceLocator not initialized'));
        getCurrentProject.mockResolvedValue(WITH_MESH);

        expect((await serve().call()).mesh).toMatchObject({ status: 'needs-auth' });
    });

    it('stays within its recorded ceiling', async () => {
        getCurrentProject.mockResolvedValue({
            ...WITH_MESH,
            edsStorefrontStatusSummary: 'published',
            adobe: { organization: 'Org Name', projectName: 'Proj' },
        });
        expectWithinCeiling('get_project_status', await serve().raw());
    });
});
