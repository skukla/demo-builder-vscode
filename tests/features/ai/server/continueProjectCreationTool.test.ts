/**
 * continue_project_creation — the agent's answer to a creation paused on a failed
 * step (F307). Driven through the real pause: an agent's run is a real `untilDone`,
 * started as `create_project` starts one (`untilAgentHearsBack`), and the tool hands
 * the answer to it.
 */

import {
    registerContinueProjectCreationTool,
    untilAgentHearsBack,
} from '@/features/ai/server/continueProjectCreationTool';
import { asText } from '@/features/ai/server/mcpToolResult';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { untilDone } from '@/features/project-creation/handlers/creationPause';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { expectWithinCeiling } from './responseCeilings';

type ToolHandler = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

function serve() {
    let handler: ToolHandler | undefined;
    let declared: McpToolSchema | undefined;
    registerContinueProjectCreationTool({
        registerTool: (_name: string, def: McpToolSchema, h: never) => {
            declared = def;
            handler = h;
        },
    });
    return {
        declaration: () => declared!,
        raw: async (args: unknown) => (await handler!(args)).content[0].text,
        call: async (args: unknown) => JSON.parse((await handler!(args)).content[0].text),
    };
}

/** Start an agent's creation whose one step fails once, as create_project does. */
function startPausingCreation() {
    const context = createMockHandlerContext();
    let failed = false;
    const ended = untilDone(
        {
            context,
            reporter: { pause: () => undefined },
            projectName: 'agent-demo',
            step: 'Writing settings files',
        },
        async () => {
            if (failed) return undefined;
            failed = true;
            return { reason: 'The settings files could not be written.' };
        },
    ).then(() => asText({ created: true, name: 'agent-demo' }));
    return untilAgentHearsBack(context, 'agent-demo', ended);
}

beforeEach(() => {
    jest.useRealTimers();
});

describe('continue_project_creation', () => {
    it('create_project answers paused with the step, why and the answers, and the tool finishes it', async () => {
        const tool = serve();

        const paused = JSON.parse((await startPausingCreation()).content[0].text);
        expect(paused).toStrictEqual({
            created: false,
            paused: true,
            name: 'agent-demo',
            step: 'Writing settings files',
            reason: 'The settings files could not be written.',
            answers: ['Check Again', 'Skip This Step'],
            hint: expect.stringContaining('continue_project_creation'),
        });

        const raw = await tool.raw({ projectName: 'agent-demo', answer: 'Check Again' });
        expect(JSON.parse(raw)).toStrictEqual({ created: true, name: 'agent-demo' });
        expectWithinCeiling('continue_project_creation', raw);
    });

    it('refuses when no creation of that project is waiting', async () => {
        await expect(serve().call({ projectName: 'nobody', answer: 'Retry' })).resolves.toStrictEqual({
            error: 'No creation of nobody is waiting for an answer.',
        });
    });

    it('asks for the project name', async () => {
        await expect(serve().call({ answer: 'Retry' })).resolves.toStrictEqual({
            error: 'projectName is required.',
        });
    });

    it('declares a write that needs no sign-in', () => {
        expect(serve().declaration()).toMatchObject({
            needsAuth: false,
            annotations: { readOnlyHint: false },
        });
    });
});
