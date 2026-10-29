/**
 * Event-provider tools (AB-6) — the agent surface over `eventProviderLifecycle`.
 *
 * The service is replaced wholesale: a real call would read or delete live Adobe I/O
 * event entities. What these tests own is what the TOOL decides — which workspace it
 * targets (the open project's, never a selection left behind), which guards run first,
 * and that a delete is refused without consent. So the assertions are on the
 * ARGUMENTS the service receives, not on its answers.
 */

const mockList = jest.fn();
const mockDelete = jest.fn();
jest.mock('@/features/authentication/services/eventProviderLifecycle', () => ({
    listWorkspaceEventEntities: (...a: unknown[]) => mockList(...a),
    deleteWorkspaceEventProvider: (...a: unknown[]) => mockDelete(...a),
}));
const mockCreateTeardownDeps = jest.fn();
jest.mock('@/features/authentication/handlers/deleteAdobeProjectHandler', () => ({
    createTeardownDeps: (...a: unknown[]) => mockCreateTeardownDeps(...a),
}));
const mockOrgCheck = jest.fn();
jest.mock('@/features/authentication/services/detectProjectOrgMismatch', () => ({
    detectProjectOrgMismatch: (...a: unknown[]) => mockOrgCheck(...a),
}));

import { z } from 'zod';
import { registerEventProviderTools } from '@/features/ai/server/eventProviderTools';
import type { McpTextResult } from '@/features/ai/server/mcpToolResult';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import type { AdobeConfig } from '@/types/base';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

type ToolHandler = (args?: unknown) => Promise<McpTextResult>;

const ADOBE: AdobeConfig = { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-1' };
const TARGET = { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-1' };
const DEPS = { sentinel: 'teardown-deps' };

function serve(opts: { adobe?: AdobeConfig | null; authed?: boolean } = {}) {
    const tools = new Map<string, ToolHandler>();
    const defs = new Map<string, McpToolSchema>();
    const authManager = createMockAuthenticationService({
        isAuthenticated: jest.fn().mockResolvedValue(opts.authed ?? true),
    });
    const project =
        opts.adobe === null ? undefined : createMockProject({ adobe: opts.adobe ?? ADOBE });
    const ctx = createMockHandlerContext({ authManager });
    jest.mocked(ctx.stateManager.getCurrentProject).mockResolvedValue(project);
    registerEventProviderTools(
        {
            registerTool: (n: string, d: McpToolSchema, h: ToolHandler) => {
                tools.set(n, h);
                defs.set(n, d);
            },
        },
        () => ctx,
    );
    const text = async (name: string, args?: unknown) => (await tools.get(name)!(args)).content[0].text;
    return {
        authManager,
        project,
        text,
        json: async (name: string, args?: unknown) => JSON.parse(await text(name, args)),
        def: (name: string) => defs.get(name)!,
    };
}

const DELETE_ARGS = {
    providerId: 'prov-1',
    providerLabel: 'ERP events',
    registrationIds: ['reg-1'],
    confirm: true,
};

beforeEach(() => {
    jest.clearAllMocks();
    mockCreateTeardownDeps.mockReturnValue(DEPS);
    mockOrgCheck.mockResolvedValue({ reachable: true, expectedOrg: 'org-1' });
});

describe('what the tools declare', () => {
    it('registers exactly the list and the teardown — no create half', () => {
        const s = serve();
        expect(s.def('list_event_providers')).toBeDefined();
        expect(s.def('delete_event_provider')).toBeDefined();
    });

    it('declares the list a read and the delete destructive, both behind Adobe sign-in', () => {
        const s = serve();
        expect(s.def('list_event_providers').needsAuth).toEqual(['adobe']);
        expect(s.def('list_event_providers').annotations).toEqual({
            readOnlyHint: true,
            destructiveHint: false,
        });
        expect(s.def('delete_event_provider').needsAuth).toEqual(['adobe']);
        expect(s.def('delete_event_provider').annotations).toEqual({
            readOnlyHint: false,
            destructiveHint: true,
        });
    });

    it('rejects an unknown key on the delete rather than dropping it', () => {
        const schema = serve().def('delete_event_provider').inputSchema as z.ZodTypeAny;
        expect(schema.safeParse(DELETE_ARGS).success).toBe(true);
        expect(schema.safeParse({ ...DELETE_ARGS, providerLable: 'x' }).success).toBe(false);
        expect(schema.safeParse({ providerId: 'p', confirm: true }).success).toBe(false);
    });
});

describe('list_event_providers', () => {
    it("lists the OPEN PROJECT's workspace, through the teardown deps built on its auth manager", async () => {
        mockList.mockResolvedValue({ available: true, providers: [], registrations: [] });
        const s = serve();

        const out = await s.json('list_event_providers', {});

        expect(mockCreateTeardownDeps).toHaveBeenCalledWith(s.authManager);
        expect(mockList).toHaveBeenCalledWith(DEPS, TARGET);
        expect(out).toMatchObject({ available: true, providers: [], registrations: [] });
    });

    it('refuses a project with no Console workspace before touching Adobe', async () => {
        const s = serve({ adobe: { organization: 'org-1', projectId: 'proj-1' } });

        const out = await s.json('list_event_providers', {});

        expect(out.error).toMatch(/no Adobe Console workspace/i);
        expect(mockList).not.toHaveBeenCalled();
    });

    it('refuses with no open project', async () => {
        const out = await serve({ adobe: null }).json('list_event_providers', {});
        expect(out.error).toMatch(/no Adobe Console workspace/i);
        expect(mockList).not.toHaveBeenCalled();
    });

    it('hands off to sign-in when Adobe is signed out', async () => {
        const out = await serve({ authed: false }).json('list_event_providers', {});
        expect(out.needsAuth).toBe('adobe');
        expect(mockList).not.toHaveBeenCalled();
    });

    it("refuses when the token cannot reach the project's org, checked with the project", async () => {
        mockOrgCheck.mockResolvedValue({ reachable: false, expectedOrg: 'org-1' });
        const s = serve();

        const out = await s.json('list_event_providers', {});

        expect(mockOrgCheck).toHaveBeenCalledWith(s.authManager, s.project, expect.anything());
        expect(out.error).toMatch(/different Adobe organization/);
        expect(mockList).not.toHaveBeenCalled();
    });

    it('answers a service failure as an error, not a throw', async () => {
        mockList.mockRejectedValue(new Error('List providers failed (HTTP 500)'));
        const out = await serve().json('list_event_providers', {});
        expect(out.error).toBe('List providers failed (HTTP 500)');
    });
});

describe('delete_event_provider', () => {
    it('refuses without confirm:true and calls nothing', async () => {
        const s = serve();

        const text = await s.text('delete_event_provider', { ...DELETE_ARGS, confirm: undefined });

        expect(text).toBe('delete_event_provider requires confirm:true to proceed.');
        expect(mockDelete).not.toHaveBeenCalled();
        expect(mockCreateTeardownDeps).not.toHaveBeenCalled();
    });

    it("deletes in the OPEN PROJECT's workspace, passing exactly what was asked", async () => {
        mockDelete.mockResolvedValue({ refused: undefined, items: [] });
        const s = serve();

        await s.json('delete_event_provider', DELETE_ARGS);

        expect(mockDelete).toHaveBeenCalledWith(DEPS, TARGET, {
            providerId: 'prov-1',
            providerLabel: 'ERP events',
            registrationIds: ['reg-1'],
        });
    });

    it('defaults to no registrations when none are named', async () => {
        mockDelete.mockResolvedValue({ refused: undefined, items: [] });
        const { registrationIds: _omit, ...args } = DELETE_ARGS;

        await serve().json('delete_event_provider', args);

        expect(mockDelete.mock.calls[0][2].registrationIds).toStrictEqual([]);
    });

    it('reports a refusal as not deleted', async () => {
        mockDelete.mockResolvedValue({ refused: 'not ours', items: [] });
        const out = await serve().json('delete_event_provider', DELETE_ARGS);
        expect(out).toEqual({ deleted: false, error: 'not ours' });
    });

    it('reports deleted only when every item was deleted, with failures named', async () => {
        mockDelete.mockResolvedValue({
            refused: undefined,
            items: [
                { kind: 'registration', id: 'reg-1', outcome: 'failed', error: 'HTTP 500' },
                { kind: 'provider', id: 'prov-1', label: 'ERP events', outcome: 'deleted' },
            ],
        });

        const out = await serve().json('delete_event_provider', DELETE_ARGS);

        expect(out.deleted).toBe(false);
        expect(out.failed).toEqual([{ kind: 'registration', id: 'reg-1', error: 'HTTP 500' }]);
    });

    it('runs the same guards as the list — no workspace, no delete', async () => {
        const out = await serve({ adobe: { organization: 'org-1' } }).json(
            'delete_event_provider',
            DELETE_ARGS,
        );
        expect(out.error).toMatch(/no Adobe Console workspace/i);
        expect(mockDelete).not.toHaveBeenCalled();
    });
});
