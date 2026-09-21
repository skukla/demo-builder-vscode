/**
 * AdobeEntityFetcher — getServicesForOrg per-org session cache (Step 1)
 *
 * getServicesForOrg fetches the whole org entitled-services catalog on every
 * call, and the catalog is identical for every workspace in an org. This suite
 * pins the per-fetcher-instance cache: a 2nd call within the TTL returns the
 * cached list (SDK hit once), different orgs fetch separately, an empty/failed
 * result is NOT cached (so a transient error can't poison the cache), and the
 * cache refetches once the TTL expires.
 *
 * The SDK is MOCKED via the SDK client's getClient() — no live Adobe calls.
 * Time is controlled by mocking Date.now (no real timers/sleeps).
 */

import {
    MESH,
    StepLogger,
    getLogger,
} from './adobeEntityCollaborators.testUtils';
import {
    createEntityCollaborators,
    type EntityCollaborators,
} from '@/features/authentication/services/adobeEntityService';
import { CACHE_TTL, TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

describe('entity collaborators — getServicesForOrg cache', () => {
    let entities: EntityCollaborators;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let sdk: { getServicesForOrg: jest.Mock };

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());

        sdk = { getServicesForOrg: jest.fn() };

        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue(sdk),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        entities = createEntityCollaborators(
            createMockCommandExecutor(),
            mockSDKClient,
            {} as unknown as jest.Mocked<AuthCacheManager>,
            createMockLogger() as unknown as jest.Mocked<Logger>,
            { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return the cached list on a 2nd call within the TTL (SDK hit once)', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [{ code: MESH, platformList: ['apiKey'] }] });

        const first = await entities.orgServices.getServicesForOrg('org1');
        const second = await entities.orgServices.getServicesForOrg('org1');

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(1);
        expect(second).toEqual(first);
    });

    it('should fetch separately for a different orgId', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [{ code: MESH, platformList: ['apiKey'] }] });

        await entities.orgServices.getServicesForOrg('org1');
        await entities.orgServices.getServicesForOrg('org2');

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(2);
        expect(sdk.getServicesForOrg).toHaveBeenNthCalledWith(1, 'org1', undefined);
        expect(sdk.getServicesForOrg).toHaveBeenNthCalledWith(2, 'org2', undefined);
    });

    it('should NOT cache an empty result (2nd call refetches)', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [] });

        await entities.orgServices.getServicesForOrg('org1');
        await entities.orgServices.getServicesForOrg('org1');

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(2);
    });

    it('should refetch once the TTL has expired', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [{ code: MESH, platformList: ['apiKey'] }] });
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);

        await entities.orgServices.getServicesForOrg('org1');
        // Advance the clock past the TTL — the cache entry is now stale.
        nowSpy.mockReturnValue(1_000 + CACHE_TTL.ORG_SERVICES + 1);
        await entities.orgServices.getServicesForOrg('org1');

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(2);
    });

    // ---- single-flight (2026-07-31) ----
    // The Add Integration modal PREFETCHES this catalog on open and the API picker
    // fetches it again when the user reaches that stage. That pair is concurrent by
    // construction, and the cache cannot help inside the in-flight window — so both
    // pulled the org's full ~90-row catalog.

    it('collapses CONCURRENT callers for the same org into one SDK fetch', async () => {
        let release!: (v: unknown) => void;
        sdk.getServicesForOrg.mockReturnValue(
            new Promise((resolve) => {
                release = resolve;
            })
        );

        const a = entities.orgServices.getServicesForOrg('org1');
        const b = entities.orgServices.getServicesForOrg('org1');
        const c = entities.orgServices.getServicesForOrg('org1');
        await Promise.resolve();
        await Promise.resolve();
        release({ body: [{ code: MESH, platformList: ['apiKey'] }] });

        const [ra, rb, rc] = await Promise.all([a, b, c]);
        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(1);
        expect(rb).toEqual(ra);
        expect(rc).toEqual(ra);
    });

    it('keeps concurrent flights SEPARATE per org', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [{ code: MESH, platformList: ['apiKey'] }] });

        await Promise.all([entities.orgServices.getServicesForOrg('org1'), entities.orgServices.getServicesForOrg('org2')]);

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(2);
    });

    // Every other SDK read is bounded by trySDKFetch; this one predated that and had
    // no ceiling, so a stalled endpoint left the picker spinning indefinitely.
    // THROWS rather than resolving []: an empty list is indistinguishable from
    // "this org entitles nothing", and the picker rendered a failed fetch as
    // `No APIs match ""` instead of its "Couldn't load Adobe APIs" + Retry view.
    it('THROWS rather than hanging when the SDK call never settles', async () => {
        jest.useFakeTimers();
        sdk.getServicesForOrg.mockReturnValue(new Promise(() => {}));

        const pending = entities.orgServices.getServicesForOrg('org1');
        // The assertion IS awaited below; the handler must attach BEFORE the
        // timers advance or the rejection is unhandled. The rule cannot see a
        // deferred await.
        // eslint-disable-next-line jest/valid-expect
        const assertion = expect(pending).rejects.toThrow(/timed out/i);
        await Promise.resolve();
        jest.advanceTimersByTime(TIMEOUTS.ORG_SERVICES_FETCH + 1000);

        await assertion;
        jest.useRealTimers();
    });

    it('does NOT cache a timed-out fetch, and the slot still works after', async () => {
        jest.useFakeTimers();
        sdk.getServicesForOrg.mockReturnValueOnce(new Promise(() => {}));

        const pending = entities.orgServices.getServicesForOrg('org1');
        // The assertion IS awaited below; the handler must attach BEFORE the
        // timers advance or the rejection is unhandled. The rule cannot see a
        // deferred await.
        // eslint-disable-next-line jest/valid-expect
        const rejected = expect(pending).rejects.toThrow();
        await Promise.resolve();
        jest.advanceTimersByTime(TIMEOUTS.ORG_SERVICES_FETCH + 1000);
        await rejected;
        jest.useRealTimers();

        // A failed flight must be released AND uncached, or one transient stall
        // would wedge the picker for the whole session.
        sdk.getServicesForOrg.mockResolvedValue({ body: [{ code: MESH, platformList: ['apiKey'] }] });
        expect(await entities.orgServices.getServicesForOrg('org1')).toHaveLength(1);
    });
});
