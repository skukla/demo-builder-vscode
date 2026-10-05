/**
 * "Manage DA.live Sites" takes each site down through the shared teardown (EDS-31).
 *
 * The command used to delete a site's DA.live content alone, so every published
 * page stayed live on aem.live with no source behind it. What these pin is the
 * repository each site is unpublished against — the local project's record, else
 * the same-named repository — and that a site whose pages may still be live is
 * never counted as cleanly gone.
 */

import {
    deleteDaLiveSites,
    repoForSite,
} from '@/features/eds/commands/cleanupDaLiveSites';
import type { StorefrontTeardownResult } from '@/features/eds/services/storefront/storefrontTeardown';
import { createMockLogger } from '../../../helpers/loggerFake';

const CLEAN: StorefrontTeardownResult = {
    stillPublished: false,
    unpublishedPages: 12,
    contentDeleted: true,
    deletedCount: 30,
    productPages: { status: 'removed', found: 4, liveRemoved: 4, previewRemoved: 4, summary: 'Removed 4 product pages.' },
};

describe('repoForSite', () => {
    it("uses the local project's repository when one uses the site", () => {
        expect(repoForSite('acme', 'store', new Map([['store', 'someone/renamed-repo']]))).toBe(
            'someone/renamed-repo',
        );
    });

    it('falls back to the same-named repository in the same namespace', () => {
        expect(repoForSite('acme', 'store', new Map())).toBe('acme/store');
    });
});

describe('deleteDaLiveSites', () => {
    it('tears each site down against its repository, in order', async () => {
        const tearDown = jest.fn().mockResolvedValue(CLEAN);

        const outcome = await deleteDaLiveSites('acme', ['linked', 'orphan'], new Map([['linked', 'acme/linked-repo']]), {
            logger: createMockLogger(),
            tearDown,
        });

        expect(tearDown.mock.calls).toEqual([
            [{ daLiveOrg: 'acme', daLiveSite: 'linked', githubRepo: 'acme/linked-repo' }],
            [{ daLiveOrg: 'acme', daLiveSite: 'orphan', githubRepo: 'acme/orphan' }],
        ]);
        expect(outcome).toEqual({ deleted: ['linked', 'orphan'], failed: [], stillLive: [] });
    });

    it('counts a site whose unpublish failed as deleted but still live', async () => {
        const tearDown = jest.fn().mockResolvedValue({ ...CLEAN, stillPublished: true, unpublishedPages: 0 });

        const outcome = await deleteDaLiveSites('acme', ['store'], new Map(), {
            logger: createMockLogger(),
            tearDown,
        });

        expect(outcome).toEqual({ deleted: ['store'], failed: [], stillLive: ['store'] });
    });

    it.each(['incomplete', 'refused', 'failed'] as const)(
        'counts product pages left %s as still live',
        async (status) => {
            const tearDown = jest.fn().mockResolvedValue({
                ...CLEAN,
                productPages: { status, found: 3, liveRemoved: 0, previewRemoved: 0, summary: 'Left alone.' },
            });

            const outcome = await deleteDaLiveSites('acme', ['store'], new Map(), {
                logger: createMockLogger(),
                tearDown,
            });

            expect(outcome.stillLive).toEqual(['store']);
        },
    );

    it.each(['removed', 'live-only', 'nothing'] as const)('treats product pages %s as off the live site', async (status) => {
        const tearDown = jest.fn().mockResolvedValue({
            ...CLEAN,
            productPages: { status, found: 0, liveRemoved: 0, previewRemoved: 0, summary: '' },
        });

        const outcome = await deleteDaLiveSites('acme', ['store'], new Map(), {
            logger: createMockLogger(),
            tearDown,
        });

        expect(outcome.stillLive).toStrictEqual([]);
    });

    it('reports a site whose content was not deleted as failed, and carries on', async () => {
        const tearDown = jest
            .fn()
            .mockResolvedValueOnce({ ...CLEAN, contentDeleted: false, error: 'DA.live said no' })
            .mockRejectedValueOnce(new Error('org mismatch'))
            .mockResolvedValueOnce(CLEAN);

        const outcome = await deleteDaLiveSites('acme', ['a', 'b', 'c'], new Map(), {
            logger: createMockLogger(),
            tearDown,
        });

        expect(outcome).toEqual({
            deleted: ['c'],
            failed: [
                { site: 'a', error: 'DA.live said no' },
                { site: 'b', error: 'org mismatch' },
            ],
            stillLive: [],
        });
    });

    it('reports progress per site', async () => {
        const onSite = jest.fn();

        await deleteDaLiveSites('acme', ['a', 'b'], new Map(), {
            logger: createMockLogger(),
            tearDown: jest.fn().mockResolvedValue(CLEAN),
            onSite,
        });

        expect(onSite.mock.calls).toEqual([
            [0, 'a'],
            [1, 'b'],
        ]);
    });
});
