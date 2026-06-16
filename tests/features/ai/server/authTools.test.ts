/**
 * Auth tools tests — get_auth_status (no side effects) and sign_in (confirm-gated
 * interactive login). EDS service accessors are mocked so no network/secrets are
 * touched; Adobe goes through a stub authManager.
 */

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => ({
        tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
    })),
    getDaLiveAuthService: jest.fn(() => ({ isAuthenticated: jest.fn(async () => false) })),
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
import { clearAdobeTarget, getAdobeTarget, setAdobeTarget } from '@/features/ai/server/adobeTargetStore';
import { getGitHubServices, showDaLiveAuthQuickPick } from '@/features/eds/handlers/edsHelpers';
import type { HandlerContext } from '@/types/handlers';

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
         
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
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
                getTokenStatus: jest.fn(async () => ({ isAuthenticated: adobeAuthed, expiresInMinutes: 120 })),
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
        expect(status.github).toEqual({ authenticated: true });
        expect(status.dalive).toEqual({ authenticated: false });
        expect(login).not.toHaveBeenCalled();
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

    it('sign_in dalive with confirm runs the native quick-pick (not the webview handler)', async () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const res = await server.call('sign_in', { provider: 'dalive', confirm: true });

        // Routes to the native showInputBox flow, which works without a webview —
        // the headless agent context drops sendMessage, so 'open-dalive-login' can't.
        expect(showDaLiveAuthQuickPick).toHaveBeenCalledTimes(1);
        expect(res).toEqual({ provider: 'dalive', success: true, cancelled: false, note: expect.any(String) });
    });

    it('sign_in dalive reports cancellation when the user dismisses the flow', async () => {
        (showDaLiveAuthQuickPick as jest.Mock).mockResolvedValueOnce({ success: false, cancelled: true });
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const res = await server.call('sign_in', { provider: 'dalive', confirm: true });
        expect(res.success).toBe(false);
        expect(res.cancelled).toBe(true);
    });
});
