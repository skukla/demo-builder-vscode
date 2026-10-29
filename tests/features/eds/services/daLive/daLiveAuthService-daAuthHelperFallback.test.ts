/**
 * DA.live auth — da-auth-helper fallback.
 *
 * When SecretStorage has no valid token, DaLiveAuthService adopts a still-valid
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
import { fakeJwt } from '../../../../helpers/jwtFake';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { DA_LIVE_TOKEN_SECRET_KEY } from '@/features/eds/services/daLive/daLiveTokenMigration';

const FROM_HELPER = fakeJwt({ note: 'from-helper' });
const FROM_STORAGE = fakeJwt({ note: 'from-storage' });
const FROM_EXTENSION = fakeJwt({ note: 'from-extension' });

const readMock = readDaAuthHelperToken as jest.Mock;
const writeMock = writeDaAuthHelperToken as jest.Mock;

function makeService(
    initial: Record<string, unknown> = {},
    initialSecrets: Record<string, string> = {},
) {
    const { globalState, store } = createStatefulGlobalState(initial);
    const { secrets, store: keychain } = createMockSecretStorage(initialSecrets);
    const context = createMockExtensionContext({ globalState, secrets });
    return { service: new DaLiveAuthService(context), store, keychain, secrets };
}

describe('DaLiveAuthService — da-auth-helper fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        readMock.mockReturnValue(null);
    });

    it('adopts a valid cached token when nothing is stored, into SecretStorage', async () => {
        const expiresAt = Date.now() + 3600_000;
        readMock.mockReturnValue({ accessToken: FROM_HELPER, expiresAt, email: 'x@y.com' });
        const { service, store, keychain } = makeService();

        expect(await service.isAuthenticated()).toBe(true);
        expect(await service.getAccessToken()).toBe(FROM_HELPER);
        // Adopted into SecretStorage so the rest of the extension sees it — and
        // never into globalState, which is plain data on disk.
        expect(keychain.get(DA_LIVE_TOKEN_SECRET_KEY)).toBe(FROM_HELPER);
        expect(store.has('daLive.accessToken')).toBe(false);
        expect(store.get('daLive.tokenExpiration')).toBe(expiresAt);
    });

    it('ignores an expired cached token', async () => {
        readMock.mockReturnValue({ accessToken: fakeJwt({ note: 'old' }), expiresAt: Date.now() - 1000 });
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
            const boundary = fakeJwt({ note: 'boundary' });
            readMock.mockReturnValue({ accessToken: boundary, expiresAt: now + 5 * 60 * 1000 });
            const { service } = makeService();

            expect(await service.getAccessToken()).toBe(boundary);
        } finally {
            nowSpy.mockRestore();
        }
    });

    it('ignores a cached token that expires inside the buffer but has not expired yet', async () => {
        readMock.mockReturnValue({ accessToken: fakeJwt({ note: 'nearly' }), expiresAt: Date.now() + 60_000 });
        const { service } = makeService();

        expect(await service.getAccessToken()).toBeNull();
    });

    it('still adopts the token when the keychain refuses to store it', async () => {
        // Caching is best-effort — the token is usable for this call either way.
        const expiresAt = Date.now() + 3600_000;
        readMock.mockReturnValue({ accessToken: FROM_HELPER, expiresAt });
        const { service, secrets } = makeService();
        secrets.store.mockRejectedValue(new Error('keychain locked'));

        expect(await service.getAccessToken()).toBe(FROM_HELPER);
    });

    it('reports unauthenticated when there is no cached token', async () => {
        const { service } = makeService();
        expect(await service.isAuthenticated()).toBe(false);
    });

    it('prefers a valid stored token and never consults the cache', async () => {
        const expiresAt = Date.now() + 3600_000;
        const { service } = makeService(
            { 'daLive.tokenExpiration': expiresAt },
            { [DA_LIVE_TOKEN_SECRET_KEY]: FROM_STORAGE },
        );

        expect(await service.getAccessToken()).toBe(FROM_STORAGE);
        expect(readMock).not.toHaveBeenCalled();
    });

    it('mirrors a stored token back to the da-auth-helper cache (reverse bridge)', async () => {
        const { service } = makeService();
        const expiresAt = Date.now() + 3600_000;

        await service.storeToken(FROM_EXTENSION, { expiresAt, email: 'x@y.com' });

        expect(writeMock).toHaveBeenCalledWith({ accessToken: FROM_EXTENSION, expiresAt });
    });
});
