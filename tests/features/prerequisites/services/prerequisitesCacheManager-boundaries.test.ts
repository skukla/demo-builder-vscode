/**
 * PrerequisitesCacheManager — the BOUNDARY cases the other suites step over.
 *
 * The existing suites prove the cache expires "after" a TTL and evicts "the
 * oldest" entry. Neither phrase is precise enough to constrain the code: the
 * instant now === expiry, which of two entries sharing the lowest expiry is
 * evicted, and whether a counter goes up or down were all free to change with
 * every test still green.
 *
 * Jitter is stubbed to the identity here for the same reason the collaborators
 * suite stubs it — with a random TTL the expiry instant is not a value a test
 * can name, and these tests are entirely about that instant.
 */

const mockGetCacheTTLWithJitter = jest.fn((ttl: number) => ttl);
jest.mock('@/core/cache/cacheUtils', () => ({
    getCacheTTLWithJitter: (ttl: number) => mockGetCacheTTLWithJitter(ttl),
}));

import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { createMockStatus, setupMockTime } from './prerequisitesCacheManager.testUtils';
import type { CachedPrerequisiteResult } from '@/features/prerequisites/services/types';
import { createMockLogger } from '../../../helpers/loggerFake';

/** The private map, reachable the way the stats-versions suite already reaches it. */
function innerCache(cache: PrerequisitesCacheManager): Map<string, CachedPrerequisiteResult> {
    return (cache as unknown as { cache: Map<string, CachedPrerequisiteResult> }).cache;
}

describe('PrerequisitesCacheManager - Boundaries', () => {
    let cache: PrerequisitesCacheManager;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCacheTTLWithJitter.mockImplementation((ttl: number) => ttl);
        cache = new PrerequisitesCacheManager(createMockLogger());
    });

    describe('the expiry instant itself', () => {
        it('treats an entry as expired at exactly its expiry, not one tick later', () => {
            const time = setupMockTime(1_000_000);
            cache.setCachedResult('node', createMockStatus(), 10_000);

            time.advance(10_000); // now === expiry

            expect(cache.getCachedResult('node')).toBeUndefined();
            time.restore();
        });

        it('counts an expired read as a miss', () => {
            const time = setupMockTime(1_000_000);
            cache.setCachedResult('node', createMockStatus(), 10_000);

            time.advance(10_000);
            cache.getCachedResult('node');

            expect(cache.getStats()).toEqual(
                expect.objectContaining({ hits: 0, misses: 1, sets: 1, size: 0 })
            );
            time.restore();
        });

        it('drops a per-version entry at exactly its expiry too', () => {
            const time = setupMockTime(1_000_000);
            cache.setCachedResult('aio-cli', createMockStatus(), 10_000, '20');

            time.advance(10_000);

            expect(cache.getPerVersionResults('aio-cli')).toEqual([]);
            time.restore();
        });
    });

    describe('eviction when the cache is full', () => {
        it('evicts the FIRST entry holding the lowest expiry when several tie', () => {
            const time = setupMockTime(1_000_000);
            // Time is frozen and jitter is the identity, so every one of these
            // 100 entries carries the same expiry — the tie the comparison decides.
            for (let i = 0; i < 100; i++) {
                cache.setCachedResult(`p-${i}`, createMockStatus({ id: `p-${i}` }), 10_000);
            }

            cache.setCachedResult('newcomer', createMockStatus({ id: 'newcomer' }), 10_000);

            expect(cache.getCachedResult('p-0')).toBeUndefined();
            expect(cache.getCachedResult('p-99')).toBeDefined();
            expect(cache.getCachedResult('newcomer')).toBeDefined();
            time.restore();
        });
    });

    describe('the invalidation counter', () => {
        it('adds the number of entries cleared to the running total', () => {
            cache.setCachedResult('node', createMockStatus());
            cache.setCachedResult('npm', createMockStatus());
            cache.setCachedResult('git', createMockStatus());

            cache.clearAll();

            expect(cache.getStats()).toEqual(
                expect.objectContaining({ invalidations: 3, size: 0 })
            );
        });
    });

    describe('selecting the per-version entries of one prerequisite', () => {
        it('returns only the entries keyed to the prerequisite asked for', () => {
            const time = setupMockTime(1_000_000);
            cache.setCachedResult('aio-cli', createMockStatus({ installed: true }), 10_000, '20');
            cache.setCachedResult('aio-cli', createMockStatus({ installed: false }), 10_000, '24');
            cache.setCachedResult('node', createMockStatus({ installed: true }), 10_000);
            cache.setCachedResult('other-cli', createMockStatus({ installed: true }), 10_000, '20');

            expect(cache.getPerVersionResults('aio-cli')).toEqual([
                { version: 'Node 20', major: '20', component: '', installed: true },
                { version: 'Node 24', major: '24', component: '', installed: false },
            ]);
            time.restore();
        });

        it('recovers the major from the key for an entry stored before nodeVersion was kept', () => {
            const time = setupMockTime(1_000_000);
            // The shape the fallback in getPerVersionResults exists for: a cache
            // entry written by an older build, which recorded no nodeVersion.
            innerCache(cache).set('aio-cli##22', {
                data: createMockStatus({ installed: true }),
                expiry: 1_010_000,
            });

            expect(cache.getPerVersionResults('aio-cli')).toEqual([
                { version: 'Node 22', major: '22', component: '', installed: true },
            ]);
            time.restore();
        });
    });
});
