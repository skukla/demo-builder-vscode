/**
 * listPublishedPaths — asking Helix which paths a site has in preview or live (EDS-26).
 *
 * `fetch` is the boundary. What is asserted is the REQUEST (where it goes, what it asks
 * for, which credentials ride on it) and that an answer without a page list is a
 * failure, never an empty list.
 *
 * PROVENANCE, stated because it matters: the response shapes below are written from
 * Adobe's Admin API reference for the bulk status job (`POST /status/{org}/{site}/{ref}/*`,
 * then `GET /job/{org}/{site}/{ref}/status/{name}/details`), NOT captured from a live
 * response — no credentialled read was available during the build (2026-10-05). The
 * live check in `.rptc/backlog/2026-10-05-product-pages-survive-reset.md` is what
 * settles them; replace these with the captured body when it runs.
 */

jest.mock('@/core/utils/sleep', () => ({
    sleep: jest.fn(() => Promise.resolve()),
}));

import type { HelixAdminAuth } from '@/features/eds/services/helix/helixAdminAuth';
import { listPublishedPaths } from '@/features/eds/services/helix/helixPublishedPaths';
import { createMockLogger } from '../../../../helpers/loggerFake';

function response(status: number, body?: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers: { get: () => null },
        json: async () => body,
    };
}

function auth(github: string | Error = 'gh-token'): Pick<HelixAdminAuth, 'tryAdminBearer' | 'getGitHubToken'> {
    return {
        tryAdminBearer: async () => ({ Authorization: 'Bearer da-token' }),
        getGitHubToken: async () => {
            if (github instanceof Error) throw github;
            return github;
        },
    };
}

const JOB_ACCEPTED = response(202, { job: { name: 'job-2026-10-05-abc', topic: 'status', state: 'created' } });
const DETAILS_DONE = response(200, {
    state: 'stopped',
    data: {
        phase: 'completed',
        resources: [
            { path: '/products/drum-cabinet/dc-100', publishLastModified: 'x', previewLastModified: 'y' },
            { path: '/products/default', previewLastModified: 'y' },
        ],
    },
});

let fetchMock: jest.Mock;
const run = (a = auth()) =>
    listPublishedPaths({ auth: a, logger: createMockLogger() }, 'skukla', 'kukla-justrite', 'main', '/products/*');

beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
});

describe('listPublishedPaths', () => {
    it('starts a status job for the pattern on the site keyed by owner and repo, with both credentials', async () => {
        fetchMock.mockResolvedValueOnce(JOB_ACCEPTED).mockResolvedValueOnce(DETAILS_DONE);

        await run();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://admin.hlx.page/status/skukla/kukla-justrite/main/*');
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body)).toStrictEqual({ paths: ['/products/*'], select: ['preview', 'live'] });
        expect(init.headers).toMatchObject({
            Authorization: 'Bearer da-token',
            'x-auth-token': 'gh-token',
            'Content-Type': 'application/json',
        });
    });

    it("reads the job's details and answers every path it lists", async () => {
        fetchMock.mockResolvedValueOnce(JOB_ACCEPTED).mockResolvedValueOnce(DETAILS_DONE);

        const paths = await run();

        expect(fetchMock.mock.calls[1][0]).toBe(
            'https://admin.hlx.page/job/skukla/kukla-justrite/main/status/job-2026-10-05-abc/details',
        );
        expect(paths).toStrictEqual(['/products/drum-cabinet/dc-100', '/products/default']);
    });

    it('keeps asking until the job has stopped', async () => {
        fetchMock
            .mockResolvedValueOnce(JOB_ACCEPTED)
            .mockResolvedValueOnce(response(404))
            .mockResolvedValueOnce(response(200, { state: 'running' }))
            .mockResolvedValueOnce(DETAILS_DONE);

        expect(await run()).toHaveLength(2);
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('works with the DA.live sign-in alone when there is no GitHub token', async () => {
        fetchMock.mockResolvedValueOnce(JOB_ACCEPTED).mockResolvedValueOnce(DETAILS_DONE);

        await run(auth(new Error('GitHub authentication required')));

        expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('x-auth-token');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer da-token');
    });

    it('a stopped job with an empty page list is a real "nothing published"', async () => {
        fetchMock
            .mockResolvedValueOnce(JOB_ACCEPTED)
            .mockResolvedValueOnce(response(200, { state: 'stopped', data: { resources: [] } }));

        expect(await run()).toStrictEqual([]);
    });

    it('a stopped job WITHOUT a page list is a failure, not an empty list', async () => {
        fetchMock
            .mockResolvedValueOnce(JOB_ACCEPTED)
            .mockResolvedValueOnce(response(200, { state: 'stopped', data: {} }));

        await expect(run()).rejects.toThrow('Helix finished the status job without a page list');
    });

    it('a job that reports an error is a failure', async () => {
        fetchMock
            .mockResolvedValueOnce(JOB_ACCEPTED)
            .mockResolvedValueOnce(response(200, { state: 'stopped', error: 'boom', data: { resources: [] } }));

        await expect(run()).rejects.toThrow('boom');
    });

    it('a refused request is a failure that names the status', async () => {
        fetchMock.mockResolvedValueOnce(response(401));

        await expect(run()).rejects.toThrow('Helix refused to list the published pages (HTTP 401)');
    });

    it('an accepted request with no job to follow is a failure', async () => {
        fetchMock.mockResolvedValueOnce(response(202, {}));

        await expect(run()).rejects.toThrow('Helix accepted the status request but named no job');
    });
});
