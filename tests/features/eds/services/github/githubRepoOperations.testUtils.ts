/**
 * The stubs the `githubRepoOperations-*` suites install, and the Octokit stub the
 * `githubRepoLifecycle-*` suites share through their own testUtils.
 *
 * `GitHubRepoOperations` news up its own Octokit through the plugin factory, which
 * cannot be handed in, so a suite has no way to reach past it other than a module
 * mock — and the suites would otherwise write the same mock twice and drift apart
 * on the next edit.
 *
 * The CONSTRUCTOR is exported alongside the request mock on purpose: whether a second
 * call reuses one client is invisible from the requests alone, so the caching and
 * `invalidateOctokit` can only be asserted here.
 */

import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';

/** Every Octokit request the operations make. Cleared by `jest.clearAllMocks()`. */
export const mockRequest = jest.fn();

/** The client constructor, so client REUSE can be asserted rather than assumed. */
export const mockOctokitConstructor = jest.fn(() => ({
    request: (...args: unknown[]) => mockRequest(...args),
}));

jest.mock('@octokit/core', () => ({
    Octokit: {
        plugin: jest.fn(() => mockOctokitConstructor),
    },
}));

// Below the mocks on purpose. `jest.mock` hoists above the imports of the module it
// appears in — this one — not across modules, so a suite that imported the operations
// itself would bind them before the Octokit stub was registered.
import { GitHubRepoOperations } from '@/features/eds/services/github/githubRepoOperations';

export { GitHubRepoOperations };

/** `getToken` answers with whatever is passed; pass `null` for "signed out". */
export function createTokenService(token: unknown = { token: 'ghp_test' }): GitHubTokenService {
    return { getToken: jest.fn().mockResolvedValue(token) } as unknown as GitHubTokenService;
}

/** A repo payload the mappers can read, with per-test overrides. */
export function apiRepo(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        name: 'repo',
        full_name: 'owner/repo',
        html_url: 'https://github.com/owner/repo',
        clone_url: 'https://github.com/owner/repo.git',
        default_branch: 'main',
        description: null,
        updated_at: '2026-01-01T00:00:00Z',
        private: false,
        permissions: { push: true },
        ...overrides,
    };
}
