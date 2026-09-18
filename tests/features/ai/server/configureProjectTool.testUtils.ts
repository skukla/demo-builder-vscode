/**
 * Shared setup for the configure_project suites: the state manager the tool is
 * handed, and the tool served from a stub server so a suite can call it.
 */

import { registerConfigureProjectTool } from '@/features/ai/server/configureProjectTool';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

export const getCurrentProject = jest.fn();
export const saveProject = jest.fn();
export const stateManager = createMockStateManager({ getCurrentProject, saveProject });

/** The tool's handler, answering the parsed JSON of its response. */
export function serve() {
    const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    registerConfigureProjectTool(
        { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
        stateManager,
    );
    return async (args: unknown) =>
        JSON.parse((await tools.get('configure_project')!(args)).content[0].text);
}
