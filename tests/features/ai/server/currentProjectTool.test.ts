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

    it('returns the current project name + path when one is selected', async () => {
        getCurrentProject.mockResolvedValue({
            name: 'alpha',
            path: '/p/alpha',
            status: 'ready',
            extra: 'ignored',
        });
        const s = fakeServer();
        registerCurrentProjectTool(s, ctxFactory);

        const res = await s.call({});

        // Only name + path are surfaced.
        expect(res).toEqual({ currentProject: { name: 'alpha', path: '/p/alpha' } });
        expect(getCurrentProject).toHaveBeenCalledTimes(1);
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
