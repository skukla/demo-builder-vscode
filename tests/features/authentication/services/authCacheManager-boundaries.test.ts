/**
 * The expiry boundary of every TTL cache, the TTL each setter asks for, and the
 * two caches no suite had touched (token inspection; the targeted org-list and
 * developer-permission clears). The jitter is stubbed to identity so "exactly at
 * expiry" is a real instant rather than somewhere inside a ±10% band — the
 * sibling suites advance past the band and so cannot see `>=` become `>`.
 */
import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { getCacheTTLWithJitter } from '@/core/cache/cacheUtils';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import { createMockOrg, createMockConsoleWhere, mockTime } from './authCacheManager.testUtils';

jest.mock('@/core/cache/cacheUtils', () => ({
    getCacheTTLWithJitter: jest.fn((ttlMs: number) => ttlMs),
}));

const mockJitter = getCacheTTLWithJitter as jest.Mock;

describe('AuthCacheManager - expiry boundaries and TTL choices', () => {
    let cache: AuthCacheManager;
    let time: ReturnType<typeof mockTime>;

    beforeEach(() => {
        jest.clearAllMocks();
        cache = new AuthCacheManager();
        time = mockTime();
    });

    afterEach(() => {
        time.restore();
    });

    /**
     * Each row: how to fill the cache, how to read it, and the TTL its setter
     * must ask the jitter for.
     */
    const caches: Array<{
        name: string;
        ttl: number;
        fill: () => void;
        read: () => unknown;
    }> = [
        {
            name: 'validation',
            ttl: CACHE_TTL.MEDIUM,
            fill: () => cache.setValidationCache('org123', true),
            read: () => cache.getValidationCache(),
        },
        {
            name: 'org list',
            ttl: CACHE_TTL.SHORT,
            fill: () => cache.setCachedOrgList([createMockOrg()]),
            read: () => cache.getCachedOrgList(),
        },
        {
            name: 'console.where',
            ttl: CACHE_TTL.MEDIUM,
            fill: () => cache.setCachedConsoleWhere(createMockConsoleWhere()),
            read: () => cache.getCachedConsoleWhere(),
        },
        {
            name: 'token inspection',
            ttl: CACHE_TTL.MEDIUM,
            fill: () => cache.setCachedTokenInspection({ valid: true, expiresIn: 30, token: 't' }),
            read: () => cache.getCachedTokenInspection(),
        },
        {
            name: 'developer permissions',
            ttl: CACHE_TTL.MEDIUM,
            fill: () => cache.setCachedDeveloperPermissions({ hasPermissions: true }),
            read: () => cache.getCachedDeveloperPermissions(),
        },
    ];

    describe.each(caches)('$name cache', ({ ttl, fill, read }) => {
        it('asks the jitter for its own TTL', () => {
            fill();
            expect(mockJitter).toHaveBeenCalledTimes(1);
            expect(mockJitter).toHaveBeenCalledWith(ttl);
        });

        it('is live one millisecond before expiry and gone AT expiry', () => {
            fill();
            time.advance(ttl - 1);
            expect(read()).toBeDefined();
            time.advance(1);
            expect(read()).toBeUndefined();
        });
    });

    describe('auth status cache', () => {
        it('defaults to the MEDIUM TTL', () => {
            cache.setCachedAuthStatus(true);
            expect(mockJitter).toHaveBeenCalledWith(CACHE_TTL.MEDIUM);
        });

        it('is live one millisecond before expiry and expired AT expiry', () => {
            cache.setCachedAuthStatus(false, 1000);
            time.advance(999);
            expect(cache.getCachedAuthStatus()).toEqual({ isAuthenticated: false, isExpired: false });
            time.advance(1);
            expect(cache.getCachedAuthStatus()).toEqual({ isAuthenticated: undefined, isExpired: true });
        });
    });
});

describe('AuthCacheManager - token inspection and the targeted clears', () => {
    let cache: AuthCacheManager;

    beforeEach(() => {
        cache = new AuthCacheManager();
    });

    it('returns the stored inspection verbatim, and nothing before one is stored', () => {
        expect(cache.getCachedTokenInspection()).toBeUndefined();
        const inspection = { valid: true, expiresIn: 42, token: 'tok' };
        cache.setCachedTokenInspection(inspection);
        expect(cache.getCachedTokenInspection()).toEqual(inspection);
    });

    it('clearTokenInspectionCache forgets the inspection and nothing else', () => {
        cache.setCachedTokenInspection({ valid: true, expiresIn: 42 });
        cache.setCachedDeveloperPermissions({ hasPermissions: true });
        cache.clearTokenInspectionCache();
        expect(cache.getCachedTokenInspection()).toBeUndefined();
        expect(cache.getCachedDeveloperPermissions()).toEqual({ hasPermissions: true });
    });

    it('clearOrgListCache forgets the org list and leaves console.where alone', () => {
        cache.setCachedOrgList([createMockOrg()]);
        cache.setCachedConsoleWhere(createMockConsoleWhere());
        cache.clearOrgListCache();
        expect(cache.getCachedOrgList()).toBeUndefined();
        expect(cache.getCachedConsoleWhere()).toEqual(createMockConsoleWhere());
    });

    it('clearDeveloperPermissionsCache forgets the probe and leaves the inspection alone', () => {
        cache.setCachedDeveloperPermissions({ hasPermissions: false, error: 'nope' });
        cache.setCachedTokenInspection({ valid: true, expiresIn: 42 });
        cache.clearDeveloperPermissionsCache();
        expect(cache.getCachedDeveloperPermissions()).toBeUndefined();
        expect(cache.getCachedTokenInspection()).toEqual({ valid: true, expiresIn: 42 });
    });

    it('clearPerformanceCaches and clearAll both forget the token inspection', () => {
        cache.setCachedTokenInspection({ valid: true, expiresIn: 42 });
        cache.clearPerformanceCaches();
        expect(cache.getCachedTokenInspection()).toBeUndefined();

        cache.setCachedTokenInspection({ valid: true, expiresIn: 42 });
        cache.setCachedDeveloperPermissions({ hasPermissions: true });
        cache.clearAll();
        expect(cache.getCachedTokenInspection()).toBeUndefined();
        expect(cache.getCachedDeveloperPermissions()).toBeUndefined();
    });
});
