/**
 * Shared setup for the configure_project suites: the handler context the tool is
 * handed, and the tool served from a stub server so a suite can call it.
 *
 * The tool stages a settings change through the Configure screen's own staging
 * (PL-76), which reads `.env` files and writes them back. Both are faked here:
 * the reads find no file (so the settings are the manifest's), and regenerating
 * the `.env` files is a recorded call.
 *
 * IMPORT THIS BEFORE the tool: `jest.mock` hoists within this module only, so the
 * fakes must be registered before the tool's module binds `fs` and the regenerator.
 */

import { registerConfigureProjectTool } from '@/features/ai/server/configureProjectTool';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

export const mockRegenerateProjectEnvFiles = jest.fn();
jest.mock('@/features/project-creation/helpers/envFileRegeneration', () => ({
    regenerateProjectEnvFiles: (...args: unknown[]) => mockRegenerateProjectEnvFiles(...args),
}));
jest.mock('fs/promises', () => ({
    readFile: jest.fn(async () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    }),
}));

export const getCurrentProject = jest.fn();
export const saveProject = jest.fn();
export const stateManager = createMockStateManager({ getCurrentProject, saveProject });

/** The context the tool is built with: this suite's state manager, no secret store. */
export function toolContext(): HandlerContext {
    return createMockHandlerContext({ stateManager });
}

export { registerConfigureProjectTool };

/** The tool's handler, answering the parsed JSON of its response. */
export function serve() {
    const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    registerConfigureProjectTool(
        { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
        toolContext,
    );
    return async (args: unknown) =>
        JSON.parse((await tools.get('configure_project')!(args)).content[0].text);
}
