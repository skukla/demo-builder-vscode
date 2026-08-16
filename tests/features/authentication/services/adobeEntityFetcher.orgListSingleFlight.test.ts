/**
 * AdobeEntityFetcher — getOrganizationsSdkOnly single-flight
 *
 * The org-list cache dedupes SEQUENTIAL callers (2nd call reads the cache) but
 * did nothing for CONCURRENT ones: each checked the cache, each missed, each
 * fired its own SDK round-trip. Opening the integrations surface triggers
 * `orgContextCheck` and the API picker's handler at nearly the same moment, so
 * the 2026-07-31 Debug Logs show two overlapping fetches:
 *
 *     [Entity Fetcher] Retrieved 1 organizations via SDK in 2.5s
 *     [Entity Fetcher] Retrieved 1 organizations via SDK in 1.4s
 *
 * This suite pins single-flight: concurrent callers share ONE in-flight promise,
 * and the flight is released afterwards so a later call can still refetch.
 *
 * The SDK is MOCKED — no live Adobe calls.
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';

jest.mock('@/core/logging');

import { getLogger } from '@/core/logging';

const ORGS = [{ id: 'org-1', name: 'Acme', code: 'acme@AdobeOrg', type: 'entp' }];

describe('AdobeEntityFetcher — getOrganizationsSdkOnly single-flight', () => {
    let fetcher: AdobeEntityFetcher;
    let sdk: { getOrganizations: jest.Mock };
    let cache: { getCachedOrgList: jest.Mock; setCachedOrgList: jest.Mock };

    /** Resolve the pending SDK call by hand, so concurrency is deterministic. */
    let release: (value: unknown) => void;

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

        sdk = {
            getOrganizations: jest.fn(
                () =>
                    new Promise((resolve) => {
                        release = resolve;
                    })
            ),
        };

        // Always a cache MISS — this suite is about the in-flight window, which is
        // precisely the window in which the cache cannot help.
        cache = {
            getCachedOrgList: jest.fn().mockReturnValue(undefined),
            setCachedOrgList: jest.fn(),
        };

        const sdkClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue(sdk),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        fetcher = new AdobeEntityFetcher(
            { execute: jest.fn() } as unknown as jest.Mocked<CommandExecutor>,
            sdkClient,
            cache as unknown as jest.Mocked<AuthCacheManager>,
            {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            } as unknown as jest.Mocked<Logger>,
            { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>
        );
    });

    // THE regression: two callers racing must cost ONE round-trip, not two.
    it('collapses concurrent callers into a single SDK round-trip', async () => {
        const a = fetcher.getOrganizationsSdkOnly();
        const b = fetcher.getOrganizationsSdkOnly();
        const c = fetcher.getOrganizationsSdkOnly();

        // Let the shared flight reach the SDK before resolving it.
        await Promise.resolve();
        await Promise.resolve();
        release({ body: ORGS });

        const [ra, rb, rc] = await Promise.all([a, b, c]);

        expect(sdk.getOrganizations).toHaveBeenCalledTimes(1);
        expect(ra).toEqual(rb);
        expect(rb).toEqual(rc);
    });

    it('every concurrent caller gets the real result, not undefined', async () => {
        const a = fetcher.getOrganizationsSdkOnly();
        const b = fetcher.getOrganizationsSdkOnly();

        await Promise.resolve();
        await Promise.resolve();
        release({ body: ORGS });

        const [ra, rb] = await Promise.all([a, b]);

        expect(ra).toHaveLength(1);
        expect(rb).toHaveLength(1);
        expect(ra?.[0]?.id).toBe('org-1');
    });

    // A flight that is never released would wedge the fetcher for the session.
    it('releases the flight so a LATER call can fetch again', async () => {
        const first = fetcher.getOrganizationsSdkOnly();
        await Promise.resolve();
        await Promise.resolve();
        release({ body: ORGS });
        await first;

        const second = fetcher.getOrganizationsSdkOnly();
        await Promise.resolve();
        await Promise.resolve();
        release({ body: ORGS });
        await second;

        expect(sdk.getOrganizations).toHaveBeenCalledTimes(2);
    });

    it('releases the flight after a FAILED fetch (no permanent wedge)', async () => {
        sdk.getOrganizations.mockRejectedValueOnce(new Error('network'));

        const first = await fetcher.getOrganizationsSdkOnly();
        expect(first).toBeUndefined();

        // A rejected flight must not be cached NOR left pending.
        sdk.getOrganizations.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                })
        );
        const second = fetcher.getOrganizationsSdkOnly();
        await Promise.resolve();
        await Promise.resolve();
        release({ body: ORGS });

        expect(await second).toHaveLength(1);
        expect(cache.setCachedOrgList).toHaveBeenCalledTimes(1);
    });

    it('still short-circuits on a cache HIT without starting a flight', async () => {
        cache.getCachedOrgList.mockReturnValue(ORGS);

        const result = await fetcher.getOrganizationsSdkOnly();

        expect(result).toEqual(ORGS);
        expect(sdk.getOrganizations).not.toHaveBeenCalled();
    });
});
