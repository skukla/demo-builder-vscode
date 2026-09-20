/**
 * An agent's delete says what it is doing (PL-59 slice 7, plan row 5b).
 *
 * The tool ran three steps — take the storefront down, delete the repository,
 * remove the files — and reported none of them, so a delete that spends a minute
 * unpublishing pages announced itself once and went quiet. The phase channel is
 * what the agent's notification reads.
 */

import { z } from 'zod';
import { registerDeleteProjectTool } from '@/features/ai/server/deleteProjectTool';
import type { McpToolServer } from '@/features/ai/server/mcpToolServer';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockProject } from '../../../helpers/projectFake';
import type { HandlerContext } from '@/types/handlers';

const deleteProjectFiles = jest.fn();
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProjectFiles: (...args: unknown[]) => deleteProjectFiles(...args),
}));

const cleanUpProjectCloud = jest.fn();
jest.mock('@/features/ai/server/agentProjectCleanup', () => ({
    resolveCloudCleanup: () => ({ deleteGithubRepo: false, deleteDaLiveSite: false }),
    cleanUpProjectCloud: (...args: unknown[]) => cleanUpProjectCloud(...args),
}));

const PROJECT = createMockProject({ name: 'bodea' });

function ctxFactory(): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getAllProjects: jest.fn().mockResolvedValue([{ name: 'bodea', path: '/p/bodea' }]),
            loadProjectFromPath: jest.fn().mockResolvedValue(PROJECT),
        }),
    });
}

type ToolHandler = (args: unknown) => Promise<unknown>;

/** The registered tool, as the server would call it. */
function serve(): ToolHandler {
    let handler: ToolHandler | undefined;
    const server: McpToolServer = {
        registerTool(
            _name: string,
            _definition: { description: string; inputSchema: Record<string, z.ZodTypeAny> },
            fn: ToolHandler,
        ) {
            handler = fn;
        },
    } as McpToolServer;
    registerDeleteProjectTool(server, ctxFactory);
    if (!handler) throw new Error('delete_project was not registered');
    return handler;
}

beforeEach(() => {
    jest.clearAllMocks();
    cleanUpProjectCloud.mockResolvedValue({});
    deleteProjectFiles.mockResolvedValue(undefined);
});

it('names the step it runs, so an agent notification has something to show', async () => {
    const seen: string[] = [];

    await withPhaseSinks([(message) => seen.push(message)], () =>
        serve()({ name: 'bodea', confirm: true, confirmName: 'bodea' }) as Promise<void>,
    );

    expect(seen).toEqual(['Removing the project files']);
    expect(deleteProjectFiles).toHaveBeenCalled();
});
