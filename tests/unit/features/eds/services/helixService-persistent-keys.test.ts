/**
 * HelixService Tests - Persistent Key Store
 *
 * Tests for persistent API key storage:
 * - Restore from persistent store
 * - Skip expired keys
 * - Persist new keys
 * - Delete old keys before creating new
 * - Auth failure cache clearing
 * - In-memory fallback
 * - Delete admin API key
 * - Idempotent initialization
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
    let mockGlobalState: {
        get: jest.Mock;
        update: jest.Mock;
        keys: jest.Mock;
        setKeysForSync: jest.Mock;
    };
    let stateStore: Record<string, unknown>;
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

        stateStore = {};
        mockGlobalState = {
            get: jest.fn(<T>(key: string, defaultValue?: T) => (stateStore[key] ?? defaultValue) as T),
            update: jest.fn((key: string, value: unknown) => {
                stateStore[key] = value;
                return Promise.resolve();
            }),
            keys: jest.fn(() => Object.keys(stateStore)),
            setKeysForSync: jest.fn(),
        };
    });

    afterEach(() => {
        HelixServiceClass.clearKeyStore();
        global.fetch = originalFetch;
    });

    it('should restore key from persistent store on cache miss', async () => {
        stateStore['helix.apiKeys'] = {
            'testorg/testsite': {
                value: 'persisted-key-value',
                id: 'persisted-key-id',
                expiresAt: Date.now() + 3600000,
            },
        };
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('persisted-key-value');
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Restoring persisted'));
    });

    it('should skip expired persistent keys', async () => {
        stateStore['helix.apiKeys'] = {
            'testorg/testsite': {
                value: 'expired-key',
                id: 'expired-key-id',
                expiresAt: Date.now() - 1000,
            },
        };
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

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
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 'new-key-id', value: 'new-key-value', expiration: '2027-06-01T00:00:00Z' }),
        });

        await service.createAdminApiKey('testorg', 'testsite');

        expect(mockGlobalState.update).toHaveBeenCalledWith(
            'helix.apiKeys',
            expect.objectContaining({
                'testorg/testsite': expect.objectContaining({
                    value: 'new-key-value',
                    id: 'new-key-id',
                    expiresAt: expect.any(Number),
                }),
            }),
        );
    });

    it('should delete old key before creating new one', async () => {
        stateStore['helix.apiKeys'] = {
            'testorg/testsite': {
                value: 'old-key-value',
                id: 'old-key-id',
                expiresAt: Date.now() + 3600000,
            },
        };
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

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
        stateStore['helix.apiKeys'] = {
            'testorg/testsite': {
                value: 'old-key-value',
                id: 'old-key-id',
                expiresAt: Date.now() + 3600000,
            },
        };
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

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

    it('should clear persistent store on auth failure retry', async () => {
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

        mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-1', value: 'stale-key', expiration: '2027-01-01T00:00:00Z' }) });
        mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ id: 'key-2', value: 'fresh-key', expiration: '2027-01-01T00:00:00Z' }) });
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

        await service.unpublishPages('testorg', 'testsite', 'main', ['/page']);

        const persisted = (stateStore['helix.apiKeys'] as Record<string, { id: string; value: string }>)?.['testorg/testsite'];
        expect(persisted).toBeDefined();
        expect(persisted.id).toBe('key-2');
        expect(persisted.value).toBe('fresh-key');
    });

    it('should fall back to in-memory only when no store initialized', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true, status: 200,
            json: () => Promise.resolve({ id: 'key-1', value: 'memory-only-key', expiration: '2027-01-01T00:00:00Z' }),
        });

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('memory-only-key');
        expect(mockGlobalState.update).not.toHaveBeenCalled();

        const key2 = await service.createAdminApiKey('testorg', 'testsite');
        expect(key2).toBe('memory-only-key');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should delete admin API key and clear caches on deleteAdminApiKey', async () => {
        stateStore['helix.apiKeys'] = {
            'testorg/testsite': {
                value: 'key-to-delete',
                id: 'key-id-123',
                expiresAt: Date.now() + 3600000,
            },
        };
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

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
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);
        const result = await service.deleteAdminApiKey('testorg', 'testsite');
        expect(result.success).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle server error gracefully on deleteAdminApiKey', async () => {
        stateStore['helix.apiKeys'] = {
            'testorg/testsite': {
                value: 'key-value',
                id: 'key-id-456',
                expiresAt: Date.now() + 3600000,
            },
        };
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

        mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

        const result = await service.deleteAdminApiKey('testorg', 'testsite');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Network timeout');
        expect((stateStore['helix.apiKeys'] as Record<string, unknown>)?.['testorg/testsite']).toBeUndefined();
    });

    it('should treat 404 as success on deleteAdminApiKey', async () => {
        stateStore['helix.apiKeys'] = {
            'testorg/testsite': {
                value: 'key-value',
                id: 'key-id-gone',
                expiresAt: Date.now() + 3600000,
            },
        };
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

        mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

        const result = await service.deleteAdminApiKey('testorg', 'testsite');
        expect(result.success).toBe(true);
    });

    it('should be idempotent when initKeyStore called multiple times', async () => {
        stateStore['helix.apiKeys'] = {
            'testorg/testsite': {
                value: 'persisted-key',
                id: 'key-id',
                expiresAt: Date.now() + 3600000,
            },
        };
        HelixServiceClass.initKeyStore(mockGlobalState as unknown as import('vscode').Memento);

        const anotherMockState = {
            get: jest.fn(() => ({})),
            update: jest.fn(() => Promise.resolve()),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn(),
        };
        HelixServiceClass.initKeyStore(anotherMockState as unknown as import('vscode').Memento);

        const key = await service.createAdminApiKey('testorg', 'testsite');
        expect(key).toBe('persisted-key');
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
