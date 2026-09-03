/**
 * ForkSyncService — the requests it makes and how each GitHub answer is read.
 *
 * The sibling suite pins the outcomes (behind-by, conflict, rate limit). This one
 * pins the REQUESTS: the exact repo and compare URLs with the token headers, the
 * parent's default branch used for the compare head with the fork's own as the
 * fallback, the merge-upstream POST body and headers, the full result shapes, the
 * success-message fallback, a 403 body that cannot be parsed or has no string
 * message, and which logger channel a failure lands on (timeout vs anything else).
 */

import { ForkSyncService } from './forkSyncService.testUtils';
import {
    EXPECTED_HEADERS,
    createForkSyncHarness,
    fetchMock,
    respondOnce,
} from './forkSyncService.testUtils';
import { createMockLogger } from '../../../helpers/loggerFake';

let logger: ReturnType<typeof createMockLogger>;
let service: ForkSyncService;

function forkRepo(
    parent: Record<string, unknown> = { full_name: 'upstream/site', default_branch: 'master' }
) {
    return { fork: true, default_branch: 'main', parent };
}

beforeEach(() => {
    jest.clearAllMocks();
    ({ service, logger } = createForkSyncHarness());
});

describe('checkForkStatus', () => {
    it('asks for the repo with the token headers', async () => {
        respondOnce({ fork: false, default_branch: 'main' });

        await service.checkForkStatus('me', 'site');

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/me/site',
            expect.objectContaining({ headers: EXPECTED_HEADERS })
        );
    });

    it('a repo that cannot be read is null, silently, and nothing more is asked', async () => {
        respondOnce({ fork: true }, 500);

        await expect(service.checkForkStatus('me', 'site')).resolves.toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(logger.debug).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('not a fork: the exact no-fork shape, with no compare made', async () => {
        respondOnce({ fork: false, default_branch: 'main' });

        await expect(service.checkForkStatus('me', 'site')).resolves.toEqual({
            isFork: false,
            behindBy: 0,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("a fork: compares its default branch against the parent's OWN default branch", async () => {
        respondOnce(forkRepo());
        respondOnce({ ahead_by: 5 });

        const result = await service.checkForkStatus('me', 'site');

        expect(fetchMock).toHaveBeenLastCalledWith(
            'https://api.github.com/repos/me/site/compare/main...upstream/site:master',
            expect.objectContaining({ headers: EXPECTED_HEADERS })
        );
        expect(result).toEqual({
            isFork: true,
            behindBy: 5,
            parentFullName: 'upstream/site',
            defaultBranch: 'main',
        });
    });

    it("falls back to the fork's own branch name when the parent does not say", async () => {
        respondOnce(forkRepo({ full_name: 'upstream/site' }));
        respondOnce({ ahead_by: 0 });

        await service.checkForkStatus('me', 'site');

        expect(fetchMock).toHaveBeenLastCalledWith(
            'https://api.github.com/repos/me/site/compare/main...upstream/site:main',
            expect.anything()
        );
    });

    it('a compare that cannot be read is null, not an error', async () => {
        respondOnce(forkRepo());
        respondOnce({}, 500);

        await expect(service.checkForkStatus('me', 'site')).resolves.toBeNull();
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('a timeout is a warning, not an error', async () => {
        const abort = new Error('aborted');
        abort.name = 'AbortError';
        fetchMock.mockRejectedValueOnce(abort);

        await expect(service.checkForkStatus('me', 'site')).resolves.toBeNull();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('any other failure is an error carrying the cause, not a warning', async () => {
        const boom = new Error('socket hang up');
        fetchMock.mockRejectedValueOnce(boom);

        await expect(service.checkForkStatus('me', 'site')).resolves.toBeNull();
        expect(logger.error).toHaveBeenCalledWith(expect.any(String), boom);
        expect(logger.warn).not.toHaveBeenCalled();
    });
});

describe('syncFork', () => {
    it('POSTs the branch to merge-upstream with the token and JSON headers', async () => {
        respondOnce({ message: 'Successfully fetched and fast-forwarded from upstream' });

        await service.syncFork('me', 'site', 'develop');

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/me/site/merge-upstream',
            expect.objectContaining({
                method: 'POST',
                headers: { ...EXPECTED_HEADERS, 'Content-Type': 'application/json' },
                body: JSON.stringify({ branch: 'develop' }),
            })
        );
    });

    it("success carries GitHub's message", async () => {
        respondOnce({ message: 'Successfully fetched and fast-forwarded from upstream' });

        await expect(service.syncFork('me', 'site', 'main')).resolves.toEqual({
            success: true,
            message: 'Successfully fetched and fast-forwarded from upstream',
        });
    });

    it('success without a message gets the default wording', async () => {
        respondOnce({ merge_type: 'none' });

        await expect(service.syncFork('me', 'site', 'main')).resolves.toEqual({
            success: true,
            message: 'Fork synced successfully',
        });
    });

    it('409 is the divergence result, not a throw', async () => {
        respondOnce({ message: 'Merge conflict' }, 409);

        await expect(service.syncFork('me', 'site', 'main')).resolves.toEqual({
            success: false,
            conflict: true,
            message: 'Fork has diverged from upstream and cannot be fast-forwarded',
        });
    });

    it('403 naming a rate limit, in any case, throws the rate-limit error', async () => {
        respondOnce({ message: 'API Rate Limit exceeded for 1.2.3.4' }, 403);

        await expect(service.syncFork('me', 'site', 'main')).rejects.toThrow(
            'GitHub API rate limit exceeded. Please try again later.'
        );
    });

    it.each([
        ['another message', { message: 'Resource not accessible by personal access token' }],
        ['a non-string message', { message: 42 }],
        ['no message', {}],
    ])('403 with %s throws the permission error', async (_label, body) => {
        respondOnce(body, 403);

        await expect(service.syncFork('me', 'site', 'main')).rejects.toThrow(
            'GitHub API permission denied. Ensure your token has push access to this fork.'
        );
    });

    it('403 whose body cannot be parsed throws the permission error', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 403,
            json: async () => {
                throw new SyntaxError('Unexpected end of JSON input');
            },
        });

        await expect(service.syncFork('me', 'site', 'main')).rejects.toThrow(
            'GitHub API permission denied. Ensure your token has push access to this fork.'
        );
    });

    it('any other status throws with the status in the message', async () => {
        respondOnce({}, 502);

        await expect(service.syncFork('me', 'site', 'main')).rejects.toThrow(
            'GitHub API error: HTTP 502'
        );
    });
});
