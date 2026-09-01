import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
/**
 * The shared shape of a GitHub file-operations fake (ADR-016 § Fixtures).
 *
 * WHY ONLY THE SHAPE. Two suites defined `makeMockGithub` returning a
 * `MockGithub` — and both defined that interface too, identically. But the
 * BUILDERS were not duplicates: one serves brand-asset `head.html`, the other a
 * PDP 404 handler. Same shape, genuinely different canned data.
 *
 * So the type is canonical here and the data stays with the suite that needs
 * it. Merging the builders would have forced one suite's fixture on the other;
 * leaving them sharing a name kept two unrelated things indistinguishable. The
 * suites' builders are renamed for what they actually build.
 */

/** The two GitHub file operations these fakes stand in for. */
export interface MockGithub {
    getFileContent: jest.Mock;
    createOrUpdateFile: jest.Mock;
}

/**
 * The fake, typed so the publishers accept it WITHOUT a cast at the call site.
 *
 * `GitHubFileOperations` is a CLASS constructed with a token service and a logger,
 * so no object literal can ever satisfy it — the cast has to exist. It belongs
 * here, once, rather than at the 31 call sites across three suites that each wrote
 * `mockGithub as never` and switched off checking of the whole call to get one
 * argument through.
 *
 * The intersection keeps both halves usable: suites still reach
 * `.getFileContent.mockResolvedValueOnce(...)` through the mock half, and the
 * publishers accept the real half.
 */
export type GithubFake = MockGithub & GitHubFileOperations;

/** A GitHub fake with inert defaults; suites override with their own fixtures. */
export function createMockGithub(overrides: Partial<MockGithub> = {}): GithubFake {
    return {
        getFileContent: jest.fn().mockResolvedValue(null),
        createOrUpdateFile: jest.fn().mockResolvedValue({ sha: 'sha', commitSha: 'commit' }),
        ...overrides,
    } as GithubFake;
}
