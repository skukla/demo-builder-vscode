/**
 * DA.live auth — da-auth-helper fallback.
 *
 * When globalState has no valid token, DaLiveAuthService adopts a still-valid
 * token from the da-auth-helper cache (~/.aem/da-token.json) so a sign-in the
 * agent did via the `da-auth` skill is recognized by the extension. The cache
 * reader is mocked here; its own parsing is covered by daAuthHelperToken.test.
 */


jest.mock('@/features/eds/services/daAuthHelperToken', () => ({
    readDaAuthHelperToken: jest.fn(() => null),
    writeDaAuthHelperToken: jest.fn(() => true),
}));

import { DaLiveAuthService } from '@/features/eds/services/daLive/daLiveAuthService';
import {
    readDaAuthHelperToken,
    writeDaAuthHelperToken,
} from '@/features/eds/services/daAuthHelperToken';
import { createMockExtensionContext, createStatefulGlobalState } from '../../../../helpers/extensionContextFake';

const readMock = readDaAuthHelperToken as jest.Mock;
const writeMock = writeDaAuthHelperToken as jest.Mock;

function makeService(initial: Record<string, unknown> = {}) {
    const { globalState, store } = createStatefulGlobalState(initial);
    const context = createMockExtensionContext({ globalState });
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

    // The cached token gets the SAME 5-minute buffer as a state token, and the
    // buffer is `now + 5 * 60 * 1000`. Both halves are pinned here: a token
    // expiring exactly on the boundary is adopted, and one expiring a minute
    // from now — well inside the buffer, but not yet expired — is not.
    it('adopts a cached token whose expiry sits exactly on the 5-minute buffer', async () => {
        const now = 1_700_000_000_000;
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
        try {
            readMock.mockReturnValue({ accessToken: 'eyJ.boundary', expiresAt: now + 5 * 60 * 1000 });
            const { service } = makeService();

            expect(await service.getAccessToken()).toBe('eyJ.boundary');
        } finally {
            nowSpy.mockRestore();
        }
    });

    it('ignores a cached token that expires inside the buffer but has not expired yet', async () => {
        readMock.mockReturnValue({ accessToken: 'eyJ.nearly', expiresAt: Date.now() + 60_000 });
        const { service } = makeService();

        expect(await service.getAccessToken()).toBeNull();
    });

    it('still adopts the token when caching it into globalState fails', async () => {
        // Caching is best-effort — the token is usable for this call either way.
        const expiresAt = Date.now() + 3600_000;
        readMock.mockReturnValue({ accessToken: 'eyJ.from-helper', expiresAt });
        const { globalState } = createStatefulGlobalState();
        jest.spyOn(globalState, 'update').mockRejectedValue(new Error('state write failed'));
        const service = new DaLiveAuthService(createMockExtensionContext({ globalState }));

        expect(await service.getAccessToken()).toBe('eyJ.from-helper');
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
