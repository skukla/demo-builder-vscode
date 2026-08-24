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

jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: jest.fn(() => ({
        previewCode: mockPreviewCode,
        purgeCacheAll: mockPurgeCacheAll,
        publishAllSiteContent: mockPublishAllSiteContent,
    })),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(() => ({})),
    createDaLiveServiceTokenProvider: jest.fn(() => ({})),
}));
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: jest.fn(async () => undefined),
    configureDaLivePermissions: jest.fn(async () => ({ success: true })),
    resolveProjectAuthoringExperience: jest.fn(() => 'da-live-classic'),
}));
jest.mock('@/features/eds/services/configSyncService', () => ({
    syncConfigToRemote: jest.fn(async () => ({ success: true })),
    verifyConfigOnCdn: jest.fn(async () => true),
}));
jest.mock('@/features/eds/handlers/byomOverlay', () => ({
    resolveByomOverlayConfig: jest.fn(() => 'https://overlay.example/render-pdp?org=acme&site=shop'),
}));
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({
    prewarmCatalog: jest.fn(async () => ({ attempted: 2, succeeded: 2, failed: 0, skipped: false })),
}));

import { republishStorefrontContent } from '@/features/eds/services/storefront/storefrontRepublishService';
import { verifyConfigOnCdn } from '@/features/eds/services/configSyncService';
import { resolveByomOverlayConfig } from '@/features/eds/handlers/byomOverlay';
import { prewarmCatalog } from '@/features/eds/services/catalogPrewarmService';
import type { Logger } from '@/types/logger';

const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() } as unknown as Logger;

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

    // Decided 2026-08-23: Republish is the lightweight retry for a prewarm
    // that failed at creation (a hibernated Live Search index reactivated
    // since), and it refreshes previously-prewarmed PDPs, which the content
    // publish above never reaches (they are synthetic, not DA content).
    describe('catalog pre-warming rides the republish', () => {
        it('prewarms with the resolved overlay AFTER the content publish', async () => {
            const project = { name: 'p', path: '/p', componentInstances: {} };
            await republishStorefrontContent(params({ project }));

            expect(resolveByomOverlayConfig).toHaveBeenCalledWith(undefined, 'acme', 'shop');
            expect(prewarmCatalog).toHaveBeenCalledWith(
                project,
                'https://overlay.example/render-pdp?org=acme&site=shop',
                'acme',
                'shop',
                expect.anything(), // the HelixService instance
                logger,
                expect.any(Function),
            );
            // Ordering: publish first, prewarm after.
            const publishOrder = mockPublishAllSiteContent.mock.invocationCallOrder[0];
            const prewarmOrder = (prewarmCatalog as jest.Mock).mock.invocationCallOrder[0];
            expect(prewarmOrder).toBeGreaterThan(publishOrder);
        });

        it('skips prewarm entirely when no overlay resolves (BYOM off)', async () => {
            (resolveByomOverlayConfig as jest.Mock).mockReturnValueOnce(undefined);
            const res = await republishStorefrontContent(params());
            expect(prewarmCatalog).not.toHaveBeenCalled();
            expect(res.success).toBe(true);
        });

        it('a prewarm failure is non-fatal to the republish', async () => {
            (prewarmCatalog as jest.Mock).mockRejectedValueOnce(new Error('enumeration boom'));
            const res = await republishStorefrontContent(params());
            expect(res.success).toBe(true);
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('pre-warming failed (non-fatal)'),
            );
        });
    });
});
