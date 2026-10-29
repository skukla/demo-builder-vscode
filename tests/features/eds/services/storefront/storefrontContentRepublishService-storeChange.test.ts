/**
 * The dashboard's Republish (and the agent's `republish`) after a store change (EDS-44).
 *
 * When the store-change marker is set and this run's config publish reached the CDN,
 * the pipeline's catalog half is the store-change service — the old store's product
 * pages out, category pages swapped, the new store's product pages in — instead of its
 * usual refresh. Without the marker, nothing changes.
 *
 * The config republish and the store-change service each have their own suites; here
 * both are walled and asserted by what the pipeline hands them.
 */

const mockContentOps = { sourceOps: { tag: 'source-ops' } };
const mockTokenProvider = { getAccessToken: jest.fn() };
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
    verifyConfigOnCdn: jest.fn(async () => true),
}));
jest.mock('@/features/eds/handlers/byomOverlay', () => ({
    resolveByomOverlayConfig: jest.fn(() => 'https://overlay.example/render-pdp'),
}));
jest.mock('@/features/eds/services/catalogPrewarmService', () => ({
    prewarmCatalog: jest.fn(async () => ({ attempted: 2, succeeded: 2, failed: 0, skipped: false })),
}));
const mockApplyCatalogMenuStep = jest.fn();
const mockPublishAuthoredListStep = jest.fn();
jest.mock('@/features/eds/services/catalogMenu/catalogMenuStep', () => ({
    applyCatalogMenuStep: (...a: unknown[]) => mockApplyCatalogMenuStep(...a),
    publishAuthoredListStep: (...a: unknown[]) => mockPublishAuthoredListStep(...a),
}));
const mockRepublishConfig = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: (...a: unknown[]) => mockRepublishConfig(...a),
}));
const mockReplaceStoreScopePages = jest.fn();
jest.mock('@/features/eds/services/storefront/storeScopePages', () => ({
    ...jest.requireActual('@/features/eds/services/storefront/storeScopePages'),
    replaceStoreScopePages: (...a: unknown[]) => mockReplaceStoreScopePages(...a),
}));
const STORE_DEPS = { tag: 'store-scope-deps' };
const mockCreateStoreScopePagesDeps = jest.fn((..._a: unknown[]) => STORE_DEPS);
jest.mock('@/features/eds/services/storefront/storeScopePagesDeps', () => ({
    createStoreScopePagesDeps: (...a: unknown[]) => mockCreateStoreScopePagesDeps(...a),
}));

import { runningWork } from '@/core/state/projectWorkRunning';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { prewarmCatalog } from '@/features/eds/services/catalogPrewarmService';
import { republishStorefrontContent } from '@/features/eds/services/storefront/storefrontContentRepublishService';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { fakeHelix, helixCalls } from './storefrontContentRepublishService.testUtils';

const SENTENCE = 'Now on CitiSignal: 11 category pages and 39 product pages published.';
const order: string[] = [];

function storefront(pending: boolean): Project {
    return createMockProject({
        name: 'shop',
        path: '/p/shop',
        edsStorefrontState: {
            envVars: {},
            lastPublished: '2026-10-15T00:00:00.000Z',
            ...(pending
                ? { catalogPagesPending: { fromWebsiteCode: 'base', fromStoreCode: 'main', fromStoreViewCode: 'default' } }
                : {}),
        },
    });
}

const stateManager = createMockStateManager();
const logger = createMockLogger();
const githubFiles = { getFileContent: jest.fn(async () => null) };
const persist = jest.fn(async () => undefined);

function run(project: Project, over: Partial<Parameters<typeof republishStorefrontContent>[0]> = {}) {
    return republishStorefrontContent({
        project,
        persist,
        repoOwner: 'me',
        repoName: 'shop',
        daLiveOrg: 'acme',
        daLiveSite: 'shop',
        secrets: {} as Parameters<typeof republishStorefrontContent>[0]['secrets'],
        logger,
        daLiveAuthService: { getUserEmail: jest.fn(async () => 'u@example.com') } as unknown as Parameters<
            typeof republishStorefrontContent
        >[0]['daLiveAuthService'],
        githubTokenService: {} as Parameters<typeof republishStorefrontContent>[0]['githubTokenService'],
        githubFiles,
        stateManager,
        helixService: fakeHelix,
        ...over,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
    helixCalls.publishAllSiteContent.mockImplementation(async () => {
        order.push('content published');
        return undefined;
    });
    mockRepublishConfig.mockResolvedValue({ success: true, cdnPublished: true });
    mockApplyCatalogMenuStep.mockResolvedValue(undefined);
    mockReplaceStoreScopePages.mockImplementation(async () => {
        order.push('store pages replaced');
        return { sentence: SENTENCE, counts: { categoryPages: 11, productPages: 39, oldProductPagesRemoved: 0 } };
    });
});

// The projects list reads what is running from the registry (found 2026-10-28: a
// republish left the card's status untouched). Both doors, the dashboard button and
// the agent's tool, come through this function.
it('lists the project as republishing while it runs, and not after', async () => {
    let during: string | undefined;
    helixCalls.publishAllSiteContent.mockImplementation(async () => {
        during = runningWork('/p/shop');
        return undefined;
    });

    await run(storefront(false));

    expect(during).toBe('republishing');
    expect(runningWork('/p/shop')).toBeUndefined();
});

it('replaces the pages for the new store after the content is published, when the store changed', async () => {
    const project = storefront(true);

    const result = await run(project);

    expect(order).toEqual(['content published', 'store pages replaced']);
    expect(mockReplaceStoreScopePages).toHaveBeenCalledWith(project, STORE_DEPS, expect.any(Function));
    expect(result).toMatchObject({ success: true, storePages: SENTENCE });
    // Its own catalog refresh is what the service replaces: not run twice.
    expect(mockApplyCatalogMenuStep).not.toHaveBeenCalled();
    expect(prewarmCatalog).not.toHaveBeenCalled();
});

it('builds the service deps from the clients this pipeline already holds', async () => {
    const project = storefront(true);

    await run(project);

    expect(mockCreateStoreScopePagesDeps).toHaveBeenCalledWith({
        project,
        target: { repoOwner: 'me', repoName: 'shop', daLiveOrg: 'acme', daLiveSite: 'shop' },
        daLiveTokenProvider: mockTokenProvider,
        githubFiles,
        stateManager,
        persist,
        logger,
        helixService: fakeHelix,
        daLiveSourceOps: mockContentOps.sourceOps,
    });
});

it('hands the service the caller\'s stage reporter when there is one', async () => {
    const onStage = jest.fn();

    await run(storefront(true), { onStage });

    expect(mockReplaceStoreScopePages.mock.calls[0][2]).toBe(onStage);
});

// The store-change service reports its own three steps through the same reporter; the
// pipeline does not report the catalog menu or the product pages a second time, and its
// one sentence is the run's last word (the dashboard's note), not a line under a step.
it('leaves the page steps to the store-change service, then checks the settings', async () => {
    const onStage = jest.fn();

    await run(storefront(true), { onStage });

    expect(onStage.mock.calls.map(([stage]) => stage)).toStrictEqual([
        OPERATION_STAGES.applyingDaLiveSettings.label,
        OPERATION_STAGES.publishingSettings.label,
        OPERATION_STAGES.publishingCode.label,
        OPERATION_STAGES.settingSitePermissions.label,
        OPERATION_STAGES.clearingCache.label,
        OPERATION_STAGES.publishingPages.label,
        OPERATION_STAGES.checkingSettings.label,
    ]);
});

it('does its usual catalog refresh, and no replacement, when the store did not change', async () => {
    const result = await run(storefront(false));

    expect(mockReplaceStoreScopePages).not.toHaveBeenCalled();
    expect(mockApplyCatalogMenuStep).toHaveBeenCalled();
    expect(prewarmCatalog).toHaveBeenCalled();
    expect(result).not.toHaveProperty('storePages');
});

it('leaves the marker for next time when this run\'s config did not reach the CDN', async () => {
    // The live storefront still reads the old store, so the old pages still fit it.
    mockRepublishConfig.mockResolvedValue({ success: true, cdnError: 'HTTP 401' });

    await run(storefront(true));

    expect(mockReplaceStoreScopePages).not.toHaveBeenCalled();
    expect(mockApplyCatalogMenuStep).toHaveBeenCalled();
});
