/**
 * ConfigureProjectWebviewCommand — save-configuration authoring-experience behavior.
 *
 * The per-project authoring experience is a setup-time preference saved from the
 * Configure webview. On save, the handler persists it into the EDS component
 * metadata and, ONLY when it changed, re-applies the site-scoped DA editor.path
 * via applyDaLiveOrgConfigSettings (non-fatal).
 */

import { ConfigureProjectWebviewCommand } from './configure.testUtils';
import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/types/logger';
import { StateManager } from '@/core/state/stateManager';
import type { Project } from '@/types/base';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';



import { internals } from '../../../helpers/commandInternals';
import { createMockProject } from '../../../helpers/projectFake';
// Mesh / storefront staleness — return "no changes" so the save path stays simple.
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    detectMeshChanges: jest.fn().mockResolvedValue({ hasChanges: false }),
}));

// EDS feature index. On an EW flip the handler regenerates config.json via
// republishStorefrontConfig — that's what lands the quick-edit Sidekick plugin
// (the EW canvas reads plugins from config.json).
const mockRepublishStorefrontConfig = jest.fn().mockResolvedValue({ success: true });
// The '@/features/eds' barrel was retired under ADR-022, so these names are mocked
// at the modules that declare them. isEdsProject is a type guard and lives in
// @/types/typeGuards, whose other guards stay real.
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: jest.fn(() => true),
}));
jest.mock('@/features/eds/services/storefront/storefrontStalenessDetector', () => ({
    detectStorefrontChanges: jest.fn(() => ({ hasChanges: false })),
}));
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: (...args: unknown[]) => mockRepublishStorefrontConfig(...args),
}));

// The config.json regen now runs through the shared authoringExperienceFlip
// service, which imports republishStorefrontConfig directly from its module
// (not the feature index). Mock that path so the same spy observes the call.
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: (...args: unknown[]) => mockRepublishStorefrontConfig(...args),
}));

// EDS helpers — applyDaLiveOrgConfigSettings is the re-apply we assert on.
const mockApplyDaLiveOrgConfigSettings = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    getDaLiveAuthService: jest.fn(() => ({})),
    resolveProjectAuthoringExperience: jest.fn(() => 'da-live-classic'),
    // The live-update push threads the EW canvas branch into getEdsDaLiveUrl.
    // Default is '' (param-less production canvas).
    getEwCanvasBranch: jest.fn(() => ''),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({})),
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
}));

// Quick Edit vendoring — flipping to Experience Workspace must vendor Quick Edit
// into the storefront repo on the spot (idempotent, non-fatal).
const mockInstallQuickEdit = jest.fn().mockResolvedValue({ installed: true });
jest.mock('@/features/eds/services/quickEditPublisher', () => ({
    installQuickEdit: (...args: unknown[]) => mockInstallQuickEdit(...args),
}));

// HelixService — after vendoring, the flip previews the code ('/*') so the
// committed Quick Edit change goes live (the EW Layout view). Non-fatal.
const mockPreviewCode = jest.fn().mockResolvedValue(undefined);
// HelixService is NOT module-mocked. It arrives through the command's `helixService`
// seam, which the flip forwards — so the suite hands in the one method the Quick Edit
// vendoring calls.

// GitHub services constructed by ensureQuickEditVendored. Constructors are
// stubbed so no real Octokit/secrets access occurs; installQuickEdit is mocked
// so the file ops object is never actually used.
const mockGitHubFileOperations = jest.fn().mockImplementation(() => ({}));
jest.mock('@/features/eds/services/github/githubFileOperations', () => ({
    GitHubFileOperations: jest
        .fn()
        .mockImplementation((...args) => mockGitHubFileOperations(...args)),
}));
const mockGitHubTokenService = jest.fn().mockImplementation(() => ({}));
jest.mock('@/features/eds/services/github/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation((...args) => mockGitHubTokenService(...args)),
}));

// Dashboard live-update push — the save handler posts the new DA URL to an
// already-open dashboard immediately after the metadata save (the tile label
// is static; only the URL is live).
const mockSendAuthoringExperienceUpdate = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendAuthoringExperienceUpdate: (...args: unknown[]) =>
            mockSendAuthoringExperienceUpdate(...args),
        refreshStatus: jest.fn().mockResolvedValue(undefined),
    },
}));

const NO_REPO = Symbol('no-repo');

/** Build an EDS project with a given stored authoring experience + DA coords. */
function makeEdsProject(
    stored?: string,
    githubRepo: string | typeof NO_REPO = 'acme-org/acme-storefront'
): Project {
    const repo = githubRepo === NO_REPO ? undefined : githubRepo;
    return createMockProject({
        name: 'Test Project',
        path: '/test/project',
        // EDS stack id so the real getEdsDaLiveUrl (typeGuards.isEdsProject) resolves
        // the DA URL pushed to the dashboard on a flip.
        selectedStack: 'eds-citisignal',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                metadata: {
                    daLiveOrg: 'my-org',
                    daLiveSite: 'my-site',
                    ...(repo ? { githubRepo: repo } : {}),
                    ...(stored ? { authoringExperience: stored } : {}),
                },
            },
        },
    });
}

/** Capture the save-configuration streaming handler registered by the command. */
function captureSaveHandler(
    command: ConfigureProjectWebviewCommand
): (data: unknown) => Promise<unknown> {
    const handlers = new Map<string, (data: unknown) => Promise<unknown>>();
    const fakeComm = {
        onStreaming: (type: string, fn: (data: unknown) => Promise<unknown>) => {
            handlers.set(type, fn);
        },
    };
    (
        command as unknown as { initializeMessageHandlers: (c: unknown) => void }
    ).initializeMessageHandlers(fakeComm);
    const handler = handlers.get('save-configuration');
    if (!handler) throw new Error('save-configuration handler not registered');
    // The handler returns success immediately and defers the authoring DA
    // side-effects (editor.path re-apply + Quick Edit vendoring/preview) to a
    // post-response setImmediate behind a progress toast, so the Save button never
    // blocks. Wrap so each save() drains those deferred immediates + microtasks
    // before resolving — keeping side-effect assertions valid.
    return async (data: unknown) => {
        const result = await handler(data);
        for (let i = 0; i < 5; i++) {
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
        return result;
    };
}


/**
 * ADR-015 (2026-08-28): this boundary resolves its collaborators from the
 * registry, which the shared node setup empties after EVERY test — so the fakes
 * are seeded per-test rather than mocked at the module level.
 */
beforeEach(() => {
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
    ServiceLocator.setAuthenticationService(
        createMockAuthenticationService({
            getCachedOrganization: jest.fn(),
            getTokenStatus: jest.fn(async () => ({ isAuthenticated: true, expiresInMinutes: 60 })),
        })
    );
});

describe('ConfigureProjectWebviewCommand - save-configuration authoring experience', () => {
    let command: ConfigureProjectWebviewCommand;
    let mockContext: vscode.ExtensionContext;
    let mockStateManager: jest.Mocked<StateManager>;
    let mockLogger: Logger;
    let savedProject: Project | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        savedProject = undefined;

        mockContext = createMockExtensionContext();

        mockLogger = createMockLogger() as unknown as Logger;

        mockStateManager = {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockImplementation((p: Project) => {
                savedProject = p;
                return Promise.resolve();
            }),
        } as unknown as jest.Mocked<StateManager>;

        command = new ConfigureProjectWebviewCommand(
            mockContext,
            mockStateManager as unknown as StateManager,
            mockLogger
        );
        command.helixService = { previewCode: mockPreviewCode };
        // Same seam, same reason: unset, the command resolves the shared GitHub
        // services, and that path calls getLogger() — which throws in a suite that
        // initialises no logger.
        command.githubTokenService = {} as NonNullable<
            typeof command.githubTokenService
        >;

        // Stub side-effecting private methods so the save path doesn't touch disk.
        internals(command).registerProgrammaticWrites = jest.fn().mockResolvedValue(undefined);
        internals(command).regenerateEnvFiles = jest.fn().mockResolvedValue(undefined);
        internals(command).showPostSaveNotifications = jest.fn();
    });

    it('persists the changed authoringExperience into EDS metadata', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        const result = await save({
            componentConfigs: {},
            authoringExperience: 'experience-workspace',
        });

        expect(result).toEqual({ success: true });
        const meta = savedProject?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
        expect(meta?.authoringExperience).toBe('experience-workspace');
    });

    it('re-applies editor.path with the new experience when it changed', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledTimes(1);
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledWith(
            expect.anything(),
            'my-org',
            'my-site',
            expect.anything(),
            'experience-workspace'
        );
    });

    it('does NOT re-apply editor.path when the experience is unchanged', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(
            makeEdsProject('experience-workspace')
        );
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(mockApplyDaLiveOrgConfigSettings).not.toHaveBeenCalled();
    });

    // ── Live dashboard push ──────────────────────────────────────────────────
    // An already-open dashboard freezes its Author label + DA URL at open. On a
    // flip, the save handler pushes the new values so the tile updates instantly.

    it('pushes the new authoring experience + DA URL to the dashboard when it changed', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(mockSendAuthoringExperienceUpdate).toHaveBeenCalledTimes(1);
        expect(mockSendAuthoringExperienceUpdate).toHaveBeenCalledWith(
            'https://da.live/canvas#/my-org/my-site/index'
        );
    });

    it('does NOT push a dashboard update when the experience is unchanged', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(
            makeEdsProject('experience-workspace')
        );
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(mockSendAuthoringExperienceUpdate).not.toHaveBeenCalled();
    });

    it('is non-fatal: a DA failure still resolves the save successfully', async () => {
        mockApplyDaLiveOrgConfigSettings.mockRejectedValueOnce(new Error('DA down'));
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        const result = await save({
            componentConfigs: {},
            authoringExperience: 'experience-workspace',
        });

        expect(result).toEqual({ success: true });
        // Metadata write still stands.
        const meta = savedProject?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
        expect(meta?.authoringExperience).toBe('experience-workspace');
    });

    // ── Quick Edit vendoring on the EW flip ──────────────────────────────────
    // The EW Layout/WYSIWYG view needs Quick Edit wiring in the repo. An existing
    // project flipped to EW via Configure won't have it until a reset, so the flip
    // vendors it on the spot (idempotent → no-op when already present).

    it('vendors Quick Edit (parsed owner/repo) when flipping TO experience-workspace', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(mockInstallQuickEdit).toHaveBeenCalledTimes(1);
        const [, repoOwner, repoName] = mockInstallQuickEdit.mock.calls[0];
        expect(repoOwner).toBe('acme-org');
        expect(repoName).toBe('acme-storefront');

        // Code preview pushes the committed Quick Edit change live (EW Layout view).
        expect(mockPreviewCode).toHaveBeenCalledWith('acme-org', 'acme-storefront', '/*');
    });

    it('is non-fatal: a code-preview failure still resolves the save and keeps the metadata', async () => {
        mockPreviewCode.mockRejectedValueOnce(new Error('Helix down'));
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        const result = await save({
            componentConfigs: {},
            authoringExperience: 'experience-workspace',
        });

        expect(result).toEqual({ success: true });
        const meta = savedProject?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
        expect(meta?.authoringExperience).toBe('experience-workspace');
    });

    it('does NOT vendor Quick Edit when flipping TO da-live-classic', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(
            makeEdsProject('experience-workspace')
        );
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'da-live-classic' });

        expect(mockInstallQuickEdit).not.toHaveBeenCalled();
    });

    it('skips Quick Edit vendoring when no githubRepo metadata is present', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(
            makeEdsProject('da-live-classic', NO_REPO)
        );
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(mockInstallQuickEdit).not.toHaveBeenCalled();
    });

    it('is non-fatal: a Quick Edit vendoring failure still resolves the save and keeps the metadata', async () => {
        mockInstallQuickEdit.mockRejectedValueOnce(new Error('GitHub down'));
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        const result = await save({
            componentConfigs: {},
            authoringExperience: 'experience-workspace',
        });

        expect(result).toEqual({ success: true });
        const meta = savedProject?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
        expect(meta?.authoringExperience).toBe('experience-workspace');
    });

    // ── Single-toast: the authoring progress toast is the confirmation ───────
    it('suppresses the generic "saved" toast when the authoring experience changed', async () => {
        // Use the real showPostSaveNotifications (beforeEach stubs it out).
        delete (command as unknown as Record<string, unknown>).showPostSaveNotifications;
        const successSpy = jest
            .spyOn(
                command as unknown as { showSuccessMessage: (m: string) => void },
                'showSuccessMessage'
            )
            .mockImplementation(() => {});
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(successSpy).not.toHaveBeenCalled();
    });

    // ── Quick Edit Sidekick plugin registration on the EW flip ───────────────
    // The quick-edit plugin (which dispatches the custom:quick-edit event) lives
    // in config-template.json and is registered at create/reset. An EXISTING
    // project flipped to EW via Configure never got it — so the flip
    // (re-)registers the site config, mirroring how reset does it.

    it('regenerates config.json (adding the quick-edit plugin) when flipping TO experience-workspace', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(mockRepublishStorefrontConfig).toHaveBeenCalledTimes(1);
        expect(mockRepublishStorefrontConfig).toHaveBeenCalledWith(
            expect.objectContaining({ project: expect.anything() })
        );
    });

    it('does NOT regenerate config.json when flipping TO da-live-classic', async () => {
        mockStateManager.getCurrentProject.mockResolvedValue(
            makeEdsProject('experience-workspace')
        );
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'da-live-classic' });

        expect(mockRepublishStorefrontConfig).not.toHaveBeenCalled();
    });

    it('is non-fatal: a config.json regeneration failure still resolves the save and keeps the metadata', async () => {
        mockRepublishStorefrontConfig.mockRejectedValueOnce(new Error('Config sync down'));
        mockStateManager.getCurrentProject.mockResolvedValue(makeEdsProject('da-live-classic'));
        const save = captureSaveHandler(command);

        const result = await save({
            componentConfigs: {},
            authoringExperience: 'experience-workspace',
        });

        expect(result).toEqual({ success: true });
        const meta = savedProject?.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
        expect(meta?.authoringExperience).toBe('experience-workspace');
    });

    it('shows the generic "saved" toast for a save with no authoring change', async () => {
        delete (command as unknown as Record<string, unknown>).showPostSaveNotifications;
        const successSpy = jest
            .spyOn(
                command as unknown as { showSuccessMessage: (m: string) => void },
                'showSuccessMessage'
            )
            .mockImplementation(() => {});
        mockStateManager.getCurrentProject.mockResolvedValue(
            makeEdsProject('experience-workspace')
        );
        const save = captureSaveHandler(command);

        await save({ componentConfigs: {}, authoringExperience: 'experience-workspace' });

        expect(successSpy).toHaveBeenCalledWith('Configuration saved successfully');
    });
});
