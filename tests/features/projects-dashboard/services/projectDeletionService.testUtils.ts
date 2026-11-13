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

jest.mock('vscode', () => ({
    window: { showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a) },
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
        },
        repoLifecycle: { deleteRepository: (...a: unknown[]) => mockDeleteRepository(...a) },
        fileOperations: {
            listRepoFiles: (owner: string, repo: string, branch?: string) => mockListRepoFiles(owner, repo, branch),
        },
    }),
    // `{ authenticated }` — read from edsHelpers, not guessed. The first draft
    // wrote `{ success, authService }` and the DA.live cleanup silently skipped.
    ensureDaLiveAuth: (...a: unknown[]) => mockEnsureDaLiveAuth(...a),
    getDaLiveAuthService: jest.fn().mockReturnValue({}),
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
 * The DA.live session's token, as the provider hands it over. The provider is an OBJECT
 * with `getAccessToken` (daLiveTokenProviders.ts); this mock returned a bare function
 * until EDS-67, which nothing noticed because nothing it reached called it.
 */
export const mockDaLiveAccessToken = jest.fn(async (): Promise<string | null> => 'token');
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: () => ({ getAccessToken: () => mockDaLiveAccessToken() }),
}));

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
 * Uninstall Datapack (walk F96): removing the data (`removeDataBeforeDelete`, undefined when it
 * all came out, else why it did not). The real module reaches the store; its own suite is
 * `datapackDataRemoval.test.ts`, and every delete suite asserts only whether, and with what, it
 * is called.
 */
export const mockRemoveDataBeforeDelete = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/projects-dashboard/services/datapackDataRemoval', () => ({
    removeDataBeforeDelete: (...a: unknown[]) => mockRemoveDataBeforeDelete(...a),
}));

// Below the mocks on purpose — see the note above about hoisting.
export { runProjectDelete } from '@/features/projects-dashboard/services/projectDeletionService';
export { deleteProjectFiles } from '@/features/projects-dashboard/services/projectFilesDeletion';
export type { DeletionServices } from '@/features/projects-dashboard/services/edsExternalCleanup';
