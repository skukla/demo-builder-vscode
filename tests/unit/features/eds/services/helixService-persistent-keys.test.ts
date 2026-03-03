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

// Mock vscode module
jest.mock('vscode');

// Mock logging
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => mockLogger),
    Logger: jest.fn(() => mockLogger),
}));

// Mock timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000,
        NORMAL: 30000,
        LONG: 180000,
        VERY_LONG: 300000,
    },
    CACHE_TTL: {
        SHORT: 60000,
        MEDIUM: 300000,
        LONG: 3600000,
    },
}));

// Mock DA.live content operations
const mockListDirectory = jest.fn();
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        listDirectory: mockListDirectory,
    })),
}));

type HelixServiceType = import('@/features/eds/services/helixService').HelixService;

interface MockGitHubTokenService {
    getToken: jest.Mock;
    validateToken: jest.Mock;
}

interface MockDaLiveTokenProvider {
    getAccessToken: jest.Mock<Promise<string | null>>;
}

describe('HelixService - Persistent Key Store', () => {
    let service: HelixServiceType;
    let mockGitHubTokenService: MockGitHubTokenService;
    let mockDaLiveTokenProvider: MockDaLiveTokenProvider;
    let mockFetch: jest.Mock;
    let HelixServiceClass: typeof import('@/features/eds/services/helixService').HelixService;
    let mockSecretStorage: {
        get: jest.Mock;
        store: jest.Mock;
        delete: jest.Mock;
        onDidChange: jest.Mock;
    };
    let secretStore: Record<string, string>;
    const originalFetch = global.fetch;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockListDirectory.mockReset();

        mockGitHubTokenService = {
            getToken: jest.fn().mockResolvedValue({ token: 'valid-github-token', tokenType: 'bearer', scopes: ['repo'] }),
            validateToken: jest.fn().mockResolvedValue({ valid: true }),
        };

        mockDaLiveTokenProvider = {
            getAccessToken: jest.fn().mockResolvedValue('valid-dalive-ims-token'),
        };

        mockFetch = jest.fn();
        global.fetch = mockFetch;

        const module = await import('@/features/eds/services/helixService');
        HelixServiceClass = module.HelixService;
        HelixServiceClass.clearApiKeyCache();
        HelixServiceClass.clearKeyStore();

        service = new module.HelixService(undefined, mockGitHubTokenService, mockDaLiveTokenProvider);

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
        global.fetch = originalFetch;
    });

    it('should restore key from persistent store on cache miss', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'persisted-key-value',
                id: 'persisted-key-id',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('persisted-key-value');
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Restoring persisted'));
    });

    it('should skip expired persistent keys', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'expired-key',
                id: 'expired-key-id',
                expiresAt: Date.now() - 1000,
            },
        });
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 'new-key-id', value: 'fresh-key-value', expiration: '2027-01-01T00:00:00Z' }),
        });

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('fresh-key-value');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should persist new keys with ID and expiry', async () => {
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 'new-key-id', value: 'new-key-value', expiration: '2027-06-01T00:00:00Z' }),
        });

        await service.createAdminApiKey('testorg', 'testsite');

        expect(mockSecretStorage.store).toHaveBeenCalledWith(
            'helix.apiKeys',
            expect.any(String),
        );
        const storedJson = mockSecretStorage.store.mock.calls[0][1] as string;
        const stored = JSON.parse(storedJson) as Record<string, { value: string; id: string; expiresAt: number }>;
        expect(stored['testorg/testsite']).toEqual(expect.objectContaining({
            value: 'new-key-value',
            id: 'new-key-id',
            expiresAt: expect.any(Number),
        }));
    });

    it('should delete old key before creating new one', async () => {
        secretStore['helix.apiKeys'] = JSON.stringify({
            'testorg/testsite': {
                value: 'old-key-value',
                id: 'old-key-id',
                expiresAt: Date.now() + 3600000,
            },
        });
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

        const restoredKey = await service.createAdminApiKey('testorg', 'testsite');
        expect(restoredKey).toBe('old-key-value');

        const originalDateNow = Date.now;
        Date.now = () => originalDateNow() + 2 * 60 * 60 * 1000;

        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 'new-key-id', value: 'new-key-value', expiration: '2027-06-01T00:00:00Z' }),
        });

        try {
            const key = await service.createAdminApiKey('testorg', 'testsite');
            expect(key).toBe('new-key-value');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('/apiKeys/old-key-id.json'),
                expect.objectContaining({ method: 'DELETE' }),
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
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

        await service.createAdminApiKey('testorg', 'testsite');
        const originalDateNow = Date.now;
        Date.now = () => originalDateNow() + 2 * 60 * 60 * 1000;

        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 'new-key-id', value: 'new-key-after-failed-delete', expiration: '2027-06-01T00:00:00Z' }),
        });

        try {
            const key = await service.createAdminApiKey('testorg', 'testsite');
            expect(key).toBe('new-key-after-failed-delete');
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('deletion failed'));
        } finally {
            Date.now = originalDateNow;
        }
    });

    it('should fall back to in-memory only when no store initialized', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 'key-1', value: 'memory-only-key', expiration: '2027-01-01T00:00:00Z' }),
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
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

        await service.createAdminApiKey('testorg', 'testsite');
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

        const result = await service.deleteAdminApiKey('testorg', 'testsite');
        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/apiKeys/key-id-123.json'),
            expect.objectContaining({ method: 'DELETE' }),
        );

        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 'new-key', value: 'new-key-value', expiration: '2027-01-01T00:00:00Z' }),
        });
        await service.createAdminApiKey('testorg', 'testsite');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/apiKeys.json'),
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('should succeed when no persisted key exists on deleteAdminApiKey', async () => {
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);
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
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

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
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

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
        await HelixServiceClass.initKeyStore(mockSecretStorage as unknown as import('vscode').SecretStorage);

        const anotherMockStorage = {
            get: jest.fn(() => Promise.resolve(undefined)),
            store: jest.fn(() => Promise.resolve()),
            delete: jest.fn(() => Promise.resolve()),
            onDidChange: jest.fn(),
        };
        await HelixServiceClass.initKeyStore(anotherMockStorage as unknown as import('vscode').SecretStorage);

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
            mockLegacyState as unknown as import('vscode').Memento,
        );

        // Keys migrated to SecretStorage
        expect(mockSecretStorage.store).toHaveBeenCalledWith(
            'helix.apiKeys',
            JSON.stringify(legacyKeys),
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
            mockLegacyState as unknown as import('vscode').Memento,
        );

        // No migration writes
        expect(mockSecretStorage.store).not.toHaveBeenCalled();
        expect(mockLegacyState.update).not.toHaveBeenCalled();
    });
});
