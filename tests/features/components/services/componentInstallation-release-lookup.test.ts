/**
 * ComponentInstallation — the GitHub release lookup behind tag resolution.
 *
 * A versioned component clones the LATEST release rather than the tag pinned
 * in components.json, so this lookup decides what an SC actually installs. It
 * is also the one network call on the install path: every failure mode has to
 * end at the configured fallback tag rather than at a thrown install.
 */

import {
    cloneCall,
    install,
    makeDef,
    resetDoubles,
    setUpdateChannel,
} from './componentInstallation.testUtils';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

const VERSIONED = () =>
    makeDef({
        source: {
            url: 'https://github.com/skukla/kukla-bodea',
            gitOptions: { tag: 'v1.0.0' },
        },
    });

function respondWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    global.fetch = jest.fn().mockResolvedValue({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: async () => body,
    });
}

beforeEach(resetDoubles);

describe('which GitHub endpoint the channel selects', () => {
    it('beta reads the release LIST, so prereleases are visible', async () => {
        respondWith([{ tag_name: 'v9.9.9', prerelease: true }]);

        await install(VERSIONED());

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.github.com/repos/skukla/kukla-bodea/releases?per_page=10',
            { signal: expect.anything() }
        );
        expect(cloneCall()[0]).toContain('--branch "v9.9.9"');
    });

    it('stable reads /releases/latest, which excludes prereleases', async () => {
        setUpdateChannel('stable');
        respondWith({ tag_name: 'v3.0.0' });

        await install(VERSIONED());

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.github.com/repos/skukla/kukla-bodea/releases/latest',
            { signal: expect.anything() }
        );
        expect(cloneCall()[0]).toContain('--branch "v3.0.0"');
    });

    it('takes the FIRST release from the beta list', async () => {
        respondWith([{ tag_name: 'v9.9.9' }, { tag_name: 'v8.0.0' }]);

        await install(VERSIONED());

        expect(cloneCall()[0]).toContain('--branch "v9.9.9"');
    });
});

describe('every failure ends at the configured fallback tag', () => {
    it('a non-GitHub URL is never looked up at all', async () => {
        const gitlab = makeDef({
            source: { url: 'https://gitlab.com/acme/thing', gitOptions: { tag: 'v1.0.0' } },
        });

        await install(gitlab);

        expect(global.fetch).not.toHaveBeenCalled();
        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
    });

    it('an error RESPONSE is not read for a tag, even when it carries one', async () => {
        respondWith([{ tag_name: 'v9.9.9' }], { ok: false, status: 403 });

        await install(VERSIONED());

        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
    });

    it('an empty release list falls back', async () => {
        respondWith([]);

        await install(VERSIONED());

        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
    });

    it('a beta response that is not a list at all falls back', async () => {
        respondWith({ message: 'API rate limit exceeded' });

        await install(VERSIONED());

        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
    });

    it('a stable release with no tag_name falls back', async () => {
        setUpdateChannel('stable');
        respondWith({});

        await install(VERSIONED());

        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
    });

    it('a network failure falls back rather than failing the install', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

        const result = await install(VERSIONED());

        expect(result.success).toBe(true);
        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
    });
});

describe('the lookup cannot hang the install', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('ABORTS a request that outlives the quick timeout, and falls back', async () => {
        jest.useFakeTimers();
        global.fetch = jest.fn((_url: URL | RequestInfo, init?: RequestInit) => {
            const { signal } = init ?? {};
            return new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener('abort', () =>
                    reject(new Error('The operation was aborted'))
                );
            });
        });

        const installing = install(VERSIONED());
        // Several awaited filesystem doubles sit between the call and the
        // fetch; drain microtasks until the request is actually in flight.
        for (let i = 0; i < 50 && (global.fetch as jest.Mock).mock.calls.length === 0; i += 1) {
            await Promise.resolve();
        }
        jest.advanceTimersByTime(TIMEOUTS.QUICK);

        await installing;
        expect(cloneCall()[0]).toContain('--branch "v1.0.0"');
    });

    it('clears the abort timer even when the request rejects', async () => {
        jest.useFakeTimers();
        global.fetch = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

        await install(VERSIONED());

        // A timer left pending keeps firing an abort at a request that is gone.
        expect(jest.getTimerCount()).toBe(0);
    });
});
