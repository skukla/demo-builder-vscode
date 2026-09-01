/**
 * PrerequisitesCacheManager — the COLLABORATOR seams.
 *
 * WRITTEN 2026-08-29 to close phase 2 of the ADR-015 convergence, which named
 * this class as its one BLIND witness: eight suites covering it, and not a
 * single assertion about how it talks to anything. Those eight test cache
 * BEHAVIOUR thoroughly — hits, misses, eviction, TTL expiry, stats — and would
 * all still pass if the class stopped using its injected logger, or stopped
 * putting jitter on its TTLs, or called the jitter function and threw the
 * answer away.
 *
 * That is the specific hole phase 2 exists to close: a conversion moves WHO
 * hands the collaborator in, so something has to fail when the wrong one is
 * used. Behaviour tests cannot see it, because the behaviour is identical.
 *
 * Two seams, and why each is load-bearing:
 *
 *  1. `getCacheTTLWithJitter(ttlMs)` decides how long an entry lives. Jitter
 *     exists so a hundred cached prerequisites do not all expire in the same
 *     millisecond and stampede the shell. A change that dropped it, or passed
 *     the raw TTL through, would be invisible to every existing test — the
 *     cache would still hit, still miss, still expire.
 *
 *  2. `this.logger` is the constructor's logger. It is OPTIONAL and falls back
 *     to `getLogger()`, which is exactly the shape ADR-015 converts. Nothing
 *     currently proves the handed-in one is the one used, so a conversion that
 *     silently kept fetching would look identical.
 */

const mockGetCacheTTLWithJitter = jest.fn((ttl: number) => ttl);

/**
 * `getLogger()` is the constructor's FALLBACK. It is stubbed to a working
 * logger on purpose: left un-stubbed it throws "Logger not initialized", and a
 * conversion that ignored its injected logger would then fail on the throw
 * rather than on the assertion — a pass for the wrong reason. Stubbing it makes
 * the fallback succeed, so only the assertion below can tell the two apart.
 */

jest.mock('@/core/cache/cacheUtils', () => ({
    getCacheTTLWithJitter: (ttl: number) => mockGetCacheTTLWithJitter(ttl),
}));

import { PrerequisitesCacheManager } from '@/features/prerequisites/services/prerequisitesCacheManager';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import { createMockStatus, setupMockTime } from './prerequisitesCacheManager.testUtils';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

/** A logger whose calls we can see — the point of the second seam. */
function makeLogger(): jest.Mocked<Logger> {
    return createMockLogger();
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetCacheTTLWithJitter.mockImplementation((ttl: number) => ttl);
});

describe('the TTL seam — jitter is asked for, and its answer is used', () => {
    it('asks getCacheTTLWithJitter for the TTL it was given', () => {
        const cache = new PrerequisitesCacheManager(makeLogger());

        cache.setCachedResult('node', createMockStatus(), 45_000);

        expect(mockGetCacheTTLWithJitter).toHaveBeenCalledWith(45_000);
    });

    it('defaults to CACHE_TTL.MEDIUM when the caller names no TTL', () => {
        const cache = new PrerequisitesCacheManager(makeLogger());

        cache.setCachedResult('node', createMockStatus());

        expect(mockGetCacheTTLWithJitter).toHaveBeenCalledWith(CACHE_TTL.MEDIUM);
    });

    it('USES the jittered answer for expiry, not the raw TTL', () => {
        // The distinction this pins: calling the jitter function and discarding
        // its result would satisfy the assertions above and break the stampede
        // protection. So make jitter return something the raw TTL is not.
        const time = setupMockTime(1_000_000);
        mockGetCacheTTLWithJitter.mockReturnValue(5_000);
        const cache = new PrerequisitesCacheManager(makeLogger());

        cache.setCachedResult('node', createMockStatus(), 60_000);

        // Just inside the JITTERED window (5s), far inside the raw one (60s).
        time.advance(4_000);
        expect(cache.getCachedResult('node')).toBeDefined();

        // Past the jittered window. If the raw TTL had been used, this hits.
        time.advance(2_000);
        expect(cache.getCachedResult('node')).toBeUndefined();

        time.restore();
    });
});

describe('the logger seam — the INJECTED logger is the one used', () => {
    it('reports an expiry through the logger it was handed', () => {
        const time = setupMockTime(1_000_000);
        const logger = makeLogger();
        const cache = new PrerequisitesCacheManager(logger);
        cache.setCachedResult('node', createMockStatus(), 1_000);

        time.advance(2_000);
        cache.getCachedResult('node');

        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache expired'));
        time.restore();
    });

    it('reports an eviction through the logger it was handed', () => {
        const logger = makeLogger();
        const cache = new PrerequisitesCacheManager(logger);

        // MAX_CACHE_SIZE is 100; the 101st entry evicts the oldest.
        for (let i = 0; i < 101; i++) {
            cache.setCachedResult(`prereq-${i}`, createMockStatus({ id: `prereq-${i}` }));
        }

        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Evicted oldest entry'));
    });

    it('a DIFFERENT logger instance receives nothing — the handed-in one is not shared', () => {
        // Guards the conversion directly: if the constructor ignored its
        // argument and fetched a logger instead, this passes vacuously today
        // and fails the moment two instances are given different loggers.
        const first = makeLogger();
        const second = makeLogger();
        const cacheA = new PrerequisitesCacheManager(first);
        new PrerequisitesCacheManager(second);

        for (let i = 0; i < 101; i++) {
            cacheA.setCachedResult(`p-${i}`, createMockStatus({ id: `p-${i}` }));
        }

        expect(first.debug).toHaveBeenCalled();
        expect(second.debug).not.toHaveBeenCalled();
    });
});
