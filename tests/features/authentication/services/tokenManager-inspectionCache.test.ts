/**
 * TokenManager — the inspection CACHE.
 *
 * `inspectToken` consults the cache before reading the store, and writes only
 * an ACCEPTED verdict back, never an expired one. Every case here uses the real
 * `AuthCacheManager` with its two token methods spied, so the assertions are on
 * the calls the cache receives rather than on what a fake chose to answer.
 *
 * This path had no test at all before 2026-09-03: every other TokenManager suite
 * constructs the manager without a cache, so the whole `if (this.cacheManager)`
 * block was uncovered.
 */

import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import {
    TokenManager,
    type StoredTokenConfig,
} from '@/features/authentication/services/tokenManager';

const LONG_TOKEN = 'x'.repeat(150);
const HOUR_MS = 60 * 60 * 1000;

function build(stored: StoredTokenConfig | undefined) {
    const cache = new AuthCacheManager();
    const read = jest.spyOn(cache, 'getCachedTokenInspection');
    const write = jest.spyOn(cache, 'setCachedTokenInspection');
    const reader = jest.fn(() => stored);
    const manager = new TokenManager(cache, undefined, reader);
    return { manager, cache, read, write, reader };
}

describe('TokenManager — inspection cache', () => {
    it('a cache hit answers without reading the store', async () => {
        const cached = { valid: true, expiresIn: 42, token: 'c'.repeat(150) };
        const { manager, cache, reader } = build(undefined);
        cache.setCachedTokenInspection(cached);

        const result = await manager.inspectToken();

        expect(result).toEqual(cached);
        expect(reader).not.toHaveBeenCalled();
    });

    it('a cache miss reads the store and writes the accepted verdict into the cache', async () => {
        const { manager, read, write, reader } = build({
            token: LONG_TOKEN,
            expiry: Date.now() + HOUR_MS,
        });

        const result = await manager.inspectToken();

        expect(read).toHaveBeenCalledTimes(1);
        expect(reader).toHaveBeenCalledTimes(1);
        expect(result.valid).toBe(true);
        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith(result);
    });

    it('the written verdict serves the NEXT call, which reads nothing', async () => {
        const { manager, reader } = build({ token: LONG_TOKEN, expiry: Date.now() + HOUR_MS });

        const first = await manager.inspectToken();
        const second = await manager.inspectToken();

        expect(second).toEqual(first);
        expect(reader).toHaveBeenCalledTimes(1);
    });

    it('an expired verdict is never cached', async () => {
        const { manager, write } = build({ token: LONG_TOKEN, expiry: Date.now() - HOUR_MS });

        await manager.inspectToken();

        expect(write).not.toHaveBeenCalled();
    });
});
