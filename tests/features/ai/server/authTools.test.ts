/**
 * Auth tools tests — get_auth_status (no side effects) and sign_in (confirm-gated
 * interactive login). EDS service accessors are mocked so no network/secrets are
 * touched; Adobe goes through a stub authManager.
 */

const mockSetStatusBarMessage = jest.fn();
// Default: no silently-readable VS Code GitHub session (tests override per case).
const mockGetSession = jest.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
jest.mock(
    'vscode',
    () => ({
        window: { setStatusBarMessage: (...a: unknown[]) => mockSetStatusBarMessage(...a) },
        authentication: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    }),
    { virtual: true }
);

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    // Shapes taken from the services, not invented: validateToken returns
    // `{valid, user?}` with a `login` (`types.ts:23-38`), and getUserOrgs returns
    // a plain string[] of org logins (`githubTokenService.ts:151-165`).
    getGitHubServices: jest.fn(() => ({
        tokenService: {
            validateToken: jest.fn(async () => ({ valid: true, user: { login: 'octocat' } })),
            getUserOrgs: jest.fn(async () => ['acme', 'skukla']),
        },
    })),
    getDaLiveAuthService: jest.fn(() => ({
        isAuthenticated: jest.fn(async () => false),
        getOrgName: jest.fn(() => undefined),
    })),
    // Native DA.live sign-in flow (browser → token input → org). The agent
    // routes here instead of the webview-only 'open-dalive-login' handler.
    showDaLiveAuthQuickPick: jest.fn(async () => ({ success: true })),
}));

jest.mock('@/features/eds/handlers/edsHandlers', () => ({
    edsHandlers: {
        'github-oauth': jest.fn(async () => ({ success: true })),
    },
}));

import { z } from 'zod';
import { registerAuthTools } from '@/features/ai/server/authTools';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';
import { GITHUB_SCOPES } from '@/features/eds/services/types';
import {
    clearAdobeTarget,
    getAdobeTarget,
    setAdobeTarget,
} from '@/features/ai/server/adobeTargetStore';
import {
    getDaLiveAuthService,
    getGitHubServices,
    showDaLiveAuthQuickPick,
} from '@/features/eds/handlers/edsHelpers';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    // KEPT, not discarded. The schema block is where two shipped defects lived
    // (see mcpToolServer.ts), and a stub that drops its second argument makes
    // every declaration on it — readOnlyHint, needsAuth, the input shape —
    // checked by nothing.
    const schemas = new Map<string, McpToolSchema>();
    return {
        registerTool(
            name: string,
            def: McpToolSchema,
            handler: (args: any) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
            schemas.set(name, def);
        },

        schema(name: string): McpToolSchema {
            return schemas.get(name)!;
        },

        async call(name: string, args?: unknown): Promise<any> {
            const result = await tools.get(name)!(args);
            return JSON.parse(result.content[0].text);
        },
        rawText(name: string, args?: unknown) {
            return tools.get(name)!(args);
        },
        tools,
    };
}

/**
 * Let the DELIBERATELY un-awaited DA.live continuation run.
 *
 * `sign_in` answers before the native flow finishes, so its `.then` is still
 * queued when the tool's promise resolves. Without this the completion branch
 * is unreachable from a test — the assertion would run before the callback.
 */
async function settleDetachedFlow(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

const login = jest.fn(async () => true);
function makeCtxFactory(adobeAuthed = true): () => HandlerContext {
    return () =>
        createMockHandlerContext({
            authManager: createMockAuthenticationService({
                getTokenStatus: jest.fn(async () => ({
                    isAuthenticated: adobeAuthed,
                    expiresInMinutes: 120,
                })),
                login,
            }),
            context: createMockExtensionContext(),
        });
}

describe('registerAuthTools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearAdobeTarget();
    });

    // WHAT EACH TOOL DECLARES ABOUT ITSELF. `readOnlyHint` is what the dry run
    // gates on and what reaches a client in tools/list, and `needsAuth: false`
    // is why these two are callable when nothing is signed in — which is the
    // whole point of an auth tool. None of it was read by anything.
    it('declares get_auth_status as read-only and callable unauthenticated', () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const schema = server.schema('get_auth_status');
        expect(schema.needsAuth).toBe(false);
        expect(schema.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
    });

    it('declares sign_in as NOT read-only — it writes credentials and opens a window', () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const schema = server.schema('sign_in');
        expect(schema.needsAuth).toBe(false);
        expect(schema.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    });

    it("declares sign_in's providers and its confirm flag", () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const shape = server.schema('sign_in').inputSchema as Record<string, z.ZodTypeAny>;
        // The enum IS the contract: a provider missing from it is a sign-in the
        // agent cannot ask for, and the tool has no other route to one.
        expect((shape.provider as z.ZodEnum<[string, ...string[]]>).options).toEqual([
            'adobe',
            'github',
            'dalive',
        ]);
        expect(shape.confirm.safeParse(undefined).success).toBe(true);
        expect(shape.confirm.safeParse('yes').success).toBe(false);
    });

    it('get_auth_status takes no arguments', () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        expect(server.schema('get_auth_status').inputSchema).toEqual({});
    });

    it('get_auth_status reports adobe/github/dalive without side effects', async () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const status = await server.call('get_auth_status');
        expect(status.adobe).toEqual({ authenticated: true, expiresInMinutes: 120 });
        // orgs are the namespaces a repo can be created in — nothing else on the
        // agent surface exposes them.
        expect(status.github).toEqual({
            authenticated: true,
            via: 'stored-token',
            login: 'octocat',
            orgs: ['acme', 'skukla'],
        });
        expect(status.dalive).toEqual({ authenticated: false });
        expect(login).not.toHaveBeenCalled();
    });

    // GitHub auth is MANAGED BY VS CODE: no stored token does not mean signed
    // out. The status must fall back to a silent session read (no prompt, no
    // adoption) and say where the credential lives — an agent misread a bare
    // `authenticated: false` as "signed out" twice (2026-08-28).
    it('falls back to the VS Code GitHub session when no token is stored', async () => {
        const storeToken = jest.fn();
        (getGitHubServices as jest.Mock).mockImplementationOnce(() => ({
            tokenService: {
                validateToken: jest.fn(async () => ({ valid: false })),
                getUserOrgs: jest.fn(async () => []),
                storeToken,
            },
        }));
        mockGetSession.mockResolvedValueOnce({
            account: { label: 'octocat' },
            accessToken: 'fake-test-pw-not-a-secret',
        });
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const status = await server.call('get_auth_status');
        expect(status.github).toEqual({
            authenticated: true,
            via: 'vscode-session',
            login: 'octocat',
        });
        // Silent read only — never adopts, never prompts. The SCOPES are asserted
        // rather than `expect.any(Array)`: an empty scope list reads as a valid
        // session request and comes back with a session that cannot create a repo.
        expect(mockGetSession).toHaveBeenCalledWith('github', [...GITHUB_SCOPES], {
            createIfNone: false,
            silent: true,
        });
        expect(storeToken).not.toHaveBeenCalled();
    });

    it('explains that false may not mean signed out when neither source has a session', async () => {
        (getGitHubServices as jest.Mock).mockImplementationOnce(() => ({
            tokenService: {
                validateToken: jest.fn(async () => ({ valid: false })),
                getUserOrgs: jest.fn(async () => []),
            },
        }));
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const status = await server.call('get_auth_status');
        expect(status.github.authenticated).toBe(false);
        expect(status.github.note).toMatch(/managed by VS Code/);
    });

    it('treats a failing VS Code session read as no session, not as an error', async () => {
        // The account system can throw (no provider registered in a remote or
        // headless host). That is "no session", not a GitHub outage — reporting
        // it through safeStatus would drop the note that explains the false.
        (getGitHubServices as jest.Mock).mockImplementationOnce(() => ({
            tokenService: {
                validateToken: jest.fn(async () => ({ valid: false })),
                getUserOrgs: jest.fn(async () => []),
            },
        }));
        mockGetSession.mockRejectedValueOnce(new Error('no github provider'));
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const { github } = await server.call('get_auth_status');
        expect(github.authenticated).toBe(false);
        expect(github.error).toBeUndefined();
        expect(github.note).toMatch(/managed by VS Code/);
    });

    // The tool must NOT do what handleCheckGitHubAuth does: on finding a VS Code
    // session that handler calls storeToken (`edsGitHubHandlers.ts:79-83`).
    // A get_* tool that persists a credential is the defect this design avoids.
    it('get_auth_status stores no token', async () => {
        const storeToken = jest.fn();
        (getGitHubServices as jest.Mock).mockImplementationOnce(() => ({
            tokenService: {
                validateToken: jest.fn(async () => ({ valid: true, user: { login: 'octocat' } })),
                getUserOrgs: jest.fn(async () => []),
                storeToken,
            },
        }));
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        await server.call('get_auth_status');
        expect(storeToken).not.toHaveBeenCalled();
    });

    it('reports the pinned DA.live namespace when one is set', async () => {
        (getDaLiveAuthService as jest.Mock).mockImplementationOnce(() => ({
            isAuthenticated: jest.fn(async () => true),
            getOrgName: jest.fn(() => 'skukla'),
        }));
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        // Every DA.live write targets this; "authenticated: true" without it
        // tells an agent to proceed while withholding what the write needs.
        expect((await server.call('get_auth_status')).dalive).toEqual({
            authenticated: true,
            orgName: 'skukla',
        });
    });

    it('omits orgName rather than reporting an empty one', async () => {
        expect(
            (
                await (() => {
                    const server = fakeServer();
                    registerAuthTools(server, makeCtxFactory(true));
                    return server.call('get_auth_status');
                })()
            ).dalive
        ).toEqual({ authenticated: false });
    });

    // Orgs are enrichment. Folding their failure into the outer safeStatus would
    // report authenticated:false for a valid token whose org lookup broke —
    // a wrong answer to the question actually asked.
    it('stays authenticated when only the orgs lookup fails', async () => {
        (getGitHubServices as jest.Mock).mockImplementationOnce(() => ({
            tokenService: {
                validateToken: jest.fn(async () => ({ valid: true, user: { login: 'octocat' } })),
                getUserOrgs: jest.fn(async () => {
                    throw new Error('missing read:org scope');
                }),
            },
        }));
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const { github } = await server.call('get_auth_status');
        expect(github.authenticated).toBe(true);
        expect(github.login).toBe('octocat');
        expect(github.orgs).toBeUndefined();
        expect(github.error).toBeUndefined();
    });

    it('get_auth_status degrades gracefully when a provider check throws', async () => {
        (getGitHubServices as jest.Mock).mockImplementationOnce(() => {
            throw new Error('no secrets');
        });
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const status = await server.call('get_auth_status');
        expect(status.github.authenticated).toBe(false);
        expect(status.github.error).toMatch(/no secrets/);
    });

    // A valid token whose /user response carried no `user` block. The optional
    // chain is the difference between "signed in, name unknown" and the whole
    // provider reporting itself unauthenticated through safeStatus.
    it('reports a valid token with no user block as authenticated, name unknown', async () => {
        (getGitHubServices as jest.Mock).mockImplementationOnce(() => ({
            tokenService: {
                validateToken: jest.fn(async () => ({ valid: true })),
                getUserOrgs: jest.fn(async () => ['acme']),
            },
        }));
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(true));

        const { github } = await server.call('get_auth_status');
        expect(github).toEqual({ authenticated: true, via: 'stored-token', orgs: ['acme'] });
    });

    // The one status that is not a lookup failure: there is no auth service at
    // all. It must say so, because "authenticated: false" with a stack-trace
    // error reads to an agent as an expired session worth a sign_in.
    it('names a missing Adobe auth service instead of reporting a lookup failure', async () => {
        const server = fakeServer();
        registerAuthTools(server, () =>
            createMockHandlerContext({
                authManager: undefined,
                context: createMockExtensionContext(),
            })
        );

        const status = await server.call('get_auth_status');
        expect(status.adobe).toEqual({
            authenticated: false,
            error: 'auth service unavailable',
        });
    });

    it('sign_in adobe answers success:false when there is no auth service', async () => {
        const server = fakeServer();
        registerAuthTools(server, () =>
            createMockHandlerContext({
                authManager: undefined,
                context: createMockExtensionContext(),
            })
        );

        const res = await server.call('sign_in', { provider: 'adobe', confirm: true });
        expect(res).toEqual({ provider: 'adobe', success: false });
    });

    it('sign_in refuses a call with no arguments at all', async () => {
        // The SDK validates against the input schema before the handler runs,
        // but the confirm gate must not depend on that: an absent args object
        // is a refusal, never a crash the agent reads as a server fault.
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const result = await server.rawText('sign_in', undefined);
        expect(result.content[0].text).toMatch(/requires confirm:true/);
        expect(login).not.toHaveBeenCalled();
    });

    it('sign_in refuses without confirm:true (no browser opened)', async () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const result = await server.rawText('sign_in', { provider: 'adobe' });
        expect(result.content[0].text).toMatch(/requires confirm:true/);
        expect(login).not.toHaveBeenCalled();
    });

    it('sign_in adobe with confirm performs the interactive login', async () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const res = await server.call('sign_in', { provider: 'adobe', confirm: true });
        expect(login).toHaveBeenCalledTimes(1);
        expect(res).toEqual({ provider: 'adobe', success: true });
    });

    it('sign_in adobe clears the stored MCP target (drops the prior identity)', async () => {
        // A re-auth may be a switch to a different account, so the previous
        // identity's org/project/workspace selection must not survive it.
        setAdobeTarget({ orgId: 'org-old', projectId: 'proj-old', workspaceId: 'ws-old' });
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        await server.call('sign_in', { provider: 'adobe', confirm: true });

        expect(getAdobeTarget()).toBeUndefined();
    });

    it('sign_in github does NOT clear the Adobe target (unrelated provider)', async () => {
        setAdobeTarget({ orgId: 'org-keep' });
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        await server.call('sign_in', { provider: 'github', confirm: true });

        expect(getAdobeTarget()).toEqual({ orgId: 'org-keep' });
    });

    it('sign_in github with confirm dispatches the github-oauth handler', async () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const res = await server.call('sign_in', { provider: 'github', confirm: true });
        expect(res).toEqual({ provider: 'github', success: true });
    });

    // Traversability (backlog: mcp-destructive-ops-native-consent, gap 1):
    // the dalive branch used to AWAIT the whole native flow — the agent's
    // client saw only a 60s timeout while the user saw "nothing happens".
    // Now it starts the flow, raises attention, and returns instructions
    // immediately; the agent polls get_auth_status for completion.
    it('sign_in dalive starts the native flow and returns immediately with poll instructions', async () => {
        // A flow still in progress: the promise never settles within the test.
        (showDaLiveAuthQuickPick as jest.Mock).mockReturnValueOnce(new Promise(() => undefined));
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const res = await server.call('sign_in', { provider: 'dalive', confirm: true });

        // The native flow was STARTED (not the webview handler — the headless
        // agent context drops sendMessage, so 'open-dalive-login' can't work)…
        expect(showDaLiveAuthQuickPick).toHaveBeenCalledTimes(1);
        // …attention was raised in the window…
        expect(mockSetStatusBarMessage).toHaveBeenCalled();
        // …and the tool answered without waiting for the user.
        expect(res.provider).toBe('dalive');
        expect(res.started).toBe(true);
        expect(String(res.note)).toContain('get_auth_status');
    });

    it('sign_in dalive answers started even when the flow later reports cancellation', async () => {
        (showDaLiveAuthQuickPick as jest.Mock).mockResolvedValueOnce({
            success: false,
            cancelled: true,
        });
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const res = await server.call('sign_in', { provider: 'dalive', confirm: true });
        // The refusal/cancel outcome is no longer in the tool's answer — the
        // flow had not finished when the tool replied. get_auth_status is the
        // read that reports the eventual state.
        expect(res.started).toBe(true);
        expect(res.cancelled).toBeUndefined();
        // And nothing announces a completion that did not happen: the opening
        // message is the only one.
        await settleDetachedFlow();
        expect(mockSetStatusBarMessage).toHaveBeenCalledTimes(1);
    });

    // The outcome the agent never sees. Its client already has its answer, so
    // the window is the only place the finished sign-in can land.
    it('announces DA.live completion in the window after the tool has answered', async () => {
        (showDaLiveAuthQuickPick as jest.Mock).mockResolvedValueOnce({ success: true });
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        await server.call('sign_in', { provider: 'dalive', confirm: true });

        await settleDetachedFlow();
        expect(mockSetStatusBarMessage).toHaveBeenCalledTimes(2);
    });

    it('swallows a rejected DA.live flow rather than raising an unhandled rejection', async () => {
        (showDaLiveAuthQuickPick as jest.Mock).mockRejectedValueOnce(new Error('no clipboard'));
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const res = await server.call('sign_in', { provider: 'dalive', confirm: true });

        expect(res.started).toBe(true);
        await settleDetachedFlow();
        expect(mockSetStatusBarMessage).toHaveBeenCalledTimes(1);
    });
});
