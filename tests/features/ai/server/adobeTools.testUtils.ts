/**
 * Shared harness for the `adobeTools` suite family.
 *
 * Extracted when the family split three ways (behaviour, registration schemas,
 * guards). The server stub KEEPS the schema it is handed — `McpToolSchema` is
 * what `tools/list` shows an agent and what the dry run gates on, so a stub that
 * throws it away leaves registration checked by nothing (see `mcpToolServer.ts`).
 */

import type { McpToolSchema, McpToolServer } from '@/features/ai/server/mcpToolServer';
import type { HandlerContext } from '@/types/handlers';

 
type ToolHandler = (args?: any) => Promise<{ content: Array<{ text: string }> }>;

export interface FakeServer extends McpToolServer {
    /** The schema block `registerTool` was handed for `name`. */
    definitionOf(name: string): McpToolSchema;
    /** Every registered tool name, in registration order. */
    names(): string[];
     
    call(name: string, args?: unknown): Promise<any>;
}

export function fakeServer(): FakeServer {
    const tools = new Map<string, ToolHandler>();
    const defs = new Map<string, McpToolSchema>();
    return {
        registerTool(name: string, def: McpToolSchema, handler: ToolHandler) {
            tools.set(name, handler);
            defs.set(name, def);
        },
        definitionOf: (name: string) => defs.get(name)!,
        names: () => [...tools.keys()],
        async call(name: string, args?: unknown) {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

/**
 * A token the REAL `decodeImsUserId` accepts — header.payload.signature with a
 * base64url payload carrying `user_id`. Built rather than mocked so the
 * ownership path under test is the production one.
 */
export function tokenFor(userId: string): string {
    const payload = Buffer.from(JSON.stringify({ user_id: userId }), 'utf8').toString('base64url');
    return `hdr.${payload}.sig`;
}

/** Auth stub whose token names `userId`; omit for the no-token (fail-closed) case. */
export function withToken(userId?: string) {
    return {
        getTokenManager: () => ({
            inspectToken: async () => ({
                valid: Boolean(userId),
                expiresIn: 3600,
                token: userId ? tokenFor(userId) : undefined,
            }),
        }),
    };
}

export function makeAuth(overrides: Record<string, unknown> = {}) {
    return {
        isAuthenticated: jest.fn(async () => true),
        getOrganizations: jest.fn(async () => [
            { id: 'org-1', code: 'C1@AdobeOrg', name: 'Org One' },
            { id: 'org-2', code: 'C2@AdobeOrg', name: 'Org Two' },
        ]),
        getProjects: jest.fn(async () => [
            { id: 'proj-1', name: 'Proj One', title: 'P1', who_created: 'ABC123@AdobeID.e' },
        ]),
        getWorkspaces: jest.fn(async () => [{ id: 'ws-1', name: 'Stage' }]),
        getCurrentOrganization: jest.fn(async () => ({ id: 'org-1', name: 'Org One' })),
        getCurrentProject: jest.fn(async () => ({ id: 'proj-1', name: 'Proj One' })),
        ...overrides,
    };
}

export function ctxFactoryWith(auth: unknown): () => HandlerContext {
    return () => ({ authManager: auth }) as unknown as HandlerContext;
}
