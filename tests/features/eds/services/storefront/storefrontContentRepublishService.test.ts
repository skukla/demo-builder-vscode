/**
 * republishStorefrontContent — the shared content-publish pipeline extracted from
 * the dashboard republish handler. Collaborators (Helix, DA.live ops, helpers,
 * CDN verify) are mocked; the real republishStorefrontConfig early-returns
 * (non-fatal) for a metadata-less project, so the test stays deterministic.
 * Asserts the success contract and that a step failure is caught and returned.
 */


// One instance each, so the steps that receive them can be asserted by identity.
const mockContentOps = { sourceOps: {} };
const mockTokenProvider = {};
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(() => mockContentOps),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => mockTokenProvider),
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

// The catalog menu step has its own suite (catalogMenuStep.test.ts); here it is walled
// and asserted by what republish hands it and does with its answer (EDS-24).
const mockApplyCatalogMenuStep = jest.fn();
const mockPublishAuthoredListStep = jest.fn();
jest.mock('@/features/eds/services/catalogMenu/catalogMenuStep', () => ({
    applyCatalogMenuStep: (...a: unknown[]) => mockApplyCatalogMenuStep(...a),
    publishAuthoredListStep: (...a: unknown[]) => mockPublishAuthoredListStep(...a),
}));

import { republishStorefrontContent } from '@/features/eds/services/storefront/storefrontContentRepublishService';
import { verifyConfigOnCdn } from '@/features/eds/services/configSyncService';
import { resolveByomOverlayConfig } from '@/features/eds/handlers/byomOverlay';
import { prewarmCatalog } from '@/features/eds/services/catalogPrewarmService';
import {
    applyDaLiveOrgConfigSettings,
    configureDaLivePermissions,
} from '@/features/eds/handlers/edsHelpers';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { PREVIEW_CODE_APP_NOT_ON_REPO_ERROR } from '../../../../helpers/helixAdminFixtures';
import { fakeHelix, helixCalls } from './storefrontContentRepublishService.testUtils';

// Helix arrives through the pipeline's own params; the shared fake states its surface.
const {
    previewCode: mockPreviewCode,
    purgeCacheAll: mockPurgeCacheAll,
    publishAllSiteContent: mockPublishAllSiteContent,
} = helixCalls;

const logger = createMockLogger();

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
        githubFiles: { getFileContent: jest.fn().mockResolvedValue(null) },
        persist: jest.fn(async () => undefined),
        helixService: fakeHelix,
        ...overrides,
    } as unknown as Parameters<typeof republishStorefrontContent>[0];
}

describe('republishStorefrontContent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockApplyCatalogMenuStep.mockResolvedValue(undefined);
    });

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

    // EDS-23 recommendation 2: the raw x-error is honest but not actionable. When
    // the code endpoint says the App is not on the repository, the answer says
    // that in plain words and links the install page — on the dashboard button
    // and the agent's `republish` tool alike, which share this pipeline.
    it('says "add the repository to the App" when the code endpoint says the App is not on it', async () => {
        mockPreviewCode.mockRejectedValueOnce(new Error(PREVIEW_CODE_APP_NOT_ON_REPO_ERROR));
        const res = await republishStorefrontContent(params());
        expect(res.success).toBe(false);
        expect(res.error).toContain('The AEM Code Sync GitHub App is not on me/shop');
        expect(res.error).toContain('https://github.com/apps/aem-code-sync/installations/select_target');
        expect(mockPurgeCacheAll).not.toHaveBeenCalled();
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
                fakeHelix, // the very instance we handed in — no longer opaque
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
            expect(res).toStrictEqual({ success: true, cdnVerified: true });
            expect(verifyConfigOnCdn).toHaveBeenCalledWith('me', 'shop', logger);
        });
    });

    describe('category pages and the catalog menu ride the republish (EDS-24)', () => {
        it("re-applies after the content publish, on this storefront's pages and repository", async () => {
            const p = params();
            await republishStorefrontContent(p);

            const [project, site] = mockApplyCatalogMenuStep.mock.calls[0];
            expect(project).toBe(p.project);
            await site.hasBlock();
            expect(p.githubFiles.getFileContent).toHaveBeenCalledWith(
                'me',
                'shop',
                'blocks/catalog-menu/catalog-menu.js',
            );
            const publishOrder = mockPublishAllSiteContent.mock.invocationCallOrder[0];
            expect(mockApplyCatalogMenuStep.mock.invocationCallOrder[0]).toBeGreaterThan(publishOrder);
        });

        it('publishes the authored-pages sheet BEFORE the bulk page publish, on the site the step then uses', async () => {
            // An authored page at a category address is previewed by the bulk publish; unless
            // the published sheet already lists it, the overlay replaces it (EDS-61).
            const p = params();
            await republishStorefrontContent(p);

            const [project, site] = mockPublishAuthoredListStep.mock.calls[0];
            expect(project).toBe(p.project);
            expect(mockPublishAuthoredListStep.mock.invocationCallOrder[0]).toBeLessThan(
                mockPublishAllSiteContent.mock.invocationCallOrder[0],
            );
            expect(mockApplyCatalogMenuStep.mock.calls[0][1]).toBe(site);
        });

        it('carries on with the publish when the early sheet could not go out: the step retries it', async () => {
            mockPublishAuthoredListStep.mockResolvedValueOnce("Couldn't publish the list (HTTP 401); …");
            const res = await republishStorefrontContent(params());

            expect(res.success).toBe(true);
            expect(mockPublishAllSiteContent).toHaveBeenCalled();
            expect(mockApplyCatalogMenuStep).toHaveBeenCalled();
        });

        it('carries the sentence on the result, shows it under its step, and keeps the record on the project', async () => {
            mockApplyCatalogMenuStep.mockResolvedValue({ summary: 'Published 1 category page.', ok: true });
            const onStage = jest.fn();
            const p = params({ onStage });

            const res = await republishStorefrontContent(p);

            expect(res).toEqual({
                success: true,
                cdnVerified: true,
                catalogMenu: 'Published 1 category page.',
            });
            expect(onStage).toHaveBeenCalledWith(
                OPERATION_STAGES.updatingCatalogMenu.label,
                'Published 1 category page.',
            );
            expect(p.persist).toHaveBeenCalledWith(p.project);
        });

        it('adds nothing and saves nothing extra when the storefront has no catalog menu', async () => {
            const p = params();
            const res = await republishStorefrontContent(p);
            // Strict: an absent sentence is no key at all, not `catalogMenu: undefined`.
            expect(res).toStrictEqual({ success: true, cdnVerified: true });
            expect(p.persist).not.toHaveBeenCalled();
        });
    });

    describe('the steps between the config and the publish', () => {
        it('applies the DA.live site config with the project\'s authoring experience', async () => {
            await republishStorefrontContent(params());
            expect(applyDaLiveOrgConfigSettings).toHaveBeenCalledWith(
                mockContentOps,
                'acme',
                'shop',
                logger,
                'da-live-classic',
            );
        });

        it('grants the signed-in user site permissions', async () => {
            await republishStorefrontContent(params());
            expect(configureDaLivePermissions).toHaveBeenCalledWith(
                mockTokenProvider,
                'acme',
                'shop',
                'u@example.com',
                logger,
            );
        });

        it('skips the permissions, and still publishes, when nobody is signed in by email', async () => {
            const onStage = jest.fn();
            const res = await republishStorefrontContent(
                params({ daLiveAuthService: { getUserEmail: jest.fn(async () => undefined) }, onStage }),
            );
            expect(configureDaLivePermissions).not.toHaveBeenCalled();
            expect(mockPublishAllSiteContent).toHaveBeenCalled();
            expect(res).toStrictEqual({ success: true, cdnVerified: true });
            // A step with nothing to do is not shown; the next one keeps its own number.
            expect(onStage.mock.calls.map(([stage]) => stage)).not.toContain(
                OPERATION_STAGES.settingSitePermissions.label,
            );
        });

        // Progress vocabulary slice 3 (owner, 2026-10-16): each part is a STEP from the
        // stage table, named as the same job is everywhere else, with what it is doing
        // under it. It used to be one line after another, each shown as if it were the
        // step: "Syncing code to CDN", "Purging stale cache", "Verifying CDN".
        it('reports each step as it starts, in order, with what it is doing under it', async () => {
            mockPublishAllSiteContent.mockImplementationOnce(async (...a: unknown[]) => {
                const onStep = a[4] as (i: { message: string }) => void;
                onStep({ message: 'Publishing the pages: 3 of 3 pages' });
                return undefined;
            });
            (prewarmCatalog as jest.Mock).mockImplementationOnce(
                async (...a: unknown[]) => {
                    const onStep = a[6] as (p: { message: string }) => void;
                    onStep({ message: 'Warming product pages: 2 of 2 pages' });
                    return { attempted: 2, succeeded: 2, failed: 0, skipped: false };
                },
            );
            const onStage = jest.fn();

            await republishStorefrontContent(params({ onStage }));

            const S = OPERATION_STAGES;
            expect(onStage.mock.calls).toStrictEqual([
                [S.applyingDaLiveSettings.label],
                [S.publishingSettings.label],
                // The real config step, which stops early for a project with no storefront.
                [S.publishingSettings.label, 'Publishing the settings: Reading the project settings'],
                [S.publishingCode.label],
                [S.settingSitePermissions.label],
                [S.clearingCache.label],
                [S.publishingPages.label],
                [S.publishingPages.label, 'Publishing the pages: 3 of 3 pages'],
                [S.updatingCatalogMenu.label],
                [S.warmingProductPages.label],
                [S.warmingProductPages.label, 'Warming product pages: 2 of 2 pages'],
                [S.checkingSettings.label],
            ]);
        });
    });
});
