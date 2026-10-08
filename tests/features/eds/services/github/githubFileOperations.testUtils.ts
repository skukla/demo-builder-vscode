/**
 * The Octokit stub the GitHub operations suites install — file operations, tree
 * commits and the repo archive (split by job on 2026-10-08, EDS-8), plus the
 * base class they share.
 *
 * Each operations class news up its own Octokit through the plugin factory, so
 * the mock has to provide that shape rather than an instance. The two suites
 * wrote it differently — one wrapped `plugin` in a `jest.fn()`, the other did
 * not; one passed the request mock directly, the other closed over it — and the
 * form here is the superset: an assertable plugin, and a request that resolves
 * through the exported mock so a suite can swap its behaviour per test.
 */

/** Every Octokit request the operations make. Reset it in each `beforeEach`. */
export const mockRequest = jest.fn();

/**
 * One call per Octokit instance actually constructed. The operations cache the
 * client on the service and drop it on `invalidateOctokit`, and a cache that
 * silently rebuilds every call looks identical through `mockRequest` — this is
 * the only handle that can tell them apart.
 */
export const mockOctokitConstructed = jest.fn();

jest.mock('@octokit/core', () => ({
    Octokit: {
        plugin: jest.fn(() =>
            jest.fn().mockImplementation((...args: unknown[]) => {
                mockOctokitConstructed(...args);
                return {
                    request: (...requestArgs: unknown[]) => mockRequest(...requestArgs),
                };
            })
        ),
    },
}));

// Below the mock on purpose. `jest.mock` hoists above the imports of the module
// it appears in — this one — not across modules, so a suite that imported the
// operations itself would bind them before the Octokit stub was registered. The
// branchRef suite did exactly that on the first attempt: every request went to
// the real client shape and `force` came back undefined.
export { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
export { GitHubAuthenticatedOperations } from '@/features/eds/services/github/githubAuthenticatedOperations';
export { GitHubRepoArchive } from '@/features/eds/services/github/githubRepoArchive';
export { GitHubTreeCommits } from '@/features/eds/services/github/githubTreeCommits';
