/**
 * get_current_project tests — resolves the persisted current-project pointer
 * via stateManager.getCurrentProject, returning { name, path } or null. No
 * inputs, no confirm gate (read-only).
 */

import { registerCurrentProjectTool } from '@/features/ai/server/currentProjectTool';
import type { HandlerContext } from '@/types/handlers';
import { expectWithinCeiling } from './responseCeilings';

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('get_current_project')!(args)).content[0].text);
        },
    };
}

const getCurrentProject = jest.fn();
const ctxFactory = () =>
    ({
        stateManager: { getCurrentProject },
        context: {},
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() },
    }) as unknown as HandlerContext;

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

        expect(res).toEqual({ currentProject: null });
    });

    it('registers under the get_current_project name', () => {
        const registered: string[] = [];
        const s = {
            registerTool(name: string) {
                registered.push(name);
            },
        };
        registerCurrentProjectTool(s as any, ctxFactory);
        expect(registered).toEqual(['get_current_project']);
    });
});

// ─── response-size ceiling (phase 2 audit) ───────────────────────────────────
describe('response-size ceiling', () => {
    it('get_current_project stays tiny — it returns a name and a path', async () => {
        const s = fakeServer();
        registerCurrentProjectTool(s, ctxFactory);
        expectWithinCeiling('get_current_project', JSON.stringify(await s.call('get_current_project')));
    });
});
