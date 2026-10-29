/**
 * Smart 404 handler installer — the parts outside `404.html`.
 *
 * Since 2026-10-29 the recovery script lives inline in the code's `404.html`, which
 * `bringStorefrontUpToDate` writes once with everything it needs (`pdp404Page.ts` places
 * the block). The publisher's share:
 *  - `prepareSmart404Handler`: build this storefront's script (trigger URL, org, site), or
 *    say why there is none; and keep the eager script in `head.html` current;
 *  - `retireDelayedJsHandler`: take Demo Builder's old copy out of `scripts/delayed.js`
 *    once the one in `404.html` is in place, so the script never runs twice. Adobe's B2B
 *    template has no `delayed.js` at all (removed 2026-07-30), and that is not a failure.
 *
 * Non-fatal at every step: a failure is logged and answered, never thrown.
 */

import { prepareSmart404Handler, retireDelayedJsHandler } from '@/features/eds/services/pdp/pdp404HandlerPublisher';
import { buildSmart404Snippet, SMART_404_MARKER_START } from '@/features/eds/services/pdp/pdp404Snippet';

import {
    daLiveOrg,
    daLiveSite,
    makePdp404Github,
    mockLogger,
    overlayUrl,
    repoName,
    repoOwner,
    type GithubFake,
} from './pdp404HandlerPublisher.testUtils';

const TRIGGER = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp';
const DELAYED = '// Existing delayed.js contents\nexport default {};\n';
const OLD_HANDLER = buildSmart404Snippet('https://old.example/prepublish-pdp', 'kmanns', 'justrite');

describe('prepareSmart404Handler', () => {
    let gh: GithubFake;

    beforeEach(() => {
        jest.clearAllMocks();
        gh = makePdp404Github();
    });

    it("builds this storefront's script against the action beside the overlay", async () => {
        const prepared = await prepareSmart404Handler(gh, repoOwner, repoName, overlayUrl, mockLogger, daLiveOrg, daLiveSite);

        expect(prepared).toEqual({ handler: buildSmart404Snippet(TRIGGER, daLiveOrg, daLiveSite) });
    });

    it('writes nothing to scripts/delayed.js: the script no longer goes there', async () => {
        await prepareSmart404Handler(gh, repoOwner, repoName, overlayUrl, mockLogger, daLiveOrg, daLiveSite);

        expect(gh.getFileContent).not.toHaveBeenCalledWith(repoOwner, repoName, 'scripts/delayed.js');
        expect(gh.createOrUpdateFile.mock.calls.map((c) => c[2])).toEqual(['head.html']);
    });

    it('has no script when BYOM is off, and touches nothing', async () => {
        const prepared = await prepareSmart404Handler(gh, repoOwner, repoName, undefined, mockLogger, daLiveOrg, daLiveSite);

        expect(prepared).toEqual({ installed: false, reason: 'BYOM disabled' });
        expect(gh.getFileContent).not.toHaveBeenCalled();
        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('has no script for an overlay URL it cannot derive the action from', async () => {
        for (const bad of ['not a url', 'https://example.com/api/v1/web/accs-discovery/discover-stores']) {
            const prepared = await prepareSmart404Handler(gh, repoOwner, repoName, bad, mockLogger, daLiveOrg, daLiveSite);
            expect(prepared).toEqual({ installed: false, reason: 'invalid overlay URL' });
        }
        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('still has the script when head.html cannot take the eager script', async () => {
        gh.createOrUpdateFile.mockRejectedValue(new Error('head.html conflict'));

        const prepared = await prepareSmart404Handler(gh, repoOwner, repoName, overlayUrl, mockLogger, daLiveOrg, daLiveSite);

        expect(prepared).toHaveProperty('handler');
    });

    it('URL-encodes org and site into the script', async () => {
        const prepared = await prepareSmart404Handler(gh, repoOwner, repoName, overlayUrl, mockLogger, 'my org', 'a/b');

        expect('handler' in prepared && prepared.handler).toContain('org=my%20org&site=a%2Fb');
    });
});

/**
 * The stale-SHA retry is kept from the delayed.js install it replaced. Inspector Tagging
 * writes `scripts/delayed.js` in the block install's Git Tree commit just before this
 * runs, and the Contents API can serve the file from before that commit: a live run lost
 * that race 18 seconds after the tree commit (2026-08). Re-reading and retrying once
 * covers both the staleness and a genuine interleaving.
 */
describe('retireDelayedJsHandler', () => {
    const SHA_MISMATCH = 'scripts/delayed.js does not match 15be5fb9e97773471ea4124c259d6d1e2eeb2626';

    /** A storefront whose delayed.js reads as each of `reads` in turn (the last repeats). */
    function github(reads: Array<{ content: string; sha: string } | null>): GithubFake {
        let read = 0;
        const gh = makePdp404Github();
        gh.getFileContent.mockImplementation(() => {
            const file = reads[Math.min(read, reads.length - 1)];
            read += 1;
            return Promise.resolve(file);
        });
        return gh;
    }

    const delayedWrites = (gh: GithubFake) => gh.createOrUpdateFile.mock.calls.filter((c) => c[2] === 'scripts/delayed.js');

    beforeEach(() => jest.clearAllMocks());

    it("takes Demo Builder's old copy out, leaving the rest of the file as it was", async () => {
        const gh = github([{ content: DELAYED + OLD_HANDLER, sha: 'd-sha' }]);

        await expect(retireDelayedJsHandler(gh, repoOwner, repoName, mockLogger)).resolves.toBe(true);

        expect(delayedWrites(gh)).toHaveLength(1);
        expect(delayedWrites(gh)[0][3]).toBe(DELAYED);
        expect(delayedWrites(gh)[0][5]).toBe('d-sha');
    });

    it('does nothing where there is no delayed.js (the B2B template) or no copy in it', async () => {
        for (const file of [null, { content: DELAYED, sha: 'd-sha' }]) {
            const gh = github([file]);
            await expect(retireDelayedJsHandler(gh, repoOwner, repoName, mockLogger)).resolves.toBe(true);
            expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
        }
    });

    it('leaves a copy with no end marker alone: where it ends would be a guess', async () => {
        const gh = github([{ content: `${DELAYED}\n${SMART_404_MARKER_START}\n(function () {}());\n`, sha: 'd-sha' }]);

        await expect(retireDelayedJsHandler(gh, repoOwner, repoName, mockLogger)).resolves.toBe(true);

        expect(gh.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('answers false, never throws, when the write is refused: the old copy still runs', async () => {
        const gh = github([{ content: DELAYED + OLD_HANDLER, sha: 'd-sha' }]);
        gh.createOrUpdateFile.mockRejectedValue(new Error('Resource not accessible by integration'));

        await expect(retireDelayedJsHandler(gh, repoOwner, repoName, mockLogger)).resolves.toBe(false);
        // Not a SHA mismatch: no retry.
        expect(delayedWrites(gh)).toHaveLength(1);
    });

    it('answers false, never throws, when delayed.js cannot be read', async () => {
        const gh = makePdp404Github();
        gh.getFileContent.mockRejectedValue(new Error('rate limited'));

        await expect(retireDelayedJsHandler(gh, repoOwner, repoName, mockLogger)).resolves.toBe(false);
    });

    it('re-reads and retries once on a stale SHA, from the file it just read', async () => {
        const fresh = `${DELAYED}import './inspector.js';\n${OLD_HANDLER}`;
        const gh = github([{ content: DELAYED + OLD_HANDLER, sha: 'stale-sha' }, { content: fresh, sha: 'fresh-sha' }]);
        gh.createOrUpdateFile.mockRejectedValueOnce(new Error(SHA_MISMATCH)).mockResolvedValue({ sha: 'n', commitSha: 'c' });

        await expect(retireDelayedJsHandler(gh, repoOwner, repoName, mockLogger)).resolves.toBe(true);

        expect(delayedWrites(gh)).toHaveLength(2);
        expect(delayedWrites(gh)[1][3]).toBe(`${DELAYED}import './inspector.js';\n`);
        expect(delayedWrites(gh)[1][5]).toBe('fresh-sha');
    });

    it('stops when the re-read shows the copy already gone', async () => {
        const gh = github([{ content: DELAYED + OLD_HANDLER, sha: 'stale-sha' }, { content: DELAYED, sha: 'fresh-sha' }]);
        gh.createOrUpdateFile.mockRejectedValueOnce(new Error(SHA_MISMATCH));

        await expect(retireDelayedJsHandler(gh, repoOwner, repoName, mockLogger)).resolves.toBe(true);
        expect(delayedWrites(gh)).toHaveLength(1);
    });

    it('retries only once: a second stale rejection answers false', async () => {
        const gh = github([{ content: DELAYED + OLD_HANDLER, sha: 'stale-1' }, { content: DELAYED + OLD_HANDLER, sha: 'stale-2' }]);
        gh.createOrUpdateFile.mockRejectedValue(new Error(SHA_MISMATCH));

        await expect(retireDelayedJsHandler(gh, repoOwner, repoName, mockLogger)).resolves.toBe(false);
        expect(delayedWrites(gh)).toHaveLength(2);
    });
});
