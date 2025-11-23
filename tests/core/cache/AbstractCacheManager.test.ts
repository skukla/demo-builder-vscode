/**
 * AbstractCacheManager Tests
 *
 * Tests for the base cache manager with TTL and jitter support.
 */

import { AbstractCacheManager, CacheConfig } from '@/core/cache/AbstractCacheManager';

// Concrete implementation for testing
class TestCacheManager extends AbstractCacheManager<string, string> {
    protected getKey(key: string): string {
        return key;
    }
}

describe('AbstractCacheManager', () => {
    let cache: TestCacheManager;

    beforeEach(() => {
        jest.useFakeTimers();
        cache = new TestCacheManager({ ttlMs: 5000 });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('basic operations', () => {
        it('should store and retrieve values', () => {
            cache.set('key1', 'value1');
            expect(cache.get('key1')).toBe('value1');
        });

        it('should return undefined for missing keys', () => {
            expect(cache.get('nonexistent')).toBeUndefined();
        });

        it('should check if key exists', () => {
            cache.set('key1', 'value1');
            expect(cache.has('key1')).toBe(true);
            expect(cache.has('nonexistent')).toBe(false);
        });

        it('should delete entries', () => {
            cache.set('key1', 'value1');
            cache.delete('key1');
            expect(cache.get('key1')).toBeUndefined();
        });

        it('should clear all entries', () => {
            cache.set('key1', 'value1');
            cache.set('key2', 'value2');
            cache.clear();
            expect(cache.get('key1')).toBeUndefined();
            expect(cache.get('key2')).toBeUndefined();
        });
    });

    describe('TTL expiration', () => {
        it('should return value before TTL expires', () => {
            cache.set('key1', 'value1');
            jest.advanceTimersByTime(4999);
            expect(cache.get('key1')).toBe('value1');
        });

        it('should return undefined after TTL expires', () => {
            cache.set('key1', 'value1');
            jest.advanceTimersByTime(5001);
            expect(cache.get('key1')).toBeUndefined();
        });

        it('should report has() as false for expired entries', () => {
            cache.set('key1', 'value1');
            jest.advanceTimersByTime(5001);
            expect(cache.has('key1')).toBe(false);
        });
    });

    describe('jitter support', () => {
        it('should apply jitter to TTL when configured', () => {
            // Create cache with 10% jitter
            const jitterCache = new TestCacheManager({ ttlMs: 10000, jitterPercent: 10 });

            // Mock Math.random to return 0.5 (middle of range)
            const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

            jitterCache.set('key1', 'value1');

            // With 10% jitter and random=0.5, TTL should be exactly 10000ms
            jest.advanceTimersByTime(9999);
            expect(jitterCache.get('key1')).toBe('value1');

            jest.advanceTimersByTime(2);
            expect(jitterCache.get('key1')).toBeUndefined();

            randomSpy.mockRestore();
        });
    });
});
