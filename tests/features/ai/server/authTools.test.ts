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
}));

jest.mock('@/features/eds/handlers/edsHandlers', () => ({
    edsHandlers: {
        'github-oauth': jest.fn(async () => ({ success: true })),
        'open-dalive-login': jest.fn(async () => ({ success: true })),
    },
}));

import { registerAuthTools } from '@/features/ai/server/authTools';
import { getGitHubServices } from '@/features/eds/handlers/edsHelpers';
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
    beforeEach(() => jest.clearAllMocks());

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

    it('sign_in github with confirm dispatches the github-oauth handler', async () => {
        const server = fakeServer();
        registerAuthTools(server, makeCtxFactory(false));

        const res = await server.call('sign_in', { provider: 'github', confirm: true });
        expect(res).toEqual({ provider: 'github', success: true });
    });
});
