/**
 * helixBulkJobs tests — the extracted Helix bulk-job protocol.
 *
 * Written RED before the extraction (decompose-god-file, helixService cut 2).
 * Auth reaches the module ONLY through the injected `getJobStatusHeaders` —
 * the interface that replaced `pollJobCompletion`'s `this.tryAdminBearer()` /
 * `this.getGitHubToken()` binding. The behaviors themselves (404 retry,
 * finished-with-failures, processed-nothing warning) are unchanged from the
 * in-class implementation and stay covered end-to-end by the untouched
 * helixService suites; this file pins them at the module seam.
 */

jest.mock('@/core/utils/sleep', () => ({
    sleep: jest.fn(() => Promise.resolve()),
}));

import {
    parseBulkJobResponse,
    pollJobCompletion,
    type BulkJobDeps,
} from '@/features/eds/services/helix/helixBulkJobs';
import { HELIX_ADMIN_URL } from '@/features/eds/services/helix/helixApiClient';
import { sleep } from '@/core/utils/sleep';
import type { Logger } from '@/types/logger';

const mockSleep = sleep as jest.Mock;

function makeLogger(): Logger {
    return {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
    } as unknown as Logger;
}

function makeDeps(logger = makeLogger()): BulkJobDeps {
    return {
        logger,
        getJobStatusHeaders: jest.fn(async () => ({
            Authorization: 'Bearer da-token',
            'x-auth-token': 'gh-token',
        })),
    };
}

const JOB = { org: 'org', site: 'site', branch: 'main', jobName: 'job-1', topic: 'preview' };

/** A fetch Response-alike for the job-status endpoint. */
function statusResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    return {
        ok: init.ok ?? true,
        status: init.status ?? 200,
        statusText: 'OK',
        json: () => Promise.resolve(body),
    };
}

const FINISHED_OK = {
    state: 'stopped',
    progress: { processed: 3, total: 3 },
    data: { resources: [{ path: '/a', status: 200 }] },
};

let mockFetch: jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
});

describe('pollJobCompletion', () => {
    it('polls the job-status URL with the headers from the injected auth provider', async () => {
        const deps = makeDeps();
        mockFetch.mockResolvedValueOnce(statusResponse(FINISHED_OK));

        await pollJobCompletion(deps, JOB);

        expect(mockFetch).toHaveBeenCalledWith(
            `${HELIX_ADMIN_URL}/job/org/site/main/preview/job-1`,
            expect.objectContaining({
                method: 'GET',
                headers: { Authorization: 'Bearer da-token', 'x-auth-token': 'gh-token' },
            })
        );
        expect(deps.getJobStatusHeaders).toHaveBeenCalled();
    });

    it('keeps polling while the job runs, then resolves on finished', async () => {
        mockFetch
            .mockResolvedValueOnce(statusResponse({ state: 'running', processed: 1, total: 3 }))
            .mockResolvedValueOnce(statusResponse(FINISHED_OK));

        await pollJobCompletion(makeDeps(), JOB);

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockSleep).toHaveBeenCalled();
    });

    it('retries when the job endpoint 404s (job not visible yet)', async () => {
        mockFetch
            .mockResolvedValueOnce(statusResponse({}, { ok: false, status: 404 }))
            .mockResolvedValueOnce(statusResponse(FINISHED_OK));

        await pollJobCompletion(makeDeps(), JOB);

        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries a status request that itself timed out', async () => {
        mockFetch
            .mockRejectedValueOnce(new Error('The operation timed out'))
            .mockResolvedValueOnce(statusResponse(FINISHED_OK));

        await pollJobCompletion(makeDeps(), JOB);

        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws when the finished job carries a job-level error', async () => {
        mockFetch.mockResolvedValueOnce(statusResponse({ state: 'finished', error: 'boom' }));

        await expect(pollJobCompletion(makeDeps(), JOB)).rejects.toThrow(
            'Bulk preview job failed: boom'
        );
    });

    it('throws naming the failed paths when resources report >=400', async () => {
        mockFetch.mockResolvedValueOnce(
            statusResponse({
                state: 'finished',
                data: {
                    resources: [
                        { path: '/ok', status: 200 },
                        { path: '/broken', status: 502 },
                    ],
                },
            })
        );

        await expect(pollJobCompletion(makeDeps(), JOB)).rejects.toThrow(
            'Bulk preview: 1/2 paths failed (first: /broken → 502)'
        );
    });

    it('warns with the raw payload when the job finished having processed nothing', async () => {
        const logger = makeLogger();
        mockFetch.mockResolvedValueOnce(
            statusResponse({ state: 'finished', progress: { processed: 0, total: 0 } })
        );

        await pollJobCompletion(makeDeps(logger), JOB);

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('processed NOTHING'));
    });

    it('reports progress through the callback while running', async () => {
        const onProgress = jest.fn();
        mockFetch
            .mockResolvedValueOnce(
                statusResponse({ state: 'running', progress: { processed: 1, total: 3 } })
            )
            .mockResolvedValueOnce(statusResponse(FINISHED_OK));

        await pollJobCompletion(makeDeps(), JOB, onProgress);

        expect(onProgress).toHaveBeenCalledWith(1, 3);
        expect(onProgress).toHaveBeenCalledWith(3, 3);
    });

    it('gives up when the overall job deadline passes', async () => {
        const start = 1_000_000;
        const nowSpy = jest
            .spyOn(Date, 'now')
            .mockReturnValueOnce(start) // startTime
            .mockReturnValue(start + 6 * 60 * 1000); // every later check: past 5-min deadline
        try {
            await expect(pollJobCompletion(makeDeps(), JOB)).rejects.toThrow(
                'Bulk preview job timed out'
            );
            expect(mockFetch).not.toHaveBeenCalled();
        } finally {
            nowSpy.mockRestore();
        }
    });
});

describe('parseBulkJobResponse', () => {
    it('reads the nested job format', async () => {
        const response = statusResponse({
            job: { name: 'j-9', topic: 'live', state: 'created' },
        });

        const parsed = await parseBulkJobResponse(
            response as unknown as Response,
            'preview',
            makeLogger()
        );

        expect(parsed).toEqual({ jobName: 'j-9', jobTopic: 'live' });
    });

    it('reads the flat format', async () => {
        const response = statusResponse({ name: 'j-2', topic: 'preview' });

        const parsed = await parseBulkJobResponse(
            response as unknown as Response,
            'live',
            makeLogger()
        );

        expect(parsed).toEqual({ jobName: 'j-2', jobTopic: 'preview' });
    });

    it('falls back to the caller default topic and warns on an unparseable body', async () => {
        const logger = makeLogger();
        const response = {
            json: () => Promise.reject(new Error('not json')),
        };

        const parsed = await parseBulkJobResponse(response as unknown as Response, 'live', logger);

        expect(parsed).toEqual({ jobName: undefined, jobTopic: 'live' });
        expect(logger.warn).toHaveBeenCalled();
    });
});
