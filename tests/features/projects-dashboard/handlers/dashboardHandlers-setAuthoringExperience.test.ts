/**
 * Dashboard Handlers - setAuthoringExperience flip handler tests
 *
 * Covers handleSetAuthoringExperience:
 * - Payload validation (missing projectPath / non-union experience)
 * - Project path validation
 * - Pure-local persist via saveProjectConfigOnly (NOT saveProject)
 * - Immediate site-scoped editor.path re-apply via applyDaLiveOrgConfigSettings
 *   (with the flipped experience), reusing the DA token provider seam
 * - No full republish pipeline (no config regen / Helix calls)
 * - Non-fatal editor.path re-apply: metadata still persisted, success + warning
 */

import * as os from 'os';
import * as path from 'path';

// =============================================================================
// Mocks (declared before importing the module under test)
// =============================================================================

// Make filesystem path-safety checks deterministic (identity realpath).
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn((p: string) => p),
}));

// Required by the dashboardHandlers module graph.
jest.mock('@/features/dashboard/handlers/meshStatusHelpers', () => ({
    hasMeshDeploymentRecord: jest.fn().mockReturnValue(false),
    determineMeshStatus: jest.fn().mockResolvedValue('deployed'),
}));
jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    detectMeshChanges: jest.fn().mockResolvedValue({ hasChanges: false }),
}));

jest.mock('vscode', () => ({
    commands: { executeCommand: jest.fn() },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({ get: jest.fn() }),
    },
    Uri: { parse: jest.fn((u: string) => ({ toString: () => u })) },
    env: { openExternal: jest.fn(), clipboard: { writeText: jest.fn() } },
    window: { showInformationMessage: jest.fn(), showErrorMessage: jest.fn() },
}), { virtual: true });

// edsHelpers: applyDaLiveOrgConfigSettings + getDaLiveAuthService are the seam
// the flip handler reuses. resolveProjectAuthoringExperience is imported by the
// module at load time, so it must be present in the mock.
const mockApplyDaLiveOrgConfigSettings = jest.fn().mockResolvedValue(undefined);
const mockGetDaLiveAuthService = jest.fn().mockReturnValue({
    getAccessToken: jest.fn().mockResolvedValue('token'),
});
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    getDaLiveAuthService: (...args: unknown[]) => mockGetDaLiveAuthService(...args),
    resolveProjectAuthoringExperience: jest.fn().mockReturnValue('universal-editor'),
}));

// DA content ops construction seam (token provider + ops class).
// DaLiveContentOperations is constructed with `new`, so it must be a real
// (constructable) function — an arrow would throw "is not a constructor".
const mockCreateDaLiveServiceTokenProvider = jest.fn().mockReturnValue({
    getAccessToken: jest.fn().mockResolvedValue('token'),
});
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(function () {
        return {};
    }),
    createDaLiveServiceTokenProvider: (...args: unknown[]) => mockCreateDaLiveServiceTokenProvider(...args),
}));

// Guard: the full republish pipeline must NOT run. If the handler ever imports
// it, this mock lets us assert it was never invoked.
const mockRepublishStorefrontContent = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/features/eds/services/storefrontRepublishService', () => ({
    republishStorefrontContent: (...args: unknown[]) => mockRepublishStorefrontContent(...args),
}));

import { handleSetAuthoringExperience } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';

// =============================================================================
// Test utilities
// =============================================================================

function getProjectsBasePath(): string {
    return path.join(os.homedir(), '.demo-builder', 'projects');
}

function createEdsProject(overrides?: Partial<Project>): Project {
    const now = new Date();
    return {
        name: 'EDS Project',
        created: now,
        lastModified: now,
        path: path.join(getProjectsBasePath(), 'eds-project'),
        status: 'ready',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-org/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
            },
        },
        ...overrides,
    } as unknown as Project;
}

function createContext(project: Project | null): {
    context: HandlerContext;
    loadProjectFromPath: jest.Mock;
    saveProject: jest.Mock;
    saveProjectConfigOnly: jest.Mock;
} {
    const loadProjectFromPath = jest.fn().mockResolvedValue(project);
    const saveProject = jest.fn().mockResolvedValue(undefined);
    const saveProjectConfigOnly = jest.fn().mockResolvedValue(undefined);
    const context = {
        stateManager: { loadProjectFromPath, saveProject, saveProjectConfigOnly },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
        context: { secrets: {}, globalState: { get: jest.fn(), update: jest.fn() } },
        sendMessage: jest.fn(),
    } as unknown as HandlerContext;
    return { context, loadProjectFromPath, saveProject, saveProjectConfigOnly };
}

// =============================================================================
// Tests
// =============================================================================

describe('handleSetAuthoringExperience', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockApplyDaLiveOrgConfigSettings.mockResolvedValue(undefined);
    });

    describe('payload validation', () => {
        it('returns error when projectPath is missing', async () => {
            const { context } = createContext(createEdsProject());

            const result = await handleSetAuthoringExperience(context, {
                experience: 'experience-workspace',
            } as never);

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        });

        it('returns error when experience is not a valid union value', async () => {
            const { context } = createContext(createEdsProject());

            const result = await handleSetAuthoringExperience(context, {
                projectPath: createEdsProject().path,
                experience: 'totally-invalid' as never,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();
        });
    });

    describe('project path validation', () => {
        it('returns failure for an invalid (traversal) project path', async () => {
            const { context } = createContext(null);

            const result = await handleSetAuthoringExperience(context, {
                projectPath: '/etc/passwd',
                experience: 'experience-workspace',
            });

            expect(result.success).toBe(false);
        });
    });

    describe('happy path persistence', () => {
        it('writes authoringExperience into EDS metadata and persists via saveProjectConfigOnly', async () => {
            const project = createEdsProject();
            const { context, saveProjectConfigOnly, saveProject } = createContext(project);

            const result = await handleSetAuthoringExperience(context, {
                projectPath: project.path,
                experience: 'experience-workspace',
            });

            expect(result.success).toBe(true);
            expect(saveProjectConfigOnly).toHaveBeenCalledTimes(1);
            const saved = saveProjectConfigOnly.mock.calls[0][0] as Project;
            expect(
                saved.componentInstances?.['eds-storefront']?.metadata?.authoringExperience,
            ).toBe('experience-workspace');
            // Pure-local persist — saveProject (with onProjectChanged side effects) must not run.
            expect(saveProject).not.toHaveBeenCalled();
        });

        it('loads the project without persisting on load (persistAfterLoad: false)', async () => {
            const project = createEdsProject();
            const { context, loadProjectFromPath } = createContext(project);

            await handleSetAuthoringExperience(context, {
                projectPath: project.path,
                experience: 'experience-workspace',
            });

            expect(loadProjectFromPath).toHaveBeenCalledWith(
                project.path,
                undefined,
                { persistAfterLoad: false },
            );
        });

        it('returns failure when the project is not found', async () => {
            const { context } = createContext(null);

            const result = await handleSetAuthoringExperience(context, {
                projectPath: createEdsProject().path,
                experience: 'experience-workspace',
            });

            expect(result.success).toBe(false);
        });
    });

    describe('editor.path re-apply', () => {
        it('re-applies site-scoped editor.path with the flipped experience after persist', async () => {
            const project = createEdsProject();
            const { context } = createContext(project);

            await handleSetAuthoringExperience(context, {
                projectPath: project.path,
                experience: 'experience-workspace',
            });

            expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledTimes(1);
            const callArgs = mockApplyDaLiveOrgConfigSettings.mock.calls[0];
            // (daLiveContentOps, daLiveOrg, daLiveSite, logger, experience)
            expect(callArgs[1]).toBe('test-org');
            expect(callArgs[2]).toBe('test-site');
            expect(callArgs[4]).toBe('experience-workspace');
        });

        it('does NOT run the full republishStorefrontContent pipeline', async () => {
            const project = createEdsProject();
            const { context } = createContext(project);

            await handleSetAuthoringExperience(context, {
                projectPath: project.path,
                experience: 'universal-editor',
            });

            expect(mockRepublishStorefrontContent).not.toHaveBeenCalled();
        });

        it('is non-fatal: persists metadata and returns success+warning when re-apply throws', async () => {
            const project = createEdsProject();
            const { context, saveProjectConfigOnly } = createContext(project);
            mockApplyDaLiveOrgConfigSettings.mockRejectedValueOnce(new Error('DA down'));

            const result = await handleSetAuthoringExperience(context, {
                projectPath: project.path,
                experience: 'experience-workspace',
            });

            // Metadata write stands.
            expect(saveProjectConfigOnly).toHaveBeenCalledTimes(1);
            // Handler still reports success...
            expect(result.success).toBe(true);
            // ...with a warning surfaced.
            expect(result.warning).toBeTruthy();
        });
    });
});
