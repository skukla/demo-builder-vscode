/**
 * Shared harness for the `delete_project` suite family: the module wall, the fake server
 * that keeps the tool's schema, and the context the tool is built with.
 *
 * Extracted when the second suite arrived (`deleteProjectTool-data.test.ts`, walk F96's
 * `removeData`, which replaced step 07's `deletePack`). This file owns the SUBJECT import, so the `jest.mock` calls above it hoist
 * above it (webview-test-authoring §3): a spec that imported `registerDeleteProjectTool`
 * itself could bind the real collaborators.
 *
 * The walls: the local deletion core and the removal of the project's datapack data from
 * Commerce. The button's delete (`runProjectDelete`, PL-104 fix 6) is the REAL one unless a
 * suite says otherwise: `mockRunProjectDelete` passes through to it, so a suite reads what it
 * was HANDED, and can stand in for it where the online steps would touch the cloud.
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
jest.mock('@/features/projects-dashboard/services/datapackDataRemoval', () => ({
    // Whether the project has datapack data to remove: none unless a suite says so.
    hasRemovableData: jest.fn().mockResolvedValue(false),
    removeDataBeforeDelete: jest.fn(),
}));
/** The button's delete, as the tool calls it; pass-through by default (`useRealDelete`). */
export const mockRunProjectDelete = jest.fn();
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    runProjectDelete: (...a: unknown[]) => mockRunProjectDelete(...a),
}));

type RunProjectDelete = typeof import('@/features/projects-dashboard/services/projectDeletionService').runProjectDelete;

/**
 * Point the delete at the real `runProjectDelete`. Call from each spec's `beforeEach`: the
 * config's `resetMocks` empties the pass-through before every test.
 */
export function useRealDelete(): void {
    const real = jest.requireActual<{ runProjectDelete: RunProjectDelete }>(
        '@/features/projects-dashboard/services/projectDeletionService',
    ).runProjectDelete;
    mockRunProjectDelete.mockImplementation(real);
}

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
