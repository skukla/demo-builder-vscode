/**
 * Shared harness for the `eventProviderTools` suite family.
 *
 * THIS FILE OWNS THE MOCKS AND EVERY IMPORT THEY REPLACE. Specs import the
 * subject from HERE and declare no jest.mock of their own — jest.mock hoists
 * above the imports of the module it appears in, NOT across modules, so an
 * import left behind in a spec loads the real module before these mocks
 * register.
 *
 * The event-provider lifecycle service is replaced wholesale: a real call
 * would create or delete live Adobe I/O event entities.
 */

const mockLifecycle = {
    listEventEntities: jest.fn(),
    createEventProvider: jest.fn(),
    createEventRegistration: jest.fn(),
    deleteEventEntities: jest.fn(),
};

jest.mock('@/features/authentication/services/eventProviderLifecycle', () => ({
    listEventEntities: (...a: unknown[]) => mockLifecycle.listEventEntities(...a),
    createEventProvider: (...a: unknown[]) => mockLifecycle.createEventProvider(...a),
    createEventRegistration: (...a: unknown[]) => mockLifecycle.createEventRegistration(...a),
    deleteEventEntities: (...a: unknown[]) => mockLifecycle.deleteEventEntities(...a),
}));

jest.mock('@/features/authentication/handlers/deleteAdobeProjectHandler', () => ({
    createTeardownDeps: jest.fn(() => ({
        getAccessToken: jest.fn(),
        getWorkspaceS2SCredential: jest.fn(),
        createWorkspaceS2SCredentialFor: jest.fn(),
        subscribeManagementApi: jest.fn(),
    })),
}));

import { z } from 'zod';
import type { McpTextResult } from '@/features/ai/server/mcpToolResult';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { AdobeConfig } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

// Below the factories on purpose: they hoist above these, so the subject binds
// to the mocked modules.
export { registerEventProviderTools } from '@/features/ai/server/eventProviderTools';

export { mockLifecycle };

/** The handler shape `McpToolServer.registerTool` declares, minus its `any`s. */
type ToolHandler = (args?: unknown, extra?: unknown) => Promise<McpTextResult>;

/**
 * A stand-in MCP server that keeps BOTH halves of every registration.
 *
 * The definition is not decoration: `annotations.readOnlyHint` /
 * `destructiveHint` and `needsAuth` are what the real server consults to decide
 * whether a call needs consent, and `inputSchema` is the only validation an
 * agent's arguments ever get. A fake that discarded the definition — as this
 * suite's did until 2026-09-05 — leaves all three unasserted while every
 * handler test still passes.
 */
export function fakeServer() {
    const tools = new Map<string, ToolHandler>();
    const definitions = new Map<string, McpToolSchema>();
    const text = async (name: string, args?: unknown): Promise<string> =>
        (await tools.get(name)!(args)).content[0].text;
    return {
        registerTool(name: string, def: McpToolSchema, handler: ToolHandler) {
            tools.set(name, handler);
            definitions.set(name, def);
        },

        /** The tool's answer as the agent receives it — prose for refusals. */
        text,

        /** The tool's answer parsed, for the tools that answer with data. */
        async json(name: string, args?: unknown): Promise<Record<string, unknown>> {
            return JSON.parse(await text(name, args));
        },

        /** The definition a tool was registered with. */
        definition(name: string): McpToolSchema {
            return definitions.get(name)!;
        },

        names(): string[] {
            return [...definitions.keys()];
        },
    };
}

/** The zod object the SDK validates an agent's arguments against. */
export function inputObject(def: McpToolSchema): z.ZodObject<z.ZodRawShape> {
    const schema = def.inputSchema;
    if (!schema) throw new Error('This tool declares no inputSchema.');
    return schema instanceof z.ZodObject ? schema : z.object(schema);
}

/** The field names a tool declares — the input contract an agent reads. */
export function inputFields(def: McpToolSchema): string[] {
    return Object.keys(inputObject(def).shape);
}

/** The Console coordinates a project needs before any event tool will work. */
export const COMPLETE_ADOBE: AdobeConfig = {
    organization: 'org-1',
    projectId: 'proj-1',
    workspace: 'ws-1',
};

/** How the auth pre-flight should answer for a given context. */
export type AuthMode = 'signed-in' | 'signed-out' | 'throws' | 'no-manager';

/** An auth manager whose `isAuthenticated` answers the way the case needs. */
function authManagerFor(auth: AuthMode): AuthenticationService | undefined {
    if (auth === 'no-manager') return undefined;
    return createMockAuthenticationService({
        isAuthenticated: jest.fn(async () => {
            if (auth === 'throws') throw new Error('IMS unreachable');
            return auth === 'signed-in';
        }),
    });
}

/**
 * A context factory for the tools: a project (or none) plus an auth verdict.
 *
 * `adobe` is passed through as given — including `undefined`, which is a real
 * project shape (one that never completed Adobe setup) and the case the
 * `project?.adobe` guard exists for.
 */
export function eventToolsCtx(
    options: { adobe?: AdobeConfig; noProject?: boolean; auth?: AuthMode } = {}
): () => HandlerContext {
    const { adobe, noProject = false, auth = 'signed-in' } = options;
    const project = noProject ? undefined : createMockProject({ adobe });
    const ctx = createMockHandlerContext({ authManager: authManagerFor(auth) });
    // `jest.mocked` rather than a cast: getCurrentProject IS a mock on the
    // canonical fixture, and the compiler still checks what it is made to resolve.
    jest.mocked(ctx.stateManager.getCurrentProject).mockResolvedValue(project);
    return () => ctx;
}

/** The tools take an authentication service factory; nothing here calls it. */
export const authService = (): AuthenticationService => createMockAuthenticationService();
