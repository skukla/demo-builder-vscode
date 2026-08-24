/**
 * Auth tools tests — get_auth_status (no side effects) and sign_in (confirm-gated
 * interactive login). EDS service accessors are mocked so no network/secrets are
 * touched; Adobe goes through a stub authManager.
 */

const mockSetStatusBarMessage = jest.fn();
jest.mock(
    'vscode',
    () => ({
        window: { setStatusBarMessage: (...a: unknown[]) => mockSetStatusBarMessage(...a) },
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

import { registerAuthTools } from '@/features/ai/server/authTools';
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

function fakeServer() {
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(
            name: string,
            _def: unknown,
            handler: (args: any) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
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

const login = jest.fn(async () => true);
function makeCtxFactory(adobeAuthed = true): () => HandlerContext {
    return () =>
        ({
            authManager: {
                getTokenStatus: jest.fn(async () => ({
                    isAuthenticated: adobeAuthed,
                    expiresInMinutes: 120,
                })),
                login,
            },
            context: {},
        }) as unknown as HandlerContext;
}

describe('registerAuthTools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        clearAdobeTarget();
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
            login: 'octocat',
            orgs: ['acme', 'skukla'],
        });
        expect(status.dalive).toEqual({ authenticated: false });
        expect(login).not.toHaveBeenCalled();
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
    });
});
