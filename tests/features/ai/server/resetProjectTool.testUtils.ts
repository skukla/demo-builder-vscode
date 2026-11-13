/**
 * What the reset_project suites share: the open project the tool reads, the headless context it
 * builds per call, and one call through the registered handler, its JSON answer parsed.
 *
 * No mocks live here. Each suite keeps its own mock wall, because a `jest.mock` hoists only above
 * the imports of the file it is written in; the spec's mocks are in place before this file loads
 * the tool.
 */

import { registerResetProjectTool } from '@/features/ai/server/resetProjectTool';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

type ToolHandler = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

/** The project the tool resets: whatever this answers. */
export const getCurrentProject = jest.fn();
/** The logger every call's context carries. */
export const logger = createMockLogger();

/** A headless HandlerContext for one call, as the server builds it. */
export const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject }),
        context: createMockExtensionContext(),
        logger,
    });

/** Call reset_project once with `args`, and parse what it answered. */
export async function callResetProject(args?: unknown): Promise<Record<string, unknown>> {
    const tools = new Map<string, ToolHandler>();
    registerResetProjectTool(
        {
            registerTool: (name: string, _def: unknown, handler: ToolHandler) =>
                tools.set(name, handler),
        },
        ctxFactory
    );
    return JSON.parse((await tools.get('reset_project')!(args)).content[0].text);
}
