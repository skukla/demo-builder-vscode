/**
 * HelixService Tests - Persistent Key Store
 *
 * Tests for persistent API key storage via SecretStorage (OS keychain):
 * - Restore from persistent store
 * - Skip expired keys
 * - Persist new keys
 * - Delete old keys before creating new
 * - In-memory fallback
 * - Delete admin API key
 * - Idempotent initialization
 * - Legacy globalState migration
 */

import {
    createHelixService,
    installFetchMock,
    loadHelixServiceModule,
    makeDaLiveTokenProvider,
    makeGitHubTokenService,
    mockListDirectory,
    mockLogger,
    restoreFetch,
    type HelixServiceType,
    type MockDaLiveTokenProvider,
    type MockGitHubTokenService,
} from './helixService.testUtils';

describe('HelixService - Persistent Key Store', () => {
    let service: HelixServiceType;
    let mockGitHubTokenService: MockGitHubTokenService;
    let mockDaLiveTokenProvider: MockDaLiveTokenProvider;
    let mockFetch: jest.Mock;
    let HelixServiceClass: typeof import('@/features/eds/services/helix/helixService').HelixService;
    let mockSecretStorage: {
        get: jest.Mock;
        store: jest.Mock;
        delete: jest.Mock;
        onDidChange: jest.Mock;
    };
    let secretStore: Record<string, string>;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockListDirectory.mockReset();
        mockGitHubTokenService = makeGitHubTokenService();
        mockDaLiveTokenProvider = makeDaLiveTokenProvider();
        mockFetch = installFetchMock();

        // The class, not just an instance: these tests drive its static key
        // cache, and each case must start from an empty one.
        HelixServiceClass = (await loadHelixServiceModule()).HelixService;
        HelixServiceClass.clearApiKeyCache();
        HelixServiceClass.clearKeyStore();

        service = await createHelixService({
            githubTokenService: mockGitHubTokenService,
            daLiveTokenProvider: mockDaLiveTokenProvider,
        });

        secretStore = {};
        mockSecretStorage = {
            get: jest.fn((key: string) => Promise.resolve(secretStore[key])),
            store: jest.fn((key: string, value: string) => {
                secretStore[key] = value;
                return Promise.resolve();
            }),
            delete: jest.fn((key: string) => {
                delete secretStore[key];
                return Promise.resolve();
            }),
            onDidChange: jest.fn(),
        };
    });

    afterEach(() => {
        HelixServiceClass.clearKeyStore();
        restoreFetch();
    });

    it('should restore key from persistent store on cache miss', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'persisted-key-value',
                id: 'persisted-key-id',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('persisted-key-value');
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('Restoring persisted')
        );
    });

    it('should skip expired persistent keys', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'expired-key',
                id: 'expired-key-id',
                expiresAt: Date.now() - 1000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    id: 'new-key-id',
                    value: 'fresh-key-value',
                    expiration: '2027-01-01T00:00:00Z',
                }),
        });

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('fresh-key-value');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should persist new keys with ID and expiry', async () => {
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    id: 'new-key-id',
                    value: 'new-key-value',
                    expiration: '2027-06-01T00:00:00Z',
                }),
        });

        await service.createAdminApiKey('testorg', 'testsite');

        expect(mockSecretStorage.store).toHaveBeenCalledWith('helix.apiKeys', expect.any(String));
        const storedJson = mockSecretStorage.store.mock.calls[0][1] as string;
        const stored = JSON.parse(storedJson) as Record<
            string,
            { value: string; id: string; expiresAt: number }
        >;
        expect(stored['testorg/testsite']).toEqual(
            expect.objectContaining({
                value: 'new-key-value',
                id: 'new-key-id',
                expiresAt: expect.any(Number),
            })
        );
    });

    // Helix mints keys with a base64-ish id, so roughly half contain `/` (and
    // some `+`). The DELETE path segment needs the URL-SAFE form — the same id
    // the listing endpoint uses as its object key, with `/`→`_` and `+`→`-`.
    // Measured 2026-08-15 against a live site: raw id → HTTP 400, safe id → 204.
    // Every fixture here used a clean id like 'old-key-id', so the whole delete
    // path was broken and no test could see it.
    it('URL-encodes a base64 key id for DELETE (raw ids with / return 400)', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'old-key-value',
                id: '8DncYzJF8N0yFs62cNFAiWPCvGYnNnEw0dV/tl2vLvVz',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );
        mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

        await service.deleteAdminApiKey('testorg', 'testsite');

        const deleteUrl = mockFetch.mock.calls[0][0] as string;
        expect(deleteUrl).toContain('/apiKeys/8DncYzJF8N0yFs62cNFAiWPCvGYnNnEw0dV_tl2vLvVz.json');
        expect(deleteUrl).not.toContain('/tl2vLvVz.json');
    });

    it('requests the least-privilege publish role, never admin', async () => {
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    id: 'new-key-id',
                    value: 'new-key-value',
                    expiration: '2027-06-01T00:00:00Z',
                }),
        });

        await service.createAdminApiKey('testorg', 'testsite');

        const body = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body) as {
            roles: string[];
        };
        expect(body.roles).toEqual(['publish']);
    });

    it('should delete old key before creating new one', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'old-key-value',
                id: 'old-key-id',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        const restoredKey = await service.createAdminApiKey('testorg', 'testsite');
        expect(restoredKey).toBe('old-key-value');

        const originalDateNow = Date.now;
        Date.now = () => originalDateNow() + 2 * 60 * 60 * 1000;

        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    id: 'new-key-id',
                    value: 'new-key-value',
                    expiration: '2027-06-01T00:00:00Z',
                }),
        });

        try {
            const key = await service.createAdminApiKey('testorg', 'testsite');
            expect(key).toBe('new-key-value');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/apiKeys/old-key-id.json'),
                expect.objectContaining({ method: 'DELETE' })
            );
        } finally {
            Date.now = originalDateNow;
        }
    });

    it('should continue if old key deletion fails', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'old-key-value',
                id: 'old-key-id',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        await service.createAdminApiKey('testorg', 'testsite');
        const originalDateNow = Date.now;
        Date.now = () => originalDateNow() + 2 * 60 * 60 * 1000;

        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    id: 'new-key-id',
                    value: 'new-key-after-failed-delete',
                    expiration: '2027-06-01T00:00:00Z',
                }),
        });

        try {
            const key = await service.createAdminApiKey('testorg', 'testsite');
            expect(key).toBe('new-key-after-failed-delete');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('deletion failed')
            );
        } finally {
            Date.now = originalDateNow;
        }
    });

    it('should fall back to in-memory only when no store initialized', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    id: 'key-1',
                    value: 'memory-only-key',
                    expiration: '2027-01-01T00:00:00Z',
                }),
        });

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('memory-only-key');
        expect(mockSecretStorage.store).not.toHaveBeenCalled();

        const key2 = await service.createAdminApiKey('testorg', 'testsite');
        expect(key2).toBe('memory-only-key');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should delete admin API key and clear caches on deleteAdminApiKey', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'key-to-delete',
                id: 'key-id-123',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        await service.createAdminApiKey('testorg', 'testsite');
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

        const result = await service.deleteAdminApiKey('testorg', 'testsite');
        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/apiKeys/key-id-123.json'),
            expect.objectContaining({ method: 'DELETE' })
        );

        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    id: 'new-key',
                    value: 'new-key-value',
                    expiration: '2027-01-01T00:00:00Z',
                }),
        });
        await service.createAdminApiKey('testorg', 'testsite');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/apiKeys.json'),
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('should succeed when no persisted key exists on deleteAdminApiKey', async () => {
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );
        const result = await service.deleteAdminApiKey('testorg', 'testsite');
        expect(result.success).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle server error gracefully on deleteAdminApiKey', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'key-value',
                id: 'key-id-456',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

        const result = await service.deleteAdminApiKey('testorg', 'testsite');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Network timeout');
        const stored = JSON.parse(secretStore['helix.apiKeys']) as Record<string, unknown>;
        expect(stored['testorg/testsite']).toBeUndefined();
    });

    it('should treat 404 as success on deleteAdminApiKey', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'key-value',
                id: 'key-id-gone',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

        const result = await service.deleteAdminApiKey('testorg', 'testsite');
        expect(result.success).toBe(true);
    });

    it('should be idempotent when initKeyStore called multiple times', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'persisted-key',
                id: 'key-id',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage
        );

        const anotherMockStorage = {
            get: jest.fn(() => Promise.resolve(undefined)),
            store: jest.fn(() => Promise.resolve()),
            delete: jest.fn(() => Promise.resolve()),
            onDidChange: jest.fn(),
        };
        await HelixServiceClass.initKeyStore(
            anotherMockStorage as unknown as import('vscode').SecretStorage
        );

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('persisted-key');
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should migrate keys from legacy globalState to SecretStorage', async () => {
        const legacyKeys = {
            'testorg/testsite': {
                value: 'legacy-key-value',
                id: 'legacy-key-id',
                expiresAt: Date.now() + 3600000,
            },
        };
        const mockLegacyState = {
            get: jest.fn(() => legacyKeys),
            update: jest.fn(() => Promise.resolve()),
            keys: jest.fn(() => ['helix.apiKeys']),
            setKeysForSync: jest.fn(),
        };

        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage,
            mockLegacyState as unknown as import('vscode').Memento
        );

        // Keys migrated to SecretStorage
        expect(mockSecretStorage.store).toHaveBeenCalledWith(
            'helix.apiKeys',
            JSON.stringify(legacyKeys)
        );

        // Legacy globalState cleared
        expect(mockLegacyState.update).toHaveBeenCalledWith('helix.apiKeys', undefined);

        // Migrated key is accessible
        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('legacy-key-value');
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip migration when legacy globalState has no keys', async () => {
        const mockLegacyState = {
            get: jest.fn(() => undefined),
            update: jest.fn(() => Promise.resolve()),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        };

        await HelixServiceClass.initKeyStore(
            mockSecretStorage as unknown as import('vscode').SecretStorage,
            mockLegacyState as unknown as import('vscode').Memento
        );

        // No migration writes
        expect(mockSecretStorage.store).not.toHaveBeenCalled();
        expect(mockLegacyState.update).not.toHaveBeenCalled();
    });
});
