/**
 * DA.live auth — da-auth-helper fallback.
 *
 * When globalState has no valid token, DaLiveAuthService adopts a still-valid
 * token from the da-auth-helper cache (~/.aem/da-token.json) so a sign-in the
 * agent did via the `da-auth` skill is recognized by the extension. The cache
 * reader is mocked here; its own parsing is covered by daAuthHelperToken.test.
 */

jest.mock('vscode', () => ({
    env: { openExternal: jest.fn().mockResolvedValue(true) },
    Uri: { parse: jest.fn((s: string) => s) },
}));

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

jest.mock('@/features/eds/services/daAuthHelperToken', () => ({
    readDaAuthHelperToken: jest.fn(() => null),
    writeDaAuthHelperToken: jest.fn(() => true),
}));

import { DaLiveAuthService } from '@/features/eds/services/daLiveAuthService';
import { readDaAuthHelperToken, writeDaAuthHelperToken } from '@/features/eds/services/daAuthHelperToken';
import type { ExtensionContext } from 'vscode';

const readMock = readDaAuthHelperToken as jest.Mock;
const writeMock = writeDaAuthHelperToken as jest.Mock;

function makeService(initial: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(initial));
    const context = {
        globalState: {
            get: jest.fn((key: string) => store.get(key)),
            update: jest.fn((key: string, value: unknown) => {
                if (value === undefined) store.delete(key);
                else store.set(key, value);
                return Promise.resolve();
            }),
        },
    } as unknown as ExtensionContext;
    return { service: new DaLiveAuthService(context), store };
}

describe('DaLiveAuthService — da-auth-helper fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        readMock.mockReturnValue(null);
    });

    it('adopts a valid cached token when globalState is empty', async () => {
        const expiresAt = Date.now() + 3600_000;
        readMock.mockReturnValue({ accessToken: 'eyJ.from-helper', expiresAt, email: 'x@y.com' });
        const { service, store } = makeService();

        expect(await service.isAuthenticated()).toBe(true);
        expect(await service.getAccessToken()).toBe('eyJ.from-helper');
        // Hydrated into globalState so the rest of the extension sees it.
        expect(store.get('daLive.accessToken')).toBe('eyJ.from-helper');
        expect(store.get('daLive.tokenExpiration')).toBe(expiresAt);
    });

    it('ignores an expired cached token', async () => {
        readMock.mockReturnValue({ accessToken: 'eyJ.old', expiresAt: Date.now() - 1000 });
        const { service } = makeService();

        expect(await service.isAuthenticated()).toBe(false);
        expect(await service.getAccessToken()).toBeNull();
    });

    it('reports unauthenticated when there is no cached token', async () => {
        const { service } = makeService();
        expect(await service.isAuthenticated()).toBe(false);
    });

    it('prefers a valid globalState token and never consults the cache', async () => {
        const expiresAt = Date.now() + 3600_000;
        const { service } = makeService({
            'daLive.accessToken': 'eyJ.from-state',
            'daLive.tokenExpiration': expiresAt,
        });

        expect(await service.getAccessToken()).toBe('eyJ.from-state');
        expect(readMock).not.toHaveBeenCalled();
    });

    it('mirrors a stored token back to the da-auth-helper cache (reverse bridge)', async () => {
        const { service } = makeService();
        const expiresAt = Date.now() + 3600_000;

        await service.storeToken('eyJ.from-extension', { expiresAt, email: 'x@y.com' });

        expect(writeMock).toHaveBeenCalledWith({ accessToken: 'eyJ.from-extension', expiresAt });
    });
});
