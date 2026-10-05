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

import { tearDownStorefront } from '@/features/eds/services/storefront/storefrontTeardown';
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

function helixFake(overrides: Record<string, unknown> = {}) {
    return {
        listAllPages: jest.fn().mockResolvedValue(['/index', '/products/shirt']),
        unpublishPages: jest.fn().mockResolvedValue({
            success: true,
            count: 2,
            total: 2,
            liveFailed: 0,
            previewFailed: 0,
        }),
        deleteAdminApiKey: jest.fn().mockResolvedValue({ success: true }),
        // What Helix says the site has published under /products (EDS-26): two pages
        // made through the overlay, and the authored one DA.live also lists.
        listPublishedPaths: jest
            .fn()
            .mockResolvedValue(['/products/drum/dc-100', '/products/sign/es-2', '/products/shirt']),
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

function depsWith(helix = helixFake(), content = contentFake(), onStep?: (s: string) => void) {
    return {
        deps: {
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
        expect(helix.listPublishedPaths).not.toHaveBeenCalled();
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

describe('with no repo', () => {
    it('deletes the source, touches no CDN, and reports the site as still published', async () => {
        const { deps, helix, content } = depsWith();

        const result = await tearDownStorefront({ daLiveOrg: 'acme', daLiveSite: 'shop' }, deps);

        expect(helix.unpublishPages).not.toHaveBeenCalled();
        expect(helix.listPublishedPaths).not.toHaveBeenCalled();
        expect(content.deleteAllSiteContent).toHaveBeenCalledWith('acme', 'shop');
        expect(result.stillPublished).toBe(true);
        expect(result.unpublishedPages).toBeUndefined();
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
