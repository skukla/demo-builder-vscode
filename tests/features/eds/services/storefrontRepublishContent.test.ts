/**
 * republishStorefrontContent — the shared content-publish pipeline extracted from
 * the dashboard republish handler. Collaborators (Helix, DA.live ops, helpers,
 * CDN verify) are mocked; the same-module republishStorefrontConfig early-returns
 * (non-fatal) for a metadata-less project, so the test stays deterministic.
 * Asserts the success contract and that a step failure is caught and returned.
 */

const mockPreviewCode = jest.fn(async () => undefined);
const mockPurgeCacheAll = jest.fn(async () => undefined);
const mockPublishAllSiteContent = jest.fn(async () => undefined);

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn(() => ({
        previewCode: mockPreviewCode,
        purgeCacheAll: mockPurgeCacheAll,
        publishAllSiteContent: mockPublishAllSiteContent,
    })),
}));
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(() => ({})),
    createDaLiveServiceTokenProvider: jest.fn(() => ({})),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: jest.fn(async () => undefined),
    configureDaLivePermissions: jest.fn(async () => ({ success: true })),
}));
jest.mock('@/features/eds/services/configSyncService', () => ({
    syncConfigToRemote: jest.fn(async () => ({ success: true })),
    verifyConfigOnCdn: jest.fn(async () => true),
}));

import { republishStorefrontContent } from '@/features/eds/services/storefrontRepublishService';
import { verifyConfigOnCdn } from '@/features/eds/services/configSyncService';
import type { Logger } from '@/types/logger';

const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;

function params(overrides: Record<string, unknown> = {}) {
    return {
        // Metadata-less project → republishStorefrontConfig early-returns (non-fatal).
        project: { name: 'p', path: '/p', componentInstances: {} },
        repoOwner: 'me',
        repoName: 'shop',
        daLiveOrg: 'acme',
        daLiveSite: 'shop',
        secrets: {},
        logger,
        daLiveAuthService: { getUserEmail: jest.fn(async () => 'u@example.com') },
        githubTokenService: {},
        ...overrides,
    } as unknown as Parameters<typeof republishStorefrontContent>[0];
}

describe('republishStorefrontContent', () => {
    beforeEach(() => jest.clearAllMocks());

    it('runs the pipeline (code → purge → publish → verify) and returns success', async () => {
        const res = await republishStorefrontContent(params());
        expect(res).toEqual({ success: true, cdnVerified: true });
        expect(mockPreviewCode).toHaveBeenCalledWith('me', 'shop', '/*');
        expect(mockPurgeCacheAll).toHaveBeenCalledWith('me', 'shop', 'main');
        expect(mockPublishAllSiteContent).toHaveBeenCalledWith('me/shop', 'main', 'acme', 'shop', expect.any(Function));
    });

    it('surfaces cdnVerified:false when verification times out (best-effort)', async () => {
        (verifyConfigOnCdn as jest.Mock).mockResolvedValueOnce(false);
        const res = await republishStorefrontContent(params());
        expect(res).toEqual({ success: true, cdnVerified: false });
    });

    it('catches a step failure and returns success:false with the error', async () => {
        mockPublishAllSiteContent.mockRejectedValueOnce(new Error('helix 503'));
        const res = await republishStorefrontContent(params());
        expect(res).toMatchObject({ success: false, error: 'helix 503' });
    });
});
