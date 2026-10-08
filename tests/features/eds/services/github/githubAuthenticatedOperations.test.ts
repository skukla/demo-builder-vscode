/**
 * GitHubAuthenticatedOperations — one Octokit per instance, built on first use.
 *
 * The base the three operations classes share. Whether a second call reuses the
 * client is invisible from the requests alone, so the constructor count is the
 * assertion; `invalidateOctokit` is what a token change relies on.
 */

import {
    GitHubAuthenticatedOperations,
    mockOctokitConstructed,
    mockRequest,
} from './githubFileOperations.testUtils';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

/** The smallest subclass: exposes the protected client so the base is tested on its own. */
class Probe extends GitHubAuthenticatedOperations {
    constructor(tokenService: GitHubTokenService) {
        super(tokenService);
    }

    async request(): Promise<unknown> {
        const octokit = await this.ensureAuthenticated();
        return octokit.request('GET /user');
    }
}

const tokenService = {
    getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }),
} as unknown as GitHubTokenService;

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ data: {} });
    mockOctokitConstructed.mockClear();
});

describe('ensureAuthenticated', () => {
    it('refuses when there is no GitHub token, and builds no client', async () => {
        const noToken = { getToken: jest.fn().mockResolvedValue(null) } as unknown as GitHubTokenService;

        await expect(new Probe(noToken).request()).rejects.toThrow('Not authenticated');
        expect(mockOctokitConstructed).not.toHaveBeenCalled();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('builds the client with the token it was given', async () => {
        await new Probe(tokenService).request();

        expect(mockOctokitConstructed).toHaveBeenCalledWith({ auth: 'gh-token' });
    });

    it('builds the client once and reuses it across requests', async () => {
        const probe = new Probe(tokenService);

        await probe.request();
        await probe.request();

        expect(mockOctokitConstructed).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('asks the token service every time, so a token that goes away is noticed', async () => {
        const getToken = jest.fn().mockResolvedValueOnce({ token: 'gh-token' }).mockResolvedValue(null);
        const probe = new Probe({ getToken } as unknown as GitHubTokenService);

        await probe.request();

        await expect(probe.request()).rejects.toThrow('Not authenticated');
        expect(getToken).toHaveBeenCalledTimes(2);
    });

    it('does not share a client between instances', async () => {
        await new Probe(tokenService).request();
        await new Probe(tokenService).request();

        expect(mockOctokitConstructed).toHaveBeenCalledTimes(2);
    });
});

describe('invalidateOctokit', () => {
    it('builds a fresh client after the cached one is dropped', async () => {
        const probe = new Probe(tokenService);

        await probe.request();
        probe.invalidateOctokit();
        await probe.request();

        expect(mockOctokitConstructed).toHaveBeenCalledTimes(2);
    });
});
