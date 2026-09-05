/**
 * The module wall, the fakes and the fixtures both projectDeletionService suites share.
 *
 * Extracted when the second suite arrived. The wall is thirty lines of jest.mock
 * covering seven modules, and the two suites need exactly the same one: the first
 * asks whether a CANCEL deletes nothing, the second asks what the cleanup paths do
 * once the user has said yes. Two copies would have drifted the way this file's own
 * header once described — a mock supplying a method the source had stopped calling,
 * with 23 tests green over an unreachable branch.
 *
 * Suites import `deleteProject`/`deleteProjectFiles` FROM HERE. `jest.mock` hoists
 * above the imports of the module it appears in — this one — so a suite that imported
 * the subject itself could bind it before these mocks were registered.
 */

export const mockShowWarningMessage = jest.fn();
export const mockShowInformationMessage = jest.fn();
export const mockExecuteCommand = jest.fn();
export const mockRm = jest.fn();
export const mockGetConfiguration = jest.fn();
export const mockCreateQuickPick = jest.fn();
export const mockGetSession = jest.fn();
export const mockProgressReport = jest.fn();
export const mockWithProgressOptions = jest.fn();

jest.mock('vscode', () => ({
    workspace: { getConfiguration: (...a: unknown[]) => mockGetConfiguration(...a) },
    window: {
        showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a),
        createQuickPick: () => mockCreateQuickPick(),
        showInformationMessage: (...a: unknown[]) => mockShowInformationMessage(...a),
        withProgress: (
            opts: unknown,
            task: (p: { report: (v: unknown) => void }) => Promise<unknown>,
        ) => {
            mockWithProgressOptions(opts);
            return task({ report: (v: unknown) => mockProgressReport(v) });
        },
    },
    commands: { executeCommand: (...a: unknown[]) => mockExecuteCommand(...a) },
    authentication: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    ThemeIcon: class {
        constructor(public readonly id: string) {}
    },
    ProgressLocation: { Notification: 15 },
}));

jest.mock('fs/promises', () => ({ rm: (...a: unknown[]) => mockRm(...a) }));

// The two ground-truth primitives for destroying a remote resource. Everything
// in the cleanup path exists to decide whether these get called.
export const mockDeleteRepository = jest.fn();
export const mockDeleteDaLiveSite = jest.fn();
export const mockGetToken = jest.fn();
export const mockStoreToken = jest.fn();
export const mockEnsureDaLiveAuth = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: () => ({
        tokenService: {
            getToken: (...a: unknown[]) => mockGetToken(...a),
            storeToken: (...a: unknown[]) => mockStoreToken(...a),
        },
        repoOperations: { deleteRepository: (...a: unknown[]) => mockDeleteRepository(...a) },
    }),
    // `{ authenticated }` — read from edsHelpers, not guessed. The first draft
    // wrote `{ success, authService }` and the DA.live cleanup silently skipped.
    ensureDaLiveAuth: (...a: unknown[]) => mockEnsureDaLiveAuth(...a),
    getDaLiveAuthService: jest.fn().mockReturnValue({}),
}));

// requireActual keeps `isEdsProject`/`extractEdsMetadata` REAL — they decide
// which confirmation path runs, and a stub of them would hide the fixture bug
// the CONTROL test exists to catch.
jest.mock('@/features/eds/services/resourceCleanupHelpers', () => ({
    ...jest.requireActual('@/features/eds/services/resourceCleanupHelpers'),
    deleteDaLiveSite: (...a: unknown[]) => mockDeleteDaLiveSite(...a),
    formatCleanupResults: () => '',
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: () => async () => 'token',
    DaLiveContentOperations: class {},
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
 * Without it, `deleteProject(context, project)` would construct a real HelixService
 * and call its real static key-store init.
 */
export const mockHelixInitKeyStore = jest.fn();
export const mockDefaultListAllPages = jest.fn();
export const mockDefaultUnpublishPages = jest.fn();
export const mockDefaultDeleteAdminApiKey = jest.fn();
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
        },
        { initKeyStore: (...a: unknown[]) => mockHelixInitKeyStore(...a) },
    ),
}));

// Real timers would make the exponential backoff take seconds of wall clock.
export const mockSleep = jest.fn().mockResolvedValue(undefined);
jest.mock('@/core/utils/sleep', () => ({ sleep: (...a: unknown[]) => mockSleep(...a) }));

// Below the mocks on purpose — see the note above about hoisting.
export {
    deleteProject,
    deleteProjectFiles,
} from '@/features/projects-dashboard/services/projectDeletionService';
export type { DeletionServices } from '@/features/projects-dashboard/services/projectDeletionService';
