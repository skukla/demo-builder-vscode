/**
 * open_project tests — confirm gating, project resolution, and the pending-prompt
 * stash + workspace anchor (the reload-and-resume bridge). openProjectAsWorkspace
 * is mocked so no window reload happens.
 */

jest.mock('@/commands/openInClaude', () => ({ PENDING_CLAUDE_LAUNCH_KEY: 'demoBuilder.ai.pendingClaudeLaunch' }));
jest.mock('@/features/project-creation/services/projectFinalizationService', () => ({
    openProjectAsWorkspace: jest.fn(async () => undefined),
}));

import { registerOpenProjectTool } from '@/features/ai/server/openProjectTool';
import { openProjectAsWorkspace } from '@/features/project-creation/services/projectFinalizationService';
import type { HandlerContext } from '@/types/handlers';

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
         
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
         
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('open_project')!(args)).content[0].text);
        },
    };
}

const globalStateUpdate = jest.fn(async () => undefined);
function ctxFactory(): HandlerContext {
    return {
        stateManager: {
            getAllProjects: jest.fn(async () => [{ name: 'my-proj', path: '/projects/my-proj' }]),
        },
        context: { globalState: { update: globalStateUpdate } },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    } as unknown as HandlerContext;
}

describe('open_project', () => {
    beforeEach(() => jest.clearAllMocks());

    it('requires confirm:true and does not anchor', async () => {
        const s = fakeServer();
        registerOpenProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'my-proj' });
        expect(res.message).toMatch(/requires confirm:true/);
        expect(openProjectAsWorkspace).not.toHaveBeenCalled();
    });

    it('errors on an unknown project with the valid names', async () => {
        const s = fakeServer();
        registerOpenProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'nope', confirm: true });
        expect(res.error).toMatch(/Unknown project/);
        expect(res.validProjects).toEqual(['my-proj']);
        expect(openProjectAsWorkspace).not.toHaveBeenCalled();
    });

    it('anchors the workspace and stashes the continuation prompt for resume', async () => {
        const s = fakeServer();
        registerOpenProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'my-proj', continuationPrompt: 'add a hero block', confirm: true });

        expect(globalStateUpdate).toHaveBeenCalledWith(
            'demoBuilder.ai.pendingClaudeLaunch',
            expect.objectContaining({ projectPath: '/projects/my-proj', prompt: 'add a hero block' }),
        );
        expect(openProjectAsWorkspace).toHaveBeenCalledWith('/projects/my-proj', expect.anything());
        expect(res).toMatchObject({ opening: 'my-proj', willReload: true, willResume: true });
    });

    it('anchors without stashing when no continuation prompt is given', async () => {
        const s = fakeServer();
        registerOpenProjectTool(s, ctxFactory);
        const res = await s.call({ name: 'my-proj', confirm: true });

        expect(globalStateUpdate).not.toHaveBeenCalled();
        expect(openProjectAsWorkspace).toHaveBeenCalledWith('/projects/my-proj', expect.anything());
        expect(res.willResume).toBe(false);
    });
});
