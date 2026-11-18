/**
 * cancel_project_creation — the agent's way to stop a running creation (PL-104 fix 14).
 *
 * Driven through the wizard's real handler map and the real creation run, so the
 * test holds what the tool is for: a creation started elsewhere (another context,
 * as each agent call and the wizard have) ends as cancelled. Creation's own phases
 * are the faked boundary.
 */

import { registerCancelProjectCreationTool } from '@/features/ai/server/cancelProjectCreationTool';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { runCreation } from '@/features/project-creation/handlers/creationRun';
import { executeProjectCreation } from '@/features/project-creation/handlers/executor';
import type { HandlerContext } from '@/types/handlers';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { expectWithinCeiling } from './responseCeilings';

jest.mock('@/features/project-creation/handlers/executor', () => ({
    executeProjectCreation: jest.fn(),
}));

type ToolHandler = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

function freshContext(): HandlerContext {
    return createMockHandlerContext({ sharedState: { isAuthenticating: false } });
}

function serve() {
    let handler: ToolHandler | undefined;
    let declared: McpToolSchema | undefined;
    registerCancelProjectCreationTool(
        {
            registerTool: (_name: string, def: McpToolSchema, h: never) => {
                declared = def;
                handler = h;
            },
        },
        freshContext
    );
    return {
        declaration: () => declared!,
        raw: async (args: unknown) => (await handler!(args)).content[0].text,
        call: async (args: unknown) => JSON.parse((await handler!(args)).content[0].text),
    };
}

describe('cancel_project_creation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('stops a running creation by its project name; the creation ends as cancelled', async () => {
        (executeProjectCreation as jest.Mock).mockReturnValue(new Promise<void>(() => undefined));
        const failure = runCreation(freshContext(), { projectName: 'agent-built' }).catch(
            (error: unknown) => error
        );

        const res = await serve().call({ projectName: 'agent-built', confirm: true });

        expect(res).toMatchObject({ stopped: true });
        expect(await failure).toMatchObject({ code: ErrorCode.CANCELLED });
    });

    it('says so when no creation of that name is running', async () => {
        const res = await serve().call({ projectName: 'nothing-running', confirm: true });

        expect(res.stopped).toBe(false);
        expect(res.message).toContain('nothing-running');
    });

    it('answers within its response ceiling', async () => {
        const raw = await serve().raw({ projectName: 'a-typical-demo-name', confirm: true });

        expectWithinCeiling('cancel_project_creation', raw);
    });

    it('refuses without confirm:true, stopping nothing', async () => {
        (executeProjectCreation as jest.Mock).mockReturnValue(new Promise<void>(() => undefined));
        const context = freshContext();
        void runCreation(context, { projectName: 'kept-running' }).catch(() => undefined);

        const res = await serve().call({ projectName: 'kept-running' });

        expect(res.error).toContain('confirm:true');
        expect(context.sharedState.projectCreationAbortController?.signal.aborted).toBe(false);
        context.sharedState.projectCreationAbortController?.abort();
    });

    it('declares itself a write, and is not read-only', () => {
        expect(serve().declaration().annotations).toEqual({
            readOnlyHint: false,
            destructiveHint: false,
        });
    });
});
