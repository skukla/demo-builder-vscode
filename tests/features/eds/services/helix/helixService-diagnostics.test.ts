/**
 * What Helix actually thinks, written down where a user can paste it.
 *
 * The block library published "successfully" for a month of builds while every
 * block in DA.live's Insert-block palette answered "It appears <block> has not
 * been previewed". Nothing in the logs disagreed, because nothing in the code
 * ever asked. Two silences produced that:
 *
 *   1. A bulk job that finishes having processed NOTHING reads as success.
 *      `assertBulkResourcesSucceeded` looks for resources with status >= 400 and
 *      finds none — because the job came back with no resources at all. Measured
 *      2026-08-18 on skukla/team-bodea-demo: two runs, ~78 paths each, zero
 *      previewed, zero complaints.
 *   2. Nobody ever read the admin status of a path that failed to appear. It is
 *      one GET, it carries `preview.status` and the `x-error` header, and it is
 *      the difference between "we published it" and knowing what Helix did with
 *      it.
 */

import { HelixService } from '@/features/eds/services/helix/helixService';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../../helpers/loggerFake';

const mockFetch = jest.fn();
global.fetch = mockFetch;

let logger: Logger;
let service: HelixService;

beforeEach(() => {
    mockFetch.mockReset();
    logger = createMockLogger() as unknown as Logger;
    service = new HelixService(
        logger,
        { getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }) } as unknown as GitHubTokenService,
        // The bulk endpoints send the DA.live bearer as the content-source
        // authorization; without a provider they throw before any fetch.
        { getAccessToken: jest.fn().mockResolvedValue('ims-token') },
    );
});

describe('getResourceStatus', () => {
    const statusBody = {
        preview: { status: 404, lastModified: null },
        live: { status: 404 },
    };

    it('asks the admin status endpoint for the path', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => statusBody,
        });

        await service.getResourceStatus('skukla', 'team-bodea-demo', '/.da/library/blocks/text');

        expect(mockFetch).toHaveBeenCalledWith(
            'https://admin.hlx.page/status/skukla/team-bodea-demo/main/.da/library/blocks/text',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('reports the preview and live status Helix holds', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => statusBody,
        });

        const result = await service.getResourceStatus('o', 's', '/x');

        expect(result).toMatchObject({ httpStatus: 200, previewStatus: 404, liveStatus: 404 });
    });

    it('carries the x-error header, which is where the reason lives', async () => {
        // `x-error` is the only stated reason on a 401/403 — the body is empty.
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            headers: { get: (h: string) => (h === 'x-error' ? '[admin] not authenticated' : null) },
            json: async () => ({}),
        });

        const result = await service.getResourceStatus('o', 's', '/x');

        expect(result).toMatchObject({ httpStatus: 401, error: '[admin] not authenticated' });
    });

    it('never throws — a diagnostic must not become the failure', async () => {
        mockFetch.mockRejectedValue(new Error('ENOTFOUND'));

        await expect(service.getResourceStatus('o', 's', '/x')).resolves.toMatchObject({
            httpStatus: 0,
        });
    });

    it('normalises a relative path', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => statusBody,
        });

        await service.getResourceStatus('o', 's', '.da/library/blocks.json');

        expect(mockFetch).toHaveBeenCalledWith(
            'https://admin.hlx.page/status/o/s/main/.da/library/blocks.json',
            expect.anything(),
        );
    });
});

/**
 * A bulk job that touched nothing must say so.
 *
 * `assertBulkResourcesSucceeded` looked for resources with a status >= 400 and,
 * finding none, called the job a success — including when the job came back with
 * no resources at all. Measured 2026-08-18 on skukla/team-bodea-demo: two runs of
 * ~78 library paths, zero previewed, and the only log line said the library was
 * published.
 */
describe('a bulk job that processed nothing', () => {
    /** 202 + a job status document, the shape the admin API returns. */
    const bulkRun = (jobStatus: Record<string, unknown>) => {
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 202,
                headers: { get: () => null },
                json: async () => ({ job: { name: 'job-1', topic: 'preview' } }),
            })
            .mockResolvedValue({
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: async () => jobStatus,
            });
    };

    it('warns, and prints the raw job payload', async () => {
        bulkRun({ state: 'stopped', data: { resources: [] }, progress: { processed: 0, total: 78 } });

        await service.previewAllContent('o', 's', 'main', undefined, ['/.da/library/blocks/text']);

        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('processed NOTHING'),
        );
        // The payload itself, because the job is gone by the time anyone reads this.
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"total":78'));
    });

    it('stays quiet when the job actually did the work', async () => {
        bulkRun({
            state: 'stopped',
            data: { resources: [{ path: '/a', status: 200 }] },
            progress: { processed: 1, total: 1 },
        });

        await service.previewAllContent('o', 's', 'main', undefined, ['/a']);

        expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining('processed NOTHING'));
    });

    it('still throws when the job reports failed paths — a warning is not enough', async () => {
        bulkRun({
            state: 'stopped',
            data: { resources: [{ path: '/a', status: 404 }] },
            progress: { processed: 1, total: 1 },
        });

        await expect(
            service.previewAllContent('o', 's', 'main', undefined, ['/a']),
        ).rejects.toThrow(/1\/1 paths failed/);
    });
});
