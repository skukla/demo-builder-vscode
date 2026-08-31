/**
 * The block library publishes PAGE BY PAGE, because the bulk API will not take it.
 *
 * MEASURED against a live site (skukla/team-bodea-demo, 2026-08-18), not reasoned:
 *
 *   bulk, relative paths   ~78 paths, job reports success, 0 previewed
 *   bulk, ABSOLUTE paths   ~78 paths, job reports success, 0 previewed
 *   single page, `/.da/library/blocks/text`    404 -> 200
 *   single page, `.da/library/blocks/cards`    404 -> 200  (endpoint adds the slash itself)
 *
 * The leading slash was the first hypothesis and the spike killed it: the bulk
 * endpoint accepts these paths, creates a job, polls clean — `data.resources`
 * comes back with nothing failed, because it comes back with nothing at all — and
 * publishes none of them. Whatever the reason (`.`-prefixed paths look hidden to
 * the job), no amount of fixing the paths reaches it.
 *
 * The single-page endpoint publishes them fine, twice out of twice. So the
 * library uses that one. Paths are still normalised to absolute, because the
 * producer's shape should be right whichever endpoint consumes it.
 */

jest.mock('vscode', () => ({ window: {}, workspace: { getConfiguration: () => ({ get: () => undefined }) } }), {
    virtual: true,
});

import {
    publishLibraryPaths,
    verifyLibraryPreviewed,
} from '@/features/eds/handlers/blockLibraryPublish';
import type { HelixService } from '@/features/eds/services/helix/helixService';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

const logger = createMockLogger() as unknown as Logger;

function makeHelix() {
    return {
        previewAllContent: jest.fn().mockResolvedValue(undefined),
        publishAllContent: jest.fn().mockResolvedValue(undefined),
        previewAndPublishPage: jest.fn().mockResolvedValue(undefined),
    } as unknown as HelixService & {
        previewAllContent: jest.Mock;
        publishAllContent: jest.Mock;
        previewAndPublishPage: jest.Mock;
    };
}

beforeEach(() => jest.clearAllMocks());

describe('publishLibraryPaths', () => {
    it('publishes each path individually — the bulk endpoint drops these', async () => {
        const helix = makeHelix();

        await publishLibraryPaths(
            helix, 'owner', 'repo',
            ['/.da/library/blocks.json', '/.da/library/blocks/text'],
            logger,
        );

        expect(helix.previewAndPublishPage).toHaveBeenCalledWith(
            'owner', 'repo', '/.da/library/blocks.json',
        );
        expect(helix.previewAndPublishPage).toHaveBeenCalledWith(
            'owner', 'repo', '/.da/library/blocks/text',
        );
        expect(helix.previewAllContent).not.toHaveBeenCalled();
    });

    it('adds the leading slash a relative path is missing', async () => {
        const helix = makeHelix();

        await publishLibraryPaths(helix, 'owner', 'repo', ['.da/library/blocks/text'], logger);

        expect(helix.previewAndPublishPage).toHaveBeenCalledWith(
            'owner', 'repo', '/.da/library/blocks/text',
        );
    });

    it('one failing page does not abandon the rest', async () => {
        // A single missing doc page must not cost the other 77 blocks their
        // preview — the palette degrades block by block.
        const helix = makeHelix();
        helix.previewAndPublishPage
            .mockRejectedValueOnce(new Error('404'))
            .mockResolvedValue(undefined);

        const result = await publishLibraryPaths(
            helix, 'owner', 'repo', ['/a', '/b', '/c'], logger,
        );

        expect(helix.previewAndPublishPage).toHaveBeenCalledTimes(3);
        expect(result).toEqual({ published: 2, failed: 1 });
    });

    it('reports what it dropped rather than logging a bare success', async () => {
        const helix = makeHelix();
        helix.previewAndPublishPage.mockRejectedValue(new Error('403'));

        await publishLibraryPaths(helix, 'owner', 'repo', ['/a'], logger);

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('1'));
    });

    it('does not call the admin API at all for an empty list', async () => {
        const helix = makeHelix();

        await publishLibraryPaths(helix, 'owner', 'repo', [], logger);

        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
    });
});

/**
 * A publish that reports success is not evidence the library works.
 *
 * That is how this shipped: the bulk job accepted paths that matched nothing,
 * returned success, and the only log line said the library was published. The
 * palette said otherwise, and nothing in between ever looked.
 *
 * One HEAD against the preview CDN is the whole check — the same host DA.live's
 * Insert-block modal resolves before it renders a block.
 */
describe('verifyLibraryPreviewed', () => {
    const fetchMock = jest.fn();
    const originalFetch = global.fetch;

    beforeAll(() => {
        global.fetch = fetchMock as unknown as typeof fetch;
    });
    afterAll(() => {
        global.fetch = originalFetch;
    });
    beforeEach(() => fetchMock.mockReset());

    it('asks the preview CDN for the sheet the palette actually reads', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await verifyLibraryPreviewed('skukla', 'team-bodea-demo', logger);

        expect(fetchMock).toHaveBeenCalledWith(
            'https://main--team-bodea-demo--skukla.aem.page/.da/library/blocks.json',
            expect.objectContaining({ method: 'HEAD' }),
        );
    });

    it('returns true when the library is previewed', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 });

        await expect(verifyLibraryPreviewed('o', 'r', logger)).resolves.toBe(true);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('warns in words an author can act on when it is not', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 404 });

        await expect(verifyLibraryPreviewed('o', 'r', logger)).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not previewed'));
    });

    it('reports unverified rather than throwing when the CDN is unreachable', async () => {
        // A network blip must not fail a creation whose library may be fine.
        fetchMock.mockRejectedValue(new Error('ENOTFOUND'));

        await expect(verifyLibraryPreviewed('o', 'r', logger)).resolves.toBe(false);
    });
});
