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
            'Deleting the DA.live content',
            'Clearing the site settings',
        ]);
    });
});

describe('with no repo', () => {
    it('deletes the source, touches no CDN, and reports the site as still published', async () => {
        const { deps, helix, content } = depsWith();

        const result = await tearDownStorefront({ daLiveOrg: 'acme', daLiveSite: 'shop' }, deps);

        expect(helix.unpublishPages).not.toHaveBeenCalled();
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
