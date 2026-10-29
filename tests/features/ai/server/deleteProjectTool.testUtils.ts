/**
 * Shared harness for the `delete_project` suite family: the module wall, the fake server
 * that keeps the tool's schema, and the context the tool is built with.
 *
 * Extracted when the second suite arrived (`deleteProjectTool-pack.test.ts`, step 07's
 * `deletePack`). This file owns the SUBJECT import, so the `jest.mock` calls above it hoist
 * above it (webview-test-authoring §3): a spec that imported `registerDeleteProjectTool`
 * itself could bind the real collaborators.
 *
 * The three walls: the local deletion core, the cloud step (the real resolver decides; only
 * the step that would touch the cloud is held back, so what it is HANDED can be read), and the
 * library delete of the project's own pack.
 */

import * as vscode from 'vscode';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

jest.mock('@/features/projects-dashboard/services/projectFilesDeletion', () => ({
    deleteProjectFiles: jest.fn(),
}));
jest.mock('@/features/projects-dashboard/services/demoPackDeletion', () => ({
    deleteProjectDemoPack: jest.fn(),
}));
jest.mock('@/features/ai/server/agentProjectCleanup', () => ({
    ...jest.requireActual('@/features/ai/server/agentProjectCleanup'),
    cleanUpProjectCloud: jest.fn(),
}));

// Below the mocks on purpose — see the note above about hoisting.
import { registerDeleteProjectTool } from '@/features/ai/server/deleteProjectTool';

export { registerDeleteProjectTool };

const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;

/** Put the SC's `cleanupBehavior` setting where the resolver reads it. */
export function cleanupBehavior(value: string): void {
    getConfiguration.mockReturnValue({ get: () => value });
}

type ToolHandler = (args: any) => Promise<{ content: Array<{ text: string }> }>;

/**
 * The schema is KEPT, not discarded: `readOnlyHint`/`destructiveHint`, `needsAuth`
 * and the input shape are what a client reads before it decides whether this tool
 * may run unattended, and a stub that throws its second argument away can see none
 * of them (see mcpToolServer.ts's own note on that gap).
 */
export function fakeServer() {
    const tools = new Map<string, ToolHandler>();
    const schemas = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: ToolHandler) {
            tools.set(name, handler);
            schemas.set(name, def);
        },
        schema(): McpToolSchema {
            return schemas.get('delete_project')!;
        },
        async call(args?: unknown): Promise<any> {
            return JSON.parse((await tools.get('delete_project')!(args)).content[0].text);
        },
    };
}

export const getAllProjects = jest.fn();
export const loadProjectFromPath = jest.fn();

/** The context every call gets: the two state reads the tool makes, faked. */
export const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getAllProjects, loadProjectFromPath }),
        context: createMockExtensionContext(),
        logger: createMockLogger(),
    });
