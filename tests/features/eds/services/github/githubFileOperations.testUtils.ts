/**
 * The Octokit stub both githubFileOperations suites install.
 *
 * `GitHubFileOperations` news up its own Octokit through the plugin factory, so
 * the mock has to provide that shape rather than an instance. The two suites
 * wrote it differently — one wrapped `plugin` in a `jest.fn()`, the other did
 * not; one passed the request mock directly, the other closed over it — and the
 * form here is the superset: an assertable plugin, and a request that resolves
 * through the exported mock so a suite can swap its behaviour per test.
 */

/** Every Octokit request the operations make. Reset it in each `beforeEach`. */
export const mockRequest = jest.fn();

jest.mock('@octokit/core', () => ({
    Octokit: {
        plugin: jest.fn(() =>
            jest.fn().mockImplementation(() => ({
                request: (...args: unknown[]) => mockRequest(...args),
            }))
        ),
    },
}));

// Below the mock on purpose. `jest.mock` hoists above the imports of the module
// it appears in — this one — not across modules, so a suite that imported the
// operations itself would bind them before the Octokit stub was registered. The
// branchRef suite did exactly that on the first attempt: every request went to
// the real client shape and `force` came back undefined.
export { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
