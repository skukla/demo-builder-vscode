/**
 * The two walls the three edsResetService suites install identically.
 *
 * `customBlockLibraries`, `daLiveReauth` and `meshAuth` agree on these two
 * (bodies compared with comments stripped, 2026-09-02). Two other reset suites
 * in this directory carry DIFFERENT versions of both, which is why this file is
 * imported by three and not by five.
 *
 * `edsPipeline` is deliberately absent even though two of the three share it:
 * `daLiveReauth` needs a different one, and the imported wall wins over a
 * suite's own — putting it here would silently replace what that suite asked
 * for.
 *
 * IMPORT THIS BEFORE the reset service under test; `jest.mock` hoists above the
 * imports of the module it appears in, not across modules. Pinned by
 * `tests/sop/mock-wall-import-order.test.ts`.
 */

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000, NORMAL: 30000, PREREQUISITE_CHECK: 10000, UI: { MIN_LOADING: 200 } },
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

/**
 * The GitHub/DA.live helper wall these suites share.
 *
 * The two versions differed by ONE line: `daLiveReauth` delegates
 * `ensureDaLiveAuth` to a handle it asserts on, `meshAuth` omits the member
 * entirely. Keeping it costs meshAuth an unused member on a double it never
 * reads, which is cheaper than two near-identical walls — and the handle has to
 * live here, exported, because the wall closes over it.
 *
 * `customBlockLibraries` and the three other reset suites carry genuinely
 * different versions of this module and are not consumers.
 */
export const mockEnsureDaLiveAuth = jest.fn().mockResolvedValue({ authenticated: true });

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({
        tokenService: {},
        fileOperations: {
            resetRepoToTemplate: jest
                .fn()
                .mockResolvedValue({ fileCount: 10, commitSha: 'abc1234567' }),
            getFileContent: jest.fn().mockResolvedValue(null),
            createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
        },
    }),
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
    ensureDaLiveAuth: (...args: unknown[]) => mockEnsureDaLiveAuth(...args),
}));

export {};
