/**
 * get_current_project and set_current_project — which project an agent connection works
 * on, and choosing one without moving the person's current project (AI-15).
 */

import { registerCurrentProjectTool } from '@/features/ai/server/currentProjectTool';
import type { AgentWorkingProject } from '@/types/handlers';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { expectWithinCeiling } from './responseCeilings';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    // The DEFINITION is kept, not discarded: it carries the declarations the MCP
    // server reads to decide whether a call needs auth and whether it may write.
    const definitions = new Map<string, McpToolSchema>();
    return {
        definitions,
        registerTool(
            name: string,
            def: McpToolSchema,
            handler: (args: any) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
            definitions.set(name, def);
        },
        async call(args?: unknown, tool = 'get_current_project'): Promise<any> {
            return JSON.parse((await tools.get(tool)!(args)).content[0].text);
        },
    };
}

const getCurrentProject = jest.fn();
const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject }),
        context: createMockExtensionContext(),
        logger: createMockLogger(),
    });

/** A connection's context, sharing one working project across calls as extension.ts does. */
function connection(working: AgentWorkingProject, stateManager = createMockStateManager({ getCurrentProject })) {
    return () =>
        createMockHandlerContext({
            stateManager,
            context: createMockExtensionContext(),
            logger: createMockLogger(),
            agentWorkingProject: working,
        });
}

describe('get_current_project', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('answers with the project STATE, not just a name and a path', async () => {
        // The whole point of the tool, and it used to be the opposite. It
        // returned `{name, path}` in ~22 tokens, and `agent-gap-scan` measured
        // 83% of its calls followed immediately by another of our reads — it
        // said WHERE the agent was and nothing it could act on. Answering with
        // the status payload (a strict superset, 24 more tokens) is what removes
        // that second round trip, so a bare name+path here is a REGRESSION.
        getCurrentProject.mockResolvedValue({
            name: 'alpha',
            path: '/p/alpha',
            status: 'ready',
            extra: 'ignored',
        });
        const s = fakeServer();
        registerCurrentProjectTool(s, ctxFactory);

        const res = (await s.call({})) as { currentProject: Record<string, unknown> };

        expect(res.currentProject).toMatchObject({ name: 'alpha', path: '/p/alpha' });
        expect(Object.keys(res.currentProject).length).toBeGreaterThan(2);
        expect(getCurrentProject).toHaveBeenCalledTimes(1);
    });

    it('still answers when the auth service is not initialized', async () => {
        // This is now the most-called read on the surface and the one an agent
        // uses to find its feet, so it must not throw. Sharing the status payload
        // pulled in `ServiceLocator.getAuthenticationService()`, which throws
        // before activation completes — exactly when orientation matters most.
        getCurrentProject.mockResolvedValue({ name: 'alpha', path: '/p/alpha', status: 'ready' });
        const s = fakeServer();
        registerCurrentProjectTool(s, ctxFactory);

        await expect(s.call({})).resolves.toBeDefined();
    });

    it('returns currentProject:null when no project is selected', async () => {
        getCurrentProject.mockResolvedValue(undefined);
        const s = fakeServer();
        registerCurrentProjectTool(s, ctxFactory);

        const res = await s.call({});

        expect(res).toEqual({ currentProject: null, scope: 'dashboard-pointer' });
    });

    it('says the project came from the SESSION DIRECTORY when the connection is scoped', async () => {
        // The other half of the scope field, and the one that matters: an agent
        // must be able to tell "the project I am standing in" from "whatever the
        // dashboard points at". Nothing else in the response distinguishes them.
        getCurrentProject.mockResolvedValue({ name: 'alpha', path: '/p/alpha', status: 'ready' });
        const s = fakeServer();
        registerCurrentProjectTool(s, connection({ path: '/p/alpha' }), '/p/alpha');

        expect((await s.call({})).scope).toBe('session-directory');
    });

    it('declares no sign-in and no writes, so orienting never gates on auth or consent', () => {
        // Three declarations the SERVER reads and the handler never sees, so
        // nothing in the response can show them being wrong. `needsAuth: false`
        // is what lets an agent find its feet before Adobe sign-in; the two
        // annotations are what keep this call outside the write-consent gate and
        // inside a dry run.
        const s = fakeServer();
        registerCurrentProjectTool(s, ctxFactory);

        expect(s.definitions.get('get_current_project')).toMatchObject({
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
        });
    });

    it('registers under the get_current_project name', () => {
        const registered: string[] = [];
        const s = {
            registerTool(name: string) {
                registered.push(name);
            },
        };
        registerCurrentProjectTool(s, ctxFactory);
        expect(registered).toEqual(['get_current_project', 'set_current_project']);
    });
});

// AI-15: an agent picking a project used to run the projects list's "open project", which
// made it the PERSON's current project and opened its dashboard on their screen.
describe('set_current_project', () => {
    const ALPHA = { name: 'alpha', path: '/p/alpha', status: 'ready' };

    function server(working: AgentWorkingProject) {
        const stateManager = createMockStateManager({
            getCurrentProject,
            getAllProjects: jest.fn().mockResolvedValue([{ name: 'alpha', path: '/p/alpha', lastModified: new Date() }]),
            loadProjectFromPath: jest.fn().mockResolvedValue(ALPHA),
        });
        const s = fakeServer();
        registerCurrentProjectTool(s, connection(working, stateManager));
        return { s, stateManager };
    }

    it("points this agent at the project and leaves the person's current project alone", async () => {
        const working: AgentWorkingProject = {};
        const { s, stateManager } = server(working);

        const res = await s.call({ projectPath: '/p/alpha' }, 'set_current_project');

        expect(res).toEqual({ currentProject: { name: 'alpha', path: '/p/alpha' }, scope: 'agent-chosen' });
        expectWithinCeiling('set_current_project', JSON.stringify(res));
        expect(working.path).toBe('/p/alpha');
        expect(stateManager.loadProjectFromPath).toHaveBeenCalledWith('/p/alpha', undefined, { persistAfterLoad: false });
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('then answers get_current_project as the project the agent chose', async () => {
        getCurrentProject.mockResolvedValue(ALPHA);
        const { s } = server({});

        await s.call({ projectPath: '/p/alpha' }, 'set_current_project');

        expect((await s.call({})).scope).toBe('agent-chosen');
    });

    // The path comes from an agent: only a project the projects list shows is accepted.
    it('refuses a path that is not a project', async () => {
        const working: AgentWorkingProject = {};
        const { s, stateManager } = server(working);

        const res = await s.call({ projectPath: '/etc' }, 'set_current_project');

        expect(res.error).toMatch(/No project at \/etc/);
        expect(working.path).toBeUndefined();
        expect(stateManager.loadProjectFromPath).not.toHaveBeenCalled();
    });
});

// ─── response-size ceiling (phase 2 audit) ───────────────────────────────────
describe('response-size ceiling', () => {
    it('get_current_project stays tiny — it returns a name and a path', async () => {
        const s = fakeServer();
        registerCurrentProjectTool(s, ctxFactory);
        expectWithinCeiling(
            'get_current_project',
            JSON.stringify(await s.call('get_current_project'))
        );
    });
});
