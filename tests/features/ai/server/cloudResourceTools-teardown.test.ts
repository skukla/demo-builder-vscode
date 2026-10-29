/**
 * `cleanup_dalive_site` and the shared storefront teardown it hands the work to.
 *
 * The sibling suites run the REAL teardown with no GitHub repo, which is the one
 * shape that never reaches Helix. Everything the tool passes for the other shape —
 * the repo, the key store, the "who else publishes to this repo" question — went
 * unasserted, and a mock answers the same however it is called. So here the
 * teardown is the recorder and its ARGUMENTS are the subject: a tool that dropped
 * the repo would leave a storefront serving and still report a finished cleanup.
 *
 * This spec declares three mocks of its own, above the import of the family's
 * harness. They hoist above that import, so the subject (which the harness loads)
 * binds to them.
 */

jest.mock('@/features/eds/services/storefront/storefrontTeardown', () => ({
    tearDownStorefront: jest.fn(),
}));
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: { initKeyStore: jest.fn(async () => undefined) },
}));
jest.mock('@/features/eds/services/storefront/sharedRepoProjects', () => ({
    projectsSharingRepo: jest.fn(async () => ['Other Demo']),
}));

import {
    ctxFactory,
    DaLiveOrgOperations,
    fakeServer,
    mockDeleteAllSiteContent,
    registerCloudResourceTools,
    resetCloudResourceMocks,
} from './cloudResourceTools.testUtils';
import { HelixService } from '@/features/eds/services/helix/helixService';
import { projectsSharingRepo } from '@/features/eds/services/storefront/sharedRepoProjects';
import {
    tearDownStorefront,
    type StorefrontTeardownDeps,
    type StorefrontTeardownResult,
    type StorefrontTeardownTarget,
} from '@/features/eds/services/storefront/storefrontTeardown';

const tearDown = tearDownStorefront as jest.MockedFunction<typeof tearDownStorefront>;

/** A teardown that took everything down. Typed to the real result, so a drift fails here. */
const DOWN: StorefrontTeardownResult = {
    contentDeleted: true,
    deletedCount: 7,
    unpublishedPages: 12,
    stillPublished: false,
    publishState: 'down',
    publishSummary: 'The pages are off the CDN.',
};

const CONFIRMED = { org: 'acme', site: 'shop', confirm: true, confirmName: 'acme/shop' };

/** One context for the whole call, so what the teardown was handed can be compared to it. */
function registered() {
    const ctx = ctxFactory();
    const server = fakeServer();
    registerCloudResourceTools(server, () => ctx);
    return { ctx, server };
}

/** The target and deps the single teardown call received. */
function handedToTeardown(): [StorefrontTeardownTarget, StorefrontTeardownDeps] {
    expect(tearDown).toHaveBeenCalledTimes(1);
    return tearDown.mock.calls[0];
}

beforeEach(() => {
    resetCloudResourceMocks();
    tearDown.mockResolvedValue(DOWN);
});

describe('cleanup_dalive_site — what the teardown is handed', () => {
    it('names the site and the GitHub repo the unpublish is addressed by', async () => {
        const { server } = registered();

        await server.call('cleanup_dalive_site', {
            ...CONFIRMED,
            githubRepo: 'acme/shop-storefront',
        });

        expect(handedToTeardown()[0]).toStrictEqual({
            daLiveOrg: 'acme',
            daLiveSite: 'shop',
            githubRepo: 'acme/shop-storefront',
        });
    });

    it('names no repo when none was given', async () => {
        const { server } = registered();

        await server.call('cleanup_dalive_site', CONFIRMED);

        expect(handedToTeardown()[0]).toStrictEqual({
            daLiveOrg: 'acme',
            daLiveSite: 'shop',
            githubRepo: undefined,
        });
    });

    it('hands on the token provider the DA.live operations were built on, and its own logger', async () => {
        const { ctx, server } = registered();

        await server.call('cleanup_dalive_site', CONFIRMED);

        const [, deps] = handedToTeardown();
        expect(deps.tokenProvider).toBe((DaLiveOrgOperations as jest.Mock).mock.calls[0][0]);
        expect(deps.logger).toBe(ctx.logger);
    });

    // The unpublish needs the Helix admin key loaded, from THIS extension's stores.
    it('loads the Helix key store from the extension’s own secrets and global state', async () => {
        const { ctx, server } = registered();
        await server.call('cleanup_dalive_site', CONFIRMED);

        await handedToTeardown()[1].initKeyStore();

        expect((HelixService.initKeyStore as jest.Mock).mock.calls).toStrictEqual([
            [ctx.context.secrets, ctx.context.globalState],
        ]);
    });

    it('deletes the source through the content operations it built', async () => {
        const { ctx, server } = registered();
        await server.call('cleanup_dalive_site', CONFIRMED);
        const [, deps] = handedToTeardown();

        const contentOps = deps.makeContentOps!(deps.tokenProvider, ctx.logger);

        expect(contentOps.deleteAllSiteContent).toBe(mockDeleteAllSiteContent);
    });

    // A site, not a project, is being acted on (EDS-26): every local project on
    // the repo is someone else's, and the answer decides whether product pages go.
    it('asks which local projects publish to the repo, against its own state', async () => {
        const { ctx, server } = registered();
        await server.call('cleanup_dalive_site', CONFIRMED);

        const others = await handedToTeardown()[1].otherProjectsOnRepo('acme/shop-storefront');

        expect(others).toStrictEqual(['Other Demo']);
        expect((projectsSharingRepo as jest.Mock).mock.calls).toStrictEqual([
            [ctx.stateManager, 'acme/shop-storefront'],
        ]);
    });
});

describe('cleanup_dalive_site — what it answers from the teardown’s result', () => {
    it('reports every part of a finished teardown, product pages included', async () => {
        tearDown.mockResolvedValue({
            ...DOWN,
            productPages: {
                status: 'removed',
                found: 3,
                liveRemoved: 3,
                previewRemoved: 3,
                summary: 'Removed 3 product pages.',
            },
        });
        const { server } = registered();

        const res = await server.call('cleanup_dalive_site', {
            ...CONFIRMED,
            githubRepo: 'acme/shop-storefront',
        });

        expect(res).toStrictEqual({
            deleted: true,
            site: 'acme/shop',
            deletedCount: 7,
            unpublishedPages: 12,
            stillPublished: false,
            publishState: 'down',
            publishSummary: 'The pages are off the CDN.',
            productPages: 'Removed 3 product pages.',
        });
    });

    it('says nothing about product pages when the teardown reported none', async () => {
        const { server } = registered();

        const res = await server.call('cleanup_dalive_site', {
            ...CONFIRMED,
            githubRepo: 'acme/shop-storefront',
        });

        expect(res).not.toHaveProperty('productPages');
    });

    // The note tells the agent to call again WITH the repo. Given a repo already,
    // or pages that are already down, it would be advice that changes nothing.
    it('does not suggest passing the repo when the repo was passed and pages are still live', async () => {
        tearDown.mockResolvedValue({
            ...DOWN,
            stillPublished: true,
            publishState: 'still-live',
            publishSummary: 'Some pages still answer.',
        });
        const { server } = registered();

        const res = await server.call('cleanup_dalive_site', {
            ...CONFIRMED,
            githubRepo: 'acme/shop-storefront',
        });

        expect(res.stillPublished).toBe(true);
        expect(res).not.toHaveProperty('note');
    });

    it('does not suggest passing the repo when nothing is still published', async () => {
        const { server } = registered();

        const res = await server.call('cleanup_dalive_site', CONFIRMED);

        expect(res.stillPublished).toBe(false);
        expect(res).not.toHaveProperty('note');
    });

    it('control: suggests the repo when pages are still live and none was passed', async () => {
        tearDown.mockResolvedValue({ ...DOWN, stillPublished: true, publishState: 'unknown' });
        const { server } = registered();

        const res = await server.call('cleanup_dalive_site', CONFIRMED);

        expect(res.note).toContain('githubRepo:"owner/repo"');
    });

    it('passes on the teardown’s own error', async () => {
        tearDown.mockResolvedValue({
            ...DOWN,
            contentDeleted: false,
            error: 'DA.live answered 500',
        });
        const { server } = registered();

        const res = await server.call('cleanup_dalive_site', CONFIRMED);

        expect(res).toMatchObject({ deleted: false, error: 'DA.live answered 500' });
    });
});
