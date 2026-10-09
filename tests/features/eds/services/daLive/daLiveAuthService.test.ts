import {
    DaLiveAuthService,
    ExtensionContext,
} from './daLiveAuthService.testUtils';
import { createMockExtensionContext, createStatefulGlobalState } from '../../../../helpers/extensionContextFake';
import { fakeJwt } from '../../../../helpers/jwtFake';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import {
    DA_LIVE_TOKEN_SECRET_KEY,
    LEGACY_TOKEN_STATE_KEY,
} from '@/features/eds/services/daLive/daLiveTokenMigration';
/**
 * DA.live Auth Service Tests
 *
 * Tests for the DaLiveAuthService token storage functionality.
 * After cleanup, this service is a simple token storage wrapper
 * (PKCE OAuth flow has been removed as it was never functional).
 */

// Keep these unit tests off the real ~/.aem/da-token.json (the service now
// reads it as a fallback and mirrors stored tokens to it). The bridge itself
// is covered by daAuthHelperToken.test and daLiveAuthService-daAuthHelperFallback.test.
jest.mock('@/features/eds/services/daAuthHelperToken', () => ({
    readDaAuthHelperToken: jest.fn(() => null),
    writeDaAuthHelperToken: jest.fn(() => false),
}));

describe('DaLiveAuthService', () => {
    let service: DaLiveAuthService;
    let mockContext: ExtensionContext;
    let globalStateStore: Map<string, unknown>;
    let keychain: Map<string, string>;
    let secrets: ReturnType<typeof createMockSecretStorage>['secrets'];

    beforeEach(() => {
        jest.clearAllMocks();

        const stateful = createStatefulGlobalState();
        globalStateStore = stateful.store;
        const secretFake = createMockSecretStorage();
        keychain = secretFake.store;
        secrets = secretFake.secrets;
        mockContext = createMockExtensionContext({
            globalState: stateful.globalState,
            secrets,
        });

        service = new DaLiveAuthService(mockContext);
    });

    afterEach(() => {
        service.dispose();
    });

    // Helper to create test JWT tokens
    const createTestToken = (payload: object): string => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64');
        const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64');
        const signature = 'test-signature';
        return `${header}.${payloadBase64}.${signature}`;
    };

    describe('isServerAccepted', () => {
        // The locally-valid-but-server-refused gap (2026-08-16): expiry says
        // nothing about whether the DA.live admin plane will honour the token.
        // One HEAD against /list/{org}/ answers it. 401 = the CREDENTIAL was
        // refused; 403 = the ORG refused access to a credential it honoured;
        // network trouble is not evidence either way.
        const realFetch = global.fetch;

        beforeEach(() => {
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'live-token');
            globalStateStore.set('daLive.tokenExpiration', Date.now() + 60 * 60 * 1000);
        });

        afterEach(() => {
            global.fetch = realFetch;
        });

        it('sends one HEAD with the stored Bearer token to the org listing', async () => {
            global.fetch = jest.fn().mockResolvedValue({ status: 200 });

            await service.isServerAccepted('acme');

            expect(global.fetch).toHaveBeenCalledWith(
                'https://admin.da.live/list/acme/',
                expect.objectContaining({
                    method: 'HEAD',
                    headers: { Authorization: 'Bearer live-token' },
                })
            );
        });

        it('returns accepted on 200', async () => {
            global.fetch = jest.fn().mockResolvedValue({ status: 200 });
            expect(await service.isServerAccepted('acme')).toBe('accepted');
        });

        it('returns refused on 401 — the credential itself was rejected', async () => {
            global.fetch = jest.fn().mockResolvedValue({ status: 401 });
            expect(await service.isServerAccepted('acme')).toBe('refused');
        });

        it('returns accepted on 403 — the org refused a credential it honoured', async () => {
            global.fetch = jest.fn().mockResolvedValue({ status: 403 });
            expect(await service.isServerAccepted('acme')).toBe('accepted');
        });

        it('returns unknown on network failure (fail open, never block on a flaky probe)', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
            expect(await service.isServerAccepted('acme')).toBe('unknown');
        });

        it('returns refused when no token is stored — nothing to accept', async () => {
            keychain.clear();
            globalStateStore.clear();
            global.fetch = jest.fn();
            expect(await service.isServerAccepted('acme')).toBe('refused');
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe('isAuthenticated', () => {
        it('should return false when no token stored', async () => {
            // Given: Empty globalState (no token)

            // When: isAuthenticated() called
            const result = await service.isAuthenticated();

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false when token is expired', async () => {
            // Given: Token stored with expiration in the past
            const expiredTime = Date.now() - 60 * 60 * 1000; // 1 hour ago
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'expired-token');
            globalStateStore.set('daLive.tokenExpiration', expiredTime);

            // When: isAuthenticated() called
            const result = await service.isAuthenticated();

            // Then: Returns false
            expect(result).toBe(false);
        });

        it('should return false when token expires within 5 minutes', async () => {
            // Given: Token with expiration in 3 minutes (within 5-min buffer)
            const almostExpired = Date.now() + 3 * 60 * 1000;
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'almost-expired-token');
            globalStateStore.set('daLive.tokenExpiration', almostExpired);

            // When: isAuthenticated() called
            const result = await service.isAuthenticated();

            // Then: Returns false (considered expired due to 5-min buffer)
            expect(result).toBe(false);
        });

        it('should return true when valid token exists', async () => {
            // Given: Token stored with future expiration (more than 5 min)
            const validExpiration = Date.now() + 60 * 60 * 1000; // 1 hour from now
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'valid-token');
            globalStateStore.set('daLive.tokenExpiration', validExpiration);

            // When: isAuthenticated() called
            const result = await service.isAuthenticated();

            // Then: Returns true
            expect(result).toBe(true);
        });
    });

    describe('getStoredToken', () => {
        it('should return null when no token stored', async () => {
            // Given: Empty globalState

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null when token is missing expiration', async () => {
            // Given: Token stored without expiration
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'token-without-expiry');

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return null when token is expired', async () => {
            // Given: Token stored with past expiration
            const expiredTime = Date.now() - 60 * 1000; // 1 minute ago
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'expired-token');
            globalStateStore.set('daLive.tokenExpiration', expiredTime);

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns null
            expect(result).toBeNull();
        });

        it('should return token info when valid token exists', async () => {
            // Given: Token and expiration in globalState
            const validExpiration = Date.now() + 60 * 60 * 1000; // 1 hour from now
            const email = 'user@example.com';
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'valid-token');
            globalStateStore.set('daLive.tokenExpiration', validExpiration);
            globalStateStore.set('daLive.userEmail', email);

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns DaLiveTokenInfo object
            expect(result).not.toBeNull();
            expect(result?.accessToken).toBe('valid-token');
            expect(result?.expiresAt).toBe(validExpiration);
            expect(result?.email).toBe(email);
        });

        // The buffer is a `<` against `now + 5 minutes`, so a token expiring at
        // EXACTLY that instant is still usable. One character the other way and
        // every sign-in loses its last five minutes of life — invisible in any
        // test that picks a round hour.
        it('keeps a token whose expiry sits exactly on the 5-minute buffer', async () => {
            const now = 1_700_000_000_000;
            const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
            try {
                const boundary = now + 5 * 60 * 1000;
                keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'boundary-token');
                globalStateStore.set('daLive.tokenExpiration', boundary);

                const result = await service.getStoredToken();

                expect(result?.accessToken).toBe('boundary-token');
                expect(result?.expiresAt).toBe(boundary);
            } finally {
                nowSpy.mockRestore();
            }
        });

        it('should return token info without email if not stored', async () => {
            // Given: Token without email
            const validExpiration = Date.now() + 60 * 60 * 1000;
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'valid-token');
            globalStateStore.set('daLive.tokenExpiration', validExpiration);

            // When: getStoredToken() called
            const result = await service.getStoredToken();

            // Then: Returns token info without email
            expect(result).not.toBeNull();
            expect(result?.accessToken).toBe('valid-token');
            expect(result?.email).toBeUndefined();
        });
    });

    describe('getAccessToken', () => {
        it('should return null when no token stored', async () => {
            // Given: Empty globalState

            // When: getAccessToken() called
            const result = await service.getAccessToken();

            // Then: Returns null (no auth flow triggered)
            expect(result).toBeNull();
        });

        it('should return null when token is expired', async () => {
            // Given: Expired token in storage
            const expiredTime = Date.now() - 60 * 1000;
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'expired-token');
            globalStateStore.set('daLive.tokenExpiration', expiredTime);

            // When: getAccessToken() called
            const result = await service.getAccessToken();

            // Then: Returns null (expired tokens not returned)
            expect(result).toBeNull();
        });

        it('should return stored token when valid', async () => {
            // Given: Valid token in storage
            const validExpiration = Date.now() + 60 * 60 * 1000;
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'valid-access-token');
            globalStateStore.set('daLive.tokenExpiration', validExpiration);

            // When: getAccessToken() called
            const result = await service.getAccessToken();

            // Then: Returns the stored token
            expect(result).toBe('valid-access-token');
        });
    });

    // Work that needs a live DA.live session cannot hang off activation: measured
    // 2026-08-15, the stored token was already expired at startup and only
    // refreshed 54s later when the user began a reset, so the publish-key renewal
    // sweep found no session and skipped. This event is the reliable trigger.
    describe('onDidSignIn', () => {
        it('fires after a token is stored', async () => {
            const listener = jest.fn();
            service.onDidSignIn(listener);

            await service.storeToken(
                createTestToken({
                    sub: 'user123',
                    created_at: String(Date.now()),
                    expires_in: String(3600000),
                    email: 'test@example.com',
                })
            );

            expect(listener).toHaveBeenCalledTimes(1);
        });

        it('does not fire before any token is stored', () => {
            const listener = jest.fn();
            service.onDidSignIn(listener);

            expect(listener).not.toHaveBeenCalled();
        });

        it('fires only after the token is readable, not before', async () => {
            // A listener runs work that reads the session back. Firing earlier
            // would race the write it is supposed to signal.
            let tokenAtFireTime: string | undefined = 'not-checked';
            service.onDidSignIn(() => {
                tokenAtFireTime = keychain.get(DA_LIVE_TOKEN_SECRET_KEY);
            });
            const token = createTestToken({
                sub: 'user123',
                created_at: String(Date.now()),
                expires_in: String(3600000),
            });

            await service.storeToken(token);

            expect(tokenAtFireTime).toBe(token);
        });
    });

    // The token moved out of globalState (plain data on disk) into SecretStorage
    // (the OS keychain) on 2026-10-09. Expiry, email and org are not secrets and
    // stay where they were.
    describe('where the token lives', () => {
        const legacyToken = fakeJwt({ note: 'signed-in-before-the-move' });
        const inAnHour = () => Date.now() + 60 * 60 * 1000;

        it('stores a new token in SecretStorage and never in globalState', async () => {
            const token = fakeJwt({ note: 'fresh' });

            await service.storeToken(token, { expiresAt: inAnHour() });

            expect(keychain.get(DA_LIVE_TOKEN_SECRET_KEY)).toBe(token);
            expect(mockContext.globalState.update).not.toHaveBeenCalledWith(
                LEGACY_TOKEN_STATE_KEY,
                token
            );
            expect(globalStateStore.has(LEGACY_TOKEN_STATE_KEY)).toBe(false);
        });

        it('keeps an SC signed in across the upgrade: the first read moves the old token', async () => {
            globalStateStore.set(LEGACY_TOKEN_STATE_KEY, legacyToken);
            globalStateStore.set('daLive.tokenExpiration', inAnHour());

            expect(await service.getAccessToken()).toBe(legacyToken);
            expect(keychain.get(DA_LIVE_TOKEN_SECRET_KEY)).toBe(legacyToken);
            expect(globalStateStore.has(LEGACY_TOKEN_STATE_KEY)).toBe(false);
            expect(globalStateStore.has('daLive.tokenExpiration')).toBe(true);
        });

        it('stays signed in when the keychain refuses the move, and keeps the old copy', async () => {
            globalStateStore.set(LEGACY_TOKEN_STATE_KEY, legacyToken);
            globalStateStore.set('daLive.tokenExpiration', inAnHour());
            secrets.store.mockRejectedValue(new Error('keychain locked'));

            expect(await service.isAuthenticated()).toBe(true);
            expect(await service.getAccessToken()).toBe(legacyToken);
            expect(globalStateStore.get(LEGACY_TOKEN_STATE_KEY)).toBe(legacyToken);
        });

        it('exposes the move for activation, and running it twice is harmless', async () => {
            globalStateStore.set(LEGACY_TOKEN_STATE_KEY, legacyToken);

            await service.migrateLegacyToken();
            await service.migrateLegacyToken();

            expect(secrets.store).toHaveBeenCalledTimes(1);
            expect(keychain.get(DA_LIVE_TOKEN_SECRET_KEY)).toBe(legacyToken);
        });

        it('a new sign-in is not overwritten by an old token still waiting to move', async () => {
            globalStateStore.set(LEGACY_TOKEN_STATE_KEY, legacyToken);
            const fresh = fakeJwt({ note: 'fresh' });

            await service.storeToken(fresh, { expiresAt: inAnHour() });

            expect(await service.getAccessToken()).toBe(fresh);
            expect(globalStateStore.has(LEGACY_TOKEN_STATE_KEY)).toBe(false);
        });

        it('sign-out removes the token from SecretStorage AND any globalState copy', async () => {
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, fakeJwt({ note: 'current' }));
            const leftover = createStatefulGlobalState({ [LEGACY_TOKEN_STATE_KEY]: legacyToken });
            // A globalState copy that could not move (keychain refused it earlier).
            const refusing = createMockSecretStorage({
                [DA_LIVE_TOKEN_SECRET_KEY]: fakeJwt({ note: 'current' }),
            });
            refusing.secrets.store.mockRejectedValue(new Error('keychain locked'));
            const stuck = new DaLiveAuthService(
                createMockExtensionContext({
                    globalState: leftover.globalState,
                    secrets: refusing.secrets,
                })
            );

            await service.logout();
            await stuck.logout();
            stuck.dispose();

            expect(keychain.has(DA_LIVE_TOKEN_SECRET_KEY)).toBe(false);
            expect(refusing.store.has(DA_LIVE_TOKEN_SECRET_KEY)).toBe(false);
            expect(leftover.store.has(LEGACY_TOKEN_STATE_KEY)).toBe(false);
            expect(await stuck.getAccessToken()).toBeNull();
        });
    });

    describe('storeToken', () => {
        it('should persist token to SecretStorage', async () => {
            // Given: Valid JWT token string
            const token = createTestToken({
                sub: 'user123',
                created_at: String(Date.now()),
                expires_in: String(3600000), // 1 hour
                email: 'test@example.com',
            });

            // When: storeToken(token) called
            await service.storeToken(token);

            // Then: SecretStorage holds the token
            expect(secrets.store).toHaveBeenCalledWith(DA_LIVE_TOKEN_SECRET_KEY, token);
            expect(keychain.get(DA_LIVE_TOKEN_SECRET_KEY)).toBe(token);
        });

        it('should extract and store expiration from JWT payload', async () => {
            // Given: Token with created_at and expires_in
            const createdAt = Date.now();
            const expiresIn = 3600000;
            const token = createTestToken({
                created_at: String(createdAt),
                expires_in: String(expiresIn),
            });

            // When: storeToken called
            await service.storeToken(token);

            // Then: Expiration is calculated and stored
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.tokenExpiration',
                createdAt + expiresIn
            );
        });

        it('should extract and store email from JWT payload', async () => {
            // Given: Token with email claim
            const token = createTestToken({
                email: 'jwt-user@example.com',
            });

            // When: storeToken called
            await service.storeToken(token);

            // Then: Email is stored
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.userEmail',
                'jwt-user@example.com'
            );
        });

        it('should use pre-validated opts when provided', async () => {
            // Given: Token with opts containing expiresAt, email, orgName
            const token = createTestToken({ sub: 'user123' });
            const expiresAt = Date.now() + 3600000;

            // When: storeToken called with opts
            await service.storeToken(token, {
                expiresAt,
                email: 'opts@example.com',
                orgName: 'my-org',
            });

            // Then: opts values are stored directly
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.tokenExpiration',
                expiresAt
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.userEmail',
                'opts@example.com'
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith('daLive.orgName', 'my-org');
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.setupComplete',
                true
            );
        });

        it('should mark setupComplete on every storeToken call', async () => {
            // Given: Token without opts
            const token = createTestToken({ sub: 'user123' });

            // When: storeToken called
            await service.storeToken(token);

            // Then: setupComplete is set
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.setupComplete',
                true
            );
        });
    });

    describe('logout', () => {
        it('should clear all stored token data and orgName', async () => {
            // Given: Token stored in SecretStorage, the rest in globalState
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'token-to-clear');
            globalStateStore.set('daLive.tokenExpiration', Date.now() + 60000);
            globalStateStore.set('daLive.userEmail', 'user@example.com');
            globalStateStore.set('daLive.orgName', 'my-org');
            globalStateStore.set('daLive.setupComplete', true);

            // When: logout() called
            await service.logout();

            // Then: Token data and orgName cleared
            expect(keychain.has(DA_LIVE_TOKEN_SECRET_KEY)).toBe(false);
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.tokenExpiration',
                undefined
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.userEmail',
                undefined
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.orgName',
                undefined
            );
        });

        it('should preserve setupComplete on logout', async () => {
            // Given: setupComplete is true
            globalStateStore.set('daLive.setupComplete', true);

            // When: logout() called
            await service.logout();

            // Then: setupComplete is NOT cleared
            expect(mockContext.globalState.update).not.toHaveBeenCalledWith(
                'daLive.setupComplete',
                undefined
            );
            expect(globalStateStore.get('daLive.setupComplete')).toBe(true);
        });

        it('should not throw when no token stored', async () => {
            // Given: Empty globalState

            // When/Then: logout() completes without error
            await expect(service.logout()).resolves.not.toThrow();
        });
    });

    describe('resetAll', () => {
        it('should clear everything including setupComplete', async () => {
            // Given: Full state
            keychain.set(DA_LIVE_TOKEN_SECRET_KEY, 'token');
            globalStateStore.set('daLive.tokenExpiration', Date.now() + 60000);
            globalStateStore.set('daLive.userEmail', 'user@example.com');
            globalStateStore.set('daLive.orgName', 'my-org');
            globalStateStore.set('daLive.setupComplete', true);

            // When: resetAll() called
            await service.resetAll();

            // Then: Everything cleared including setupComplete
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.setupComplete',
                undefined
            );
            expect(keychain.has(DA_LIVE_TOKEN_SECRET_KEY)).toBe(false);
            expect(mockContext.globalState.update).toHaveBeenCalledWith(
                'daLive.orgName',
                undefined
            );
        });
    });

    describe('getOrgName', () => {
        it('should return stored org name', () => {
            globalStateStore.set('daLive.orgName', 'test-org');
            expect(service.getOrgName()).toBe('test-org');
        });

        it('should return undefined when no org stored', () => {
            expect(service.getOrgName()).toBeUndefined();
        });
    });

    describe('isSetupComplete', () => {
        it('should return true when setupComplete is stored', () => {
            globalStateStore.set('daLive.setupComplete', true);
            expect(service.isSetupComplete()).toBe(true);
        });

        it('should return false when not stored', () => {
            expect(service.isSetupComplete()).toBe(false);
        });
    });

    describe('dispose', () => {
        it('should complete without error', () => {
            // Given: Service instance exists

            // When/Then: dispose() completes without error
            expect(() => service.dispose()).not.toThrow();
        });

        it('should be callable multiple times', () => {
            // Given: Service instance

            // When/Then: Multiple dispose calls don't throw
            expect(() => {
                service.dispose();
                service.dispose();
            }).not.toThrow();
        });
    });
});
