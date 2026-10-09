/**
 * tearDownStorefront — the four steps that take an EDS storefront off the
 * internet, shared by the delete-project button and the agent's cleanup (AI-9).
 *
 * What these pin is the ORDER and the honesty of the answer: the CDN unpublish
 * goes before the source deletion, because aem.live keeps serving what was
 * published after the source is gone — and when there is no repo to unpublish
 * against, the result says the site is still published rather than reporting a
 * clean teardown.
 */

import type { UnpublishPagesResult } from '@/features/eds/services/helix/helixPageDeletion';
import {
    tearDownStorefront,
    type TeardownHelix,
} from '@/features/eds/services/storefront/storefrontTeardown';
import { createMockLogger } from '../../../../helpers/loggerFake';

const removeSitePermissions = jest.fn().mockResolvedValue({ success: true });
const deleteSiteConfig = jest.fn().mockResolvedValue({ success: true });

jest.mock('@/features/eds/services/daLive/daLiveConfigService', () => ({
    DaLiveConfigService: jest.fn().mockImplementation(() => ({
        removeSitePermissions,
        deleteSiteConfig,
    })),
}));

const TOKEN_PROVIDER = { getAccessToken: async () => 'token' };

/** An unpublish where every path went from live and preview (the shape `unpublishPages` returns). */
function unpublishedAll(n: number): UnpublishPagesResult {
    return { success: n > 0, count: n, total: n, liveFailed: 0, previewFailed: 0 };
}

/**
 * What Helix says the site has published, by the pattern asked for. `/products/*` holds
 * two pages made through the overlay and the authored one DA.live also lists (EDS-26);
 * `/*` is the whole site (EDS-33) and holds those plus the authored pages.
 */
const PUBLISHED: Record<string, string[]> = {
    '/products/*': ['/products/drum/dc-100', '/products/sign/es-2', '/products/shirt'],
    '/*': ['/index', '/products/shirt', '/products/drum/dc-100', '/products/sign/es-2'],
};

type HelixFake = { [K in keyof TeardownHelix]: jest.Mock<ReturnType<TeardownHelix[K]>, Parameters<TeardownHelix[K]>> };

function helixFake(overrides: Partial<HelixFake> = {}): HelixFake {
    return {
        listAllPages: jest.fn<Promise<string[]>, [string, string, string?]>().mockResolvedValue(['/index', '/products/shirt']),
        unpublishPages: jest
            .fn<Promise<UnpublishPagesResult>, [string, string, string, string[]]>()
            .mockImplementation(async (_o, _s, _b, paths) => unpublishedAll(paths.length)),
        deleteAdminApiKey: jest
            .fn<Promise<{ success: boolean; error?: string }>, [string, string]>()
            .mockResolvedValue({ success: true }),
        listPublishedPaths: jest
            .fn<Promise<string[]>, [string, string, string, string]>()
            .mockImplementation(async (_o, _s, _b, pattern) => PUBLISHED[pattern] ?? []),
        ...overrides,
    };
}

function contentFake(overrides: Record<string, unknown> = {}) {
    return {
        deleteAllSiteContent: jest.fn().mockResolvedValue({
            success: true,
            deletedCount: 7,
            deletedPaths: [],
        }),
        ...overrides,
    };
}

/** What the live host answers for each URL checked after the unpublish; 404 = gone. */
function liveCheck(answers: Record<string, number> = {}, otherwise = 404) {
    return jest.fn<Promise<number>, [string]>().mockImplementation(async (url) => answers[url] ?? otherwise);
}

const LIVE_HOST = 'https://main--storefront--acme.aem.live';

function depsWith(helix = helixFake(), content = contentFake(), onStep?: (s: string) => void) {
    return {
        deps: {
            checkLive: liveCheck(),
            tokenProvider: TOKEN_PROVIDER,
            logger: createMockLogger(),
            initKeyStore: jest.fn().mockResolvedValue(undefined),
            makeHelix: () => helix,
            makeContentOps: () => content,
            otherProjectsOnRepo: jest.fn().mockResolvedValue([] as string[]),
            onStep,
        },
        helix,
        content,
    };
}

const SITE = { daLiveOrg: 'acme', daLiveSite: 'shop', githubRepo: 'acme/storefront' };

beforeEach(() => {
    jest.clearAllMocks();
    removeSitePermissions.mockResolvedValue({ success: true });
    deleteSiteConfig.mockResolvedValue({ success: true });
});

describe('with a repo to unpublish against', () => {
    it('takes the pages off the CDN BEFORE deleting the source', async () => {
        const { deps, helix, content } = depsWith();

        const result = await tearDownStorefront(SITE, deps);

        expect(helix.unpublishPages).toHaveBeenCalledWith(
            'acme',
            'storefront',
            'main',
            ['/index', '/products/shirt'],
        );
        expect(helix.unpublishPages.mock.invocationCallOrder[0]).toBeLessThan(
            content.deleteAllSiteContent.mock.invocationCallOrder[0],
        );
        expect(result).toEqual({
            unpublishedPages: 2,
            stillPublished: false,
            publishState: 'down',
            publishSummary: expect.stringContaining('main--storefront--acme.aem.live'),
            contentDeleted: true,
            deletedCount: 7,
            error: undefined,
            productPages: expect.objectContaining({ status: 'removed', found: 2 }),
        });
    });

    it('clears the site permissions and config last', async () => {
        const { deps, content } = depsWith();

        await tearDownStorefront(SITE, deps);

        expect(removeSitePermissions).toHaveBeenCalledWith('acme', 'shop');
        expect(deleteSiteConfig).toHaveBeenCalledWith('acme', 'shop');
        expect(content.deleteAllSiteContent.mock.invocationCallOrder[0]).toBeLessThan(
            removeSitePermissions.mock.invocationCallOrder[0],
        );
    });

    // A storefront half-torn-down is worse than one fully torn down, so a failed
    // unpublish must not stop the source deletion.
    it('still deletes the source when the unpublish fails, and says it is still live', async () => {
        const helix = helixFake({
            unpublishPages: jest.fn().mockResolvedValue({
                success: false,
                count: 0,
                total: 2,
                liveFailed: 2,
                previewFailed: 0,
            }),
        });
        const { deps, content } = depsWith(helix);

        const result = await tearDownStorefront(SITE, deps);

        expect(content.deleteAllSiteContent).toHaveBeenCalled();
        expect(result.stillPublished).toBe(true);
        expect(result.contentDeleted).toBe(true);
    });

    it('narrates each step for a caller that is showing progress', async () => {
        const steps: string[] = [];
        const { deps } = depsWith(helixFake(), contentFake(), (step) => steps.push(step));

        await tearDownStorefront(SITE, deps);

        expect(steps).toEqual([
            'Taking the pages off the CDN',
            'Removing the product pages',
            'Deleting the DA.live content',
            'Clearing the site settings',
        ]);
    });
});

// Product pages are published through the overlay and have no DA.live document, so the
// DA.live listing above never names them (EDS-26).
describe('the product pages the overlay published', () => {
    it('are listed from Helix by owner/repo and removed, after the DA.live pages and before the source', async () => {
        const { deps, helix, content } = depsWith();

        const result = await tearDownStorefront(SITE, deps);

        expect(helix.listPublishedPaths).toHaveBeenCalledWith('acme', 'storefront', 'main', '/products/*');
        expect(helix.unpublishPages).toHaveBeenCalledTimes(2);
        expect(helix.unpublishPages).toHaveBeenNthCalledWith(2, 'acme', 'storefront', 'main', [
            '/products/drum/dc-100',
            '/products/sign/es-2',
        ]);
        expect(helix.unpublishPages.mock.invocationCallOrder[1]).toBeLessThan(
            content.deleteAllSiteContent.mock.invocationCallOrder[0],
        );
        expect(helix.unpublishPages.mock.invocationCallOrder[1]).toBeLessThan(
            helix.deleteAdminApiKey.mock.invocationCallOrder[0],
        );
        expect(result.productPages?.summary).toBe('Removed 2 product pages from acme/storefront, live and preview.');
    });

    it('are left alone, with the reason, when another project publishes to the same repository', async () => {
        const { deps, helix } = depsWith();
        deps.otherProjectsOnRepo.mockResolvedValue(['Other Demo']);

        const result = await tearDownStorefront(SITE, deps);

        expect(deps.otherProjectsOnRepo).toHaveBeenCalledWith('acme/storefront');
        expect(helix.listPublishedPaths).not.toHaveBeenCalledWith('acme', 'storefront', 'main', '/products/*');
        expect(helix.unpublishPages).toHaveBeenCalledTimes(1);
        expect(result.productPages).toMatchObject({ status: 'refused' });
        expect(result.productPages?.summary).toContain('"Other Demo" also publishes to acme/storefront');
    });

    it('a listing Helix refuses does not stop the teardown, and is not reported as clean', async () => {
        const helix = helixFake({ listPublishedPaths: jest.fn().mockRejectedValue(new Error('HTTP 401')) });
        const { deps, content } = depsWith(helix);

        const result = await tearDownStorefront(SITE, deps);

        expect(content.deleteAllSiteContent).toHaveBeenCalled();
        expect(result.productPages).toMatchObject({ status: 'failed' });
        expect(result.productPages?.summary).toContain('may still be live');
    });

    it('says the preview copies remain when Helix refuses to remove them', async () => {
        const helix = helixFake();
        helix.unpublishPages
            .mockResolvedValueOnce({ success: true, count: 2, total: 2, liveFailed: 0, previewFailed: 0 })
            .mockResolvedValueOnce({ success: true, count: 2, total: 2, liveFailed: 0, previewFailed: 2 });
        const { deps } = depsWith(helix);

        const result = await tearDownStorefront(SITE, deps);

        expect(result.productPages).toMatchObject({ status: 'live-only' });
        expect(result.productPages?.summary).toContain('those preview copies remain');
    });
});

// EDS-33, measured 2026-10-09: a site whose DA.live content was already gone listed
// nothing, unpublished nothing, and answered stillPublished:false while all 174 of its
// pages kept answering 200 at aem.live. What is published is Helix's record, not DA.live's.
describe('what is published comes from Helix, not from DA.live', () => {
    it('unpublishes what Helix lists when the DA.live content is already gone', async () => {
        const helix = helixFake({
            listAllPages: jest.fn<Promise<string[]>, [string, string, string?]>().mockResolvedValue([]),
            listPublishedPaths: jest
                .fn<Promise<string[]>, [string, string, string, string]>()
                .mockImplementation(async (_o, _s, _b, pattern) =>
                    pattern === '/*' ? ['/', '/about', '/nav', '/products/drum/dc-100'] : ['/products/drum/dc-100'],
                ),
        });
        const { deps } = depsWith(helix);

        const result = await tearDownStorefront(SITE, deps);

        // Asked by the GitHub owner/repo Helix is keyed on, for the whole site.
        expect(helix.listPublishedPaths).toHaveBeenCalledWith('acme', 'storefront', 'main', '/*');
        // The generated product page is left to the product-page removal, which
        // refuses on a shared repository; everything else goes here.
        expect(helix.unpublishPages).toHaveBeenNthCalledWith(1, 'acme', 'storefront', 'main', [
            '/',
            '/about',
            '/nav',
        ]);
        expect(helix.unpublishPages).toHaveBeenNthCalledWith(2, 'acme', 'storefront', 'main', [
            '/products/drum/dc-100',
        ]);
        expect(result.unpublishedPages).toBe(3);
        expect(result.stillPublished).toBe(false);
        expect(result.publishState).toBe('down');
    });

    it('unpublishes the union when both lists can be read, DA.live first', async () => {
        const helix = helixFake({
            listAllPages: jest.fn<Promise<string[]>, [string, string, string?]>().mockResolvedValue(['/', '/about']),
            listPublishedPaths: jest
                .fn<Promise<string[]>, [string, string, string, string]>()
                .mockImplementation(async (_o, _s, _b, pattern) => (pattern === '/*' ? ['/', '/old-page'] : [])),
        });
        const { deps } = depsWith(helix);

        await tearDownStorefront(SITE, deps);

        expect(helix.listAllPages).toHaveBeenCalledWith('acme', 'shop');
        expect(helix.unpublishPages).toHaveBeenNthCalledWith(1, 'acme', 'storefront', 'main', [
            '/',
            '/about',
            '/old-page',
        ]);
    });

    it('falls back to the DA.live list when Helix cannot be read, and says so', async () => {
        const helix = helixFake({
            listPublishedPaths: jest
                .fn<Promise<string[]>, [string, string, string, string]>()
                .mockRejectedValue(new Error('Helix refused to list the published pages (HTTP 401)')),
        });
        const { deps } = depsWith(helix);

        const result = await tearDownStorefront(SITE, deps);

        expect(helix.unpublishPages).toHaveBeenNthCalledWith(1, 'acme', 'storefront', 'main', [
            '/index',
            '/products/shirt',
        ]);
        expect(result.publishSummary).toContain('HTTP 401');
    });
});

describe('the answer about whether the site is down', () => {
    it('checks the live host after unpublishing: the home page and the first pages it unpublished', async () => {
        const { deps, helix } = depsWith();

        await tearDownStorefront(SITE, deps);

        expect(deps.checkLive).toHaveBeenCalledWith(`${LIVE_HOST}/`);
        expect(deps.checkLive).toHaveBeenCalledWith(`${LIVE_HOST}/index`);
        expect(deps.checkLive).toHaveBeenCalledWith(`${LIVE_HOST}/products/shirt`);
        expect(deps.checkLive.mock.invocationCallOrder[0]).toBeGreaterThan(
            helix.unpublishPages.mock.invocationCallOrder[0],
        );
    });

    it('is still published, naming the page, when a checked page still answers', async () => {
        const { deps } = depsWith();
        deps.checkLive = liveCheck({ [`${LIVE_HOST}/`]: 200 });

        const result = await tearDownStorefront(SITE, deps);

        expect(result.stillPublished).toBe(true);
        expect(result.publishState).toBe('still-live');
        expect(result.publishSummary).toContain('/');
        expect(result.publishSummary).toContain('still answer');
    });

    it('is never false when the check got no answer: it says it could not tell', async () => {
        const { deps } = depsWith();
        deps.checkLive = liveCheck({}, 0);

        const result = await tearDownStorefront(SITE, deps);

        expect(result.stillPublished).toBe(true);
        expect(result.publishState).toBe('unknown');
        expect(result.publishSummary).toContain('Could not tell');
    });

    it('is never false when neither Helix nor DA.live could list anything', async () => {
        const helix = helixFake({
            listAllPages: jest.fn<Promise<string[]>, [string, string, string?]>().mockResolvedValue([]),
            listPublishedPaths: jest
                .fn<Promise<string[]>, [string, string, string, string]>()
                .mockRejectedValue(new Error('HTTP 401')),
        });
        const { deps } = depsWith(helix);

        const result = await tearDownStorefront(SITE, deps);

        expect(result.stillPublished).toBe(true);
        expect(result.publishState).toBe('unknown');
        expect(result.publishSummary).toContain('Could not tell');
    });

    it('is still published when some live copies could not be removed, even if the checked ones are gone', async () => {
        const helix = helixFake();
        helix.unpublishPages.mockResolvedValueOnce({ success: true, count: 1, total: 2, liveFailed: 1, previewFailed: 0 });
        const { deps } = depsWith(helix);

        const result = await tearDownStorefront(SITE, deps);

        expect(result.stillPublished).toBe(true);
        expect(result.publishState).toBe('still-live');
        expect(result.publishSummary).toContain('1 of 2');
    });
});

describe('with no repo', () => {
    it('deletes the source, touches no CDN, and reports the site as still published', async () => {
        const { deps, helix, content } = depsWith();

        const result = await tearDownStorefront({ daLiveOrg: 'acme', daLiveSite: 'shop' }, deps);

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(helix.listPublishedPaths).not.toHaveBeenCalled();
        expect(content.deleteAllSiteContent).toHaveBeenCalledWith('acme', 'shop');
        expect(result.stillPublished).toBe(true);
        expect(result.publishState).toBe('unknown');
        expect(result.publishSummary).toContain('No GitHub repository');
        expect(result.unpublishedPages).toBeUndefined();
        expect(deps.checkLive).not.toHaveBeenCalled();
    });
});

// The agent surface maps an org mismatch to a typed, non-retryable answer. A
// teardown that turned it into a message string took that away (2026-09-19).
describe('a content deletion that throws', () => {
    it('lets the error through to the caller, as itself', async () => {
        const content = contentFake({
            deleteAllSiteContent: jest.fn().mockRejectedValue(new Error('ORG_MISMATCH')),
        });
        const { deps } = depsWith(helixFake(), content);

        await expect(tearDownStorefront(SITE, deps)).rejects.toThrow('ORG_MISMATCH');
    });
});
