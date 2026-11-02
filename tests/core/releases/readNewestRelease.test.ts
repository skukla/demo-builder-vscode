/**
 * readNewestRelease: the one reader of a repository's GitHub releases, shared by the
 * extension's own update check, the component update check, the installer and the patches
 * lookup. It answers null rather than throwing, so a failed lookup never stops an install.
 */

import {
    readLatestTagFromWeb,
    readNewestComponentRelease,
    readNewestRelease,
} from '@/core/releases/readNewestRelease';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => body,
    });
}

const fetchedUrl = () => (global.fetch as jest.Mock).mock.calls[0][0];
const fetchedOptions = () => (global.fetch as jest.Mock).mock.calls[0][1];

describe('which endpoint a channel reads', () => {
    it('stable reads the latest-release endpoint, which leaves prereleases out', async () => {
        respondWith({ tag_name: 'v1.2.0' });

        await readNewestRelease('skukla/demo-erp', 'stable');

        expect(fetchedUrl()).toBe('https://api.github.com/repos/skukla/demo-erp/releases/latest');
    });

    it('beta reads the list, so prereleases are visible', async () => {
        respondWith([{ tag_name: 'v1.2.0' }]);

        await readNewestRelease('skukla/demo-erp', 'beta');

        expect(fetchedUrl()).toBe(
            'https://api.github.com/repos/skukla/demo-erp/releases?per_page=20',
        );
    });
});

describe('which release it picks', () => {
    it('takes the highest version, not the first listed', async () => {
        respondWith([{ tag_name: 'v1.0.0' }, { tag_name: 'v1.2.0' }, { tag_name: 'v1.1.0' }]);

        const release = await readNewestRelease('skukla/demo-erp', 'beta');

        expect(release?.tag_name).toBe('v1.2.0');
    });

    // The mesh rehearsal depends on this: an alpha must not reach a beta-channel install.
    it('beta skips an alpha', async () => {
        respondWith([{ tag_name: 'v2.0.0-alpha.1' }, { tag_name: 'v1.2.0-beta.1' }]);

        const release = await readNewestRelease('skukla/demo-erp', 'beta');

        expect(release?.tag_name).toBe('v1.2.0-beta.1');
    });

    it('never picks a draft', async () => {
        respondWith([{ tag_name: 'v2.0.0', draft: true }, { tag_name: 'v1.0.0', draft: false }]);

        const release = await readNewestRelease('skukla/demo-erp', 'beta');

        expect(release?.tag_name).toBe('v1.0.0');
    });

    // Measured 2026-11-02: GitHub's latest release of Adobe's starter kit is tagged `legacy`.
    it('answers nothing when the latest release is not a version', async () => {
        respondWith({ tag_name: 'legacy' });

        expect(await readNewestRelease('adobe/commerce-integration-starter-kit', 'stable')).toBeNull();
    });
});

describe('every failure answers null', () => {
    it.each([
        ['no releases yet', {}, { ok: false, status: 404 }],
        ['a rate limit', { message: 'API rate limit exceeded' }, { ok: false, status: 403 }],
        ['a body with no tag', {}, {}],
    ])('%s', async (_name, body, init) => {
        respondWith(body, init);

        expect(await readNewestRelease('skukla/demo-erp', 'stable')).toBeNull();
    });

    it('says nothing for no releases, and names the status for anything else', async () => {
        const debug = jest.fn();

        respondWith({}, { ok: false, status: 404 });
        await readNewestRelease('skukla/demo-erp', 'stable', { logger: { debug } });
        expect(debug).not.toHaveBeenCalled();

        respondWith({}, { ok: false, status: 403 });
        await readNewestRelease('skukla/demo-erp', 'stable', { logger: { debug } });
        expect(debug).toHaveBeenCalledWith(expect.stringContaining('403'));
    });

    it('a list that is not a list', async () => {
        respondWith({ message: 'nope' });

        expect(await readNewestRelease('skukla/demo-erp', 'beta')).toBeNull();
    });

    it('a network failure, and it says why', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('socket hang up'));
        const debug = jest.fn();

        expect(await readNewestRelease('skukla/demo-erp', 'stable', { logger: { debug } })).toBeNull();
        expect(debug).toHaveBeenCalledWith(expect.stringContaining('socket hang up'));
    });
});

describe('what it sends', () => {
    it('passes the caller headers, and a timeout', async () => {
        respondWith({ tag_name: 'v1.0.0' });
        const headers = { Authorization: 'token abc' };

        await readNewestRelease('skukla/demo-erp', 'stable', { headers });

        expect(fetchedOptions().headers).toBe(headers);
        expect(fetchedOptions().signal).toBeInstanceOf(AbortSignal);
    });

    it('sends no headers when none are given', async () => {
        respondWith({ tag_name: 'v1.0.0' });

        await readNewestRelease('skukla/demo-erp', 'stable', { timeoutMs: TIMEOUTS.QUICK });

        expect(fetchedOptions()).not.toHaveProperty('headers');
    });
});

/**
 * A component has no graduation step, so early access sees every track: an alpha to try, and
 * the normal and beta releases everyone else gets. It must not leave anyone behind.
 *
 * Every component stays on the beta track until the extension reaches 1.x (owner, 2026-11-02),
 * so stable reads what beta reads.
 */
describe('readNewestComponentRelease', () => {
    const LIST = [
        { tag_name: 'v1.1.0' },
        { tag_name: 'v1.2.0-beta.1' },
        { tag_name: 'v2.0.0-alpha.1' },
    ];

    it('early access takes an alpha that is the highest', async () => {
        respondWith(LIST);

        const release = await readNewestComponentRelease('skukla/demo-erp', 'early-access');

        expect(release?.tag_name).toBe('v2.0.0-alpha.1');
    });

    it('early access still takes a normal release that is newer than any alpha', async () => {
        respondWith([{ tag_name: 'v3.0.0' }, { tag_name: 'v2.0.0-alpha.1' }]);

        const release = await readNewestComponentRelease('skukla/demo-erp', 'early-access');

        expect(release?.tag_name).toBe('v3.0.0');
    });

    it('early access skips drafts and tags that are not versions', async () => {
        respondWith([
            { tag_name: 'v9.0.0', draft: true },
            { tag_name: 'legacy' },
            { tag_name: 'v1.0.0' },
        ]);

        const release = await readNewestComponentRelease('skukla/demo-erp', 'early-access');

        expect(release?.tag_name).toBe('v1.0.0');
    });

    it('beta behaves as it does everywhere else', async () => {
        respondWith(LIST);

        const release = await readNewestComponentRelease('skukla/demo-erp', 'beta');

        expect(release?.tag_name).toBe('v1.2.0-beta.1');
    });

    it('stable reads the release list, never the latest-release endpoint', async () => {
        respondWith(LIST);

        await readNewestComponentRelease('skukla/demo-erp', 'stable');

        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(fetchedUrl()).toBe(
            'https://api.github.com/repos/skukla/demo-erp/releases?per_page=20',
        );
    });

    it('stable takes a beta when it is the highest', async () => {
        respondWith([{ tag_name: 'v1.1.0' }, { tag_name: 'v1.2.0-beta.1' }]);

        const release = await readNewestComponentRelease('skukla/demo-erp', 'stable');

        expect(release?.tag_name).toBe('v1.2.0-beta.1');
    });

    it('stable skips an alpha, however high it is', async () => {
        respondWith(LIST);

        const release = await readNewestComponentRelease('skukla/demo-erp', 'stable');

        expect(release?.tag_name).toBe('v1.2.0-beta.1');
    });

    it('stable still takes a normal release above a beta', async () => {
        respondWith([{ tag_name: 'v1.2.0-beta.1' }, { tag_name: 'v1.3.0' }]);

        const release = await readNewestComponentRelease('skukla/demo-erp', 'stable');

        expect(release?.tag_name).toBe('v1.3.0');
    });

    it('stable answers nothing for a repository with no releases', async () => {
        respondWith([]);

        expect(await readNewestComponentRelease('skukla/demo-erp', 'stable')).toBeNull();
    });
});

/**
 * GitHub's web address for a repository's latest release redirects to its tag, and is not under
 * the API's limit of 60 anonymous calls an hour, which a whole office shares.
 * Measured 2026-11-02: HTTP 302 to /skukla/eds-demo-patches/releases/tag/v1.1.5.
 */
describe('readLatestTagFromWeb', () => {
    function redirectsTo(location: string | null, status = 302) {
        global.fetch = jest.fn().mockResolvedValue({
            status,
            headers: { get: () => location },
        });
    }

    it('reads the tag from the redirect, without following it', async () => {
        redirectsTo('https://github.com/skukla/eds-demo-patches/releases/tag/v1.1.5');

        expect(await readLatestTagFromWeb('skukla/eds-demo-patches')).toBe('v1.1.5');
        expect(fetchedUrl()).toBe('https://github.com/skukla/eds-demo-patches/releases/latest');
        expect(fetchedOptions().redirect).toBe('manual');
    });

    it('answers nothing for a repository with no releases, which redirects elsewhere', async () => {
        redirectsTo('https://github.com/skukla/demo-erp/releases');

        expect(await readLatestTagFromWeb('skukla/demo-erp')).toBeNull();
    });

    it('answers nothing with no redirect at all', async () => {
        redirectsTo(null, 404);

        expect(await readLatestTagFromWeb('skukla/demo-erp')).toBeNull();
    });

    it('answers nothing, rather than throwing, when GitHub cannot be reached', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

        expect(await readLatestTagFromWeb('skukla/demo-erp')).toBeNull();
    });
});
