/**
 * The module wall and the fakes every project-delete suite shares: projectDeletionService
 * (the answered delete the batch runs, `runProjectDelete`) and edsExternalCleanup.
 *
 * Extracted when the second suite arrived. The wall is thirty lines of jest.mock
 * covering seven modules, and the two suites need exactly the same one: the first
 * asks whether a CANCEL deletes nothing, the second asks what the cleanup paths do
 * once the user has said yes. Two copies would have drifted the way this file's own
 * header once described — a mock supplying a method the source had stopped calling,
 * with 23 tests green over an unreachable branch.
 *
 * Suites import `runProjectDelete`/`deleteProjectFiles` FROM HERE. `jest.mock` hoists
 * above the imports of the module it appears in — this one — so a suite that imported
 * the subject itself could bind it before these mocks were registered.
 */

export const mockShowWarningMessage = jest.fn();
export const mockExecuteCommand = jest.fn();
export const mockRm = jest.fn();
export const mockGetSession = jest.fn();

// Own vscode mock: executeCommand, showWarningMessage and authentication.getSession forward to
//   this suite's own mocks; the shared mock has no authentication API.
jest.mock('vscode', () => ({
    window: {
        showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a),
        // The GitHub sign-in's success line (`signInToGitHub`, PL-104 fix 2).
        setStatusBarMessage: jest.fn(),
    },
    commands: { executeCommand: (...a: unknown[]) => mockExecuteCommand(...a) },
    authentication: { getSession: (...a: unknown[]) => mockGetSession(...a) },
}));

jest.mock('fs/promises', () => ({ rm: (...a: unknown[]) => mockRm(...a) }));

// The two ground-truth primitives for destroying a remote resource. Everything
// in the cleanup path exists to decide whether these get called.
export const mockDeleteRepository = jest.fn();
export const mockDeleteDaLiveSite = jest.fn();
export const mockGetToken = jest.fn();
export const mockStoreToken = jest.fn();
/**
 * The check the one GitHub sign-in (`signInToGitHub`) makes of the token it was handed, and
 * the clear before its stale-session retry (PL-104 fix 2). Valid unless a test says otherwise.
 */
export const mockValidateToken = jest.fn(async (): Promise<{ valid: boolean }> => ({ valid: true }));
export const mockClearToken = jest.fn();
export const mockEnsureDaLiveAuth = jest.fn();
/**
 * The repository's files, listed BEFORE it is deleted so AEM's copy of its code can be
 * removed after (EDS-67). A storefront's tree by default: `scripts/aem.js` is what marks
 * a repository as one.
 */
export const mockListRepoFiles = jest.fn(async (_owner: string, _repo: string, _branch?: string) => [
    { path: 'scripts/aem.js' },
    { path: 'head.html' },
]);

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({
        tokenService: {
            getToken: (...a: unknown[]) => mockGetToken(...a),
            storeToken: (...a: unknown[]) => mockStoreToken(...a),
            validateToken: () => mockValidateToken(),
            clearToken: () => mockClearToken(),
        },
        repoLifecycle: { deleteRepository: (...a: unknown[]) => mockDeleteRepository(...a) },
        fileOperations: {
            listRepoFiles: (owner: string, repo: string, branch?: string) => mockListRepoFiles(owner, repo, branch),
        },
    }),
    // `{ authenticated }` — read from edsHelpers, not guessed. The first draft
    // wrote `{ success, authService }` and the DA.live cleanup silently skipped.
    ensureDaLiveAuth: (...a: unknown[]) => mockEnsureDaLiveAuth(...a),
    // The DA.live session the storefront teardown runs on itself (PL-104 fix 7), and the
    // one sign-in reader a delete with nobody to ask checks instead of asking (fix 6).
    getDaLiveAuthService: () => ({
        getAccessToken: () => mockDaLiveAccessToken(),
        checkSignIn: () => mockDaLiveCheckSignIn(),
    }),
    // The DA.live session the code removal reads without asking (EDS-67).
    tryCreateDaLiveTokenProvider: () => ({ getAccessToken: () => mockDaLiveAccessToken() }),
}));

// The site deletion is now ONE call on the content operations, made by the
// shared storefront teardown (AI-9): the same four steps the agent's cleanup
// runs. `mockDeleteDaLiveSite` drives it, keeping every suite's setup intact.
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: class {
        sourceOps = {
            async deleteAllSiteContent(org: string, site: string) {
                const result = (await mockDeleteDaLiveSite(org, site)) as
                    | { success?: boolean; error?: string; deletedCount?: number }
                    | undefined;
                return {
                    success: result?.success ?? true,
                    deletedCount: result?.deletedCount ?? 0,
                    deletedPaths: [],
                    error: result?.error,
                };
            },
        };
    },
}));
/**
 * The DA.live session's token: what the storefront teardown runs on (PL-104 fix 7) and what
 * the code removal after a repository delete reads. The delete hands the session itself to the
 * teardown now, so the `daLiveTokenProviders` mock this file held went with it.
 */
export const mockDaLiveAccessToken = jest.fn(async (): Promise<string | null> => 'token');
/** The one sign-in reader's verdict on the DA.live token (`DaLiveAuthService.checkSignIn`). */
export const mockDaLiveCheckSignIn = jest.fn(async (): Promise<{ state: string }> => ({ state: 'valid' }));

/**
 * The org-config cleanup that runs AFTER the site content is gone. Dynamically
 * imported by the source, and unmocked it reached the network — the calls failed,
 * the failures were logged, and nothing said so.
 */
export const mockRemoveSitePermissions = jest.fn();
export const mockDeleteSiteConfig = jest.fn();
jest.mock('@/features/eds/services/daLive/daLiveConfigService', () => ({
    DaLiveConfigService: class {
        removeSitePermissions(...a: unknown[]) {
            return mockRemoveSitePermissions(...a);
        }
        deleteSiteConfig(...a: unknown[]) {
            return mockDeleteSiteConfig(...a);
        }
    },
}));

/**
 * The PRODUCTION Helix default, so a call that passes no `services` is testable.
 * Without it, a delete handed no `services` would construct a real HelixService
 * and call its real static key-store init.
 */
export const mockHelixInitKeyStore = jest.fn();
export const mockDefaultListAllPages = jest.fn();
export const mockDefaultUnpublishPages = jest.fn();
export const mockDefaultDeleteAdminApiKey = jest.fn();
export const mockDefaultListPublishedPaths = jest.fn();
export const mockDefaultDeleteCode = jest.fn();
jest.mock('@/features/eds/services/helix/helixService', () => ({
    HelixService: Object.assign(
        class {
            listAllPages(...a: unknown[]) {
                return mockDefaultListAllPages(...a);
            }
            unpublishPages(...a: unknown[]) {
                return mockDefaultUnpublishPages(...a);
            }
            deleteAdminApiKey(...a: unknown[]) {
                return mockDefaultDeleteAdminApiKey(...a);
            }
            listPublishedPaths(...a: unknown[]) {
                return mockDefaultListPublishedPaths(...a);
            }
            deleteCode(...a: unknown[]) {
                return mockDefaultDeleteCode(...a);
            }
        },
        { initKeyStore: (...a: unknown[]) => mockHelixInitKeyStore(...a) },
    ),
}));

/**
 * The live-host check the teardown makes after unpublishing (EDS-33). Mocked so no suite
 * fetches a real aem.live URL; 404 by default (the pages are gone).
 */
export const mockCheckLiveStatus = jest.fn(async (_url: string): Promise<number> => 404);
jest.mock('@/features/eds/services/storefront/liveStatusCheck', () => ({
    checkLiveStatus: (url: string) => mockCheckLiveStatus(url),
}));

// Real timers would make the exponential backoff take seconds of wall clock.
export const mockSleep = jest.fn().mockResolvedValue(undefined);
jest.mock('@/core/utils/sleep', () => ({ sleep: (...a: unknown[]) => mockSleep(...a) }));

/**
 * Uninstall Datapack (walk F96): removing the data (`removeDataBeforeDelete`: `stopped` saying why
 * it did not all come out, `saved` where the changes went first; `{}` when it all came out with
 * nothing to say). The real module reaches the store; its own suite is `datapackDataRemoval.test.ts`,
 * and every delete suite asserts only whether, and with what, it is called.
 */
export const mockRemoveDataBeforeDelete = jest.fn().mockResolvedValue({});
jest.mock('@/features/projects-dashboard/services/datapackDataRemoval', () => ({
    removeDataBeforeDelete: (...a: unknown[]) => mockRemoveDataBeforeDelete(...a),
}));

// Below the mocks on purpose — see the note above about hoisting.
export { runProjectDelete } from '@/features/projects-dashboard/services/projectDeletionService';
export { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
export type { DeletionServices } from '@/features/projects-dashboard/services/edsExternalCleanup';
