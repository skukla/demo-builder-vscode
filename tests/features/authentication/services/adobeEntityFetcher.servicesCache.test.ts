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

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import { CACHE_TTL } from '@/core/utils';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger, StepLogger } from '@/core/logging';

jest.mock('@/core/logging');

import { getLogger } from '@/core/logging';

const MESH = 'GraphQLServiceSDK';

describe('AdobeEntityFetcher — getServicesForOrg cache', () => {
    let fetcher: AdobeEntityFetcher;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let sdk: { getServicesForOrg: jest.Mock };

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        });

        sdk = { getServicesForOrg: jest.fn() };

        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue(sdk),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        fetcher = new AdobeEntityFetcher(
            { execute: jest.fn() } as unknown as jest.Mocked<CommandExecutor>,
            mockSDKClient,
            {} as unknown as jest.Mocked<AuthCacheManager>,
            { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as jest.Mocked<Logger>,
            { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should return the cached list on a 2nd call within the TTL (SDK hit once)', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [{ code: MESH, platformList: ['apiKey'] }] });

        const first = await fetcher.getServicesForOrg('org1');
        const second = await fetcher.getServicesForOrg('org1');

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(1);
        expect(second).toEqual(first);
    });

    it('should fetch separately for a different orgId', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [{ code: MESH, platformList: ['apiKey'] }] });

        await fetcher.getServicesForOrg('org1');
        await fetcher.getServicesForOrg('org2');

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(2);
        expect(sdk.getServicesForOrg).toHaveBeenNthCalledWith(1, 'org1');
        expect(sdk.getServicesForOrg).toHaveBeenNthCalledWith(2, 'org2');
    });

    it('should NOT cache an empty result (2nd call refetches)', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [] });

        await fetcher.getServicesForOrg('org1');
        await fetcher.getServicesForOrg('org1');

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(2);
    });

    it('should refetch once the TTL has expired', async () => {
        sdk.getServicesForOrg.mockResolvedValue({ body: [{ code: MESH, platformList: ['apiKey'] }] });
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);

        await fetcher.getServicesForOrg('org1');
        // Advance the clock past the TTL — the cache entry is now stale.
        nowSpy.mockReturnValue(1_000 + CACHE_TTL.ORG_SERVICES + 1);
        await fetcher.getServicesForOrg('org1');

        expect(sdk.getServicesForOrg).toHaveBeenCalledTimes(2);
    });
});
