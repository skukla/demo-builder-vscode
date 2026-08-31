/**
 * applyAuthoringExperienceFlip — shared authoring-experience side-effect service.
 *
 * Verifies the three consolidated side-effects (editor.path re-apply, Quick Edit
 * vendoring, config.json regen) run in the right order, are gated correctly by
 * experience, and are each individually non-fatal (a failure → 'warn', never a
 * throw). Collaborators are mocked at their module boundaries, matching the
 * Configure authoring-experience test's mocking style.
 */

import type { HelixService } from '@/features/eds/services/helix/helixService';
import { applyAuthoringExperienceFlip } from '@/features/eds/services/authoringExperienceFlip';
import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';
import type { Logger } from '@/types/logger';
import type { AuthoringExperience, Project } from '@/types';
import { createMockLogger } from '../../../helpers/loggerFake';
import type { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';


const mockApplyDaLiveOrgConfigSettings = jest.fn().mockResolvedValue(undefined);
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    getDaLiveAuthService: jest.fn(() => ({})),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({})),
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
}));

const mockInstallQuickEdit = jest.fn().mockResolvedValue({ installed: true });
jest.mock('@/features/eds/services/quickEditPublisher', () => ({
    installQuickEdit: (...args: unknown[]) => mockInstallQuickEdit(...args),
}));

const mockPreviewCode = jest.fn().mockResolvedValue(undefined);

/**
 * Helix arrives through `AuthoringExperienceFlipDeps` rather than by mocking the
 * module (ADR-016 wall). `previewCode` is the only method this flow calls, so the
 * partial fake is cast into the real type once, here — ADR-016 rule 2.
 */
const fakeHelix = { previewCode: mockPreviewCode } as unknown as HelixService;

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

const mockRepublishStorefrontConfig = jest.fn().mockResolvedValue({ success: true });
jest.mock('@/features/eds/services/storefront/storefrontRepublishService', () => ({
    republishStorefrontConfig: (...args: unknown[]) => mockRepublishStorefrontConfig(...args),
}));

const NO_REPO = Symbol('no-repo');
const NO_COORDS = Symbol('no-coords');

function makeEdsProject(
    githubRepo: string | typeof NO_REPO = 'acme-org/acme-storefront',
    coords: 'coords' | typeof NO_COORDS = 'coords'
): Project {
    const repo = githubRepo === NO_REPO ? undefined : githubRepo;
    const hasCoords = coords !== NO_COORDS;
    return {
        name: 'Test Project',
        path: '/test/project',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                metadata: {
                    ...(hasCoords ? { daLiveOrg: 'my-org', daLiveSite: 'my-site' } : {}),
                    ...(repo ? { githubRepo: repo } : {}),
                },
            },
        },
    } as unknown as Project;
}

describe('applyAuthoringExperienceFlip', () => {
    let mockContext: vscode.ExtensionContext;
    let mockLogger: Logger;
    let fakeTokenService: GitHubTokenService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = {
            secrets: { get: jest.fn(), store: jest.fn() },
        } as unknown as vscode.ExtensionContext;
        mockLogger = createMockLogger() as unknown as Logger;
        fakeTokenService = {
            getToken: jest.fn().mockResolvedValue('gh-token'),
        } as unknown as GitHubTokenService;
    });

    function flip(project: Project, experience: AuthoringExperience) {
        return applyAuthoringExperienceFlip(project, experience, {
            helixService: fakeHelix,
            context: mockContext,
            logger: mockLogger,
            saveProject: jest.fn().mockResolvedValue(undefined),
            // Handed in now rather than constructed inside the service. The suite
            // never drives it directly — GitHubFileOperations and HelixService are
            // what receive it — so a bare object is the honest fake.
            githubTokenService: fakeTokenService,
        });
    }

    it('re-applies editor.path with the org/site/experience for da-live-classic', async () => {
        const result = await flip(makeEdsProject(), 'da-live-classic');

        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledTimes(1);
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledWith(
            expect.anything(),
            'my-org',
            'my-site',
            expect.anything(),
            'da-live-classic'
        );
        expect(result.editorPath).toBe('ok');
    });

    it('skips editor.path when DA org/site coordinates are missing (still ok)', async () => {
        const result = await flip(
            makeEdsProject('acme-org/acme-storefront', NO_COORDS),
            'da-live-classic'
        );

        expect(mockApplyDaLiveOrgConfigSettings).not.toHaveBeenCalled();
        expect(result.editorPath).toBe('ok');
    });

    it('da-live-classic SKIPS Quick Edit + config.json regen', async () => {
        const result = await flip(makeEdsProject(), 'da-live-classic');

        expect(mockInstallQuickEdit).not.toHaveBeenCalled();
        expect(mockRepublishStorefrontConfig).not.toHaveBeenCalled();
        expect(result).toEqual({ editorPath: 'ok', quickEdit: 'skipped', configRegen: 'skipped' });
    });

    it('experience-workspace runs all three side-effects and returns ok', async () => {
        const result = await flip(makeEdsProject(), 'experience-workspace');

        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledWith(
            expect.anything(),
            'my-org',
            'my-site',
            expect.anything(),
            'experience-workspace'
        );
        const [, repoOwner, repoName] = mockInstallQuickEdit.mock.calls[0];
        expect(repoOwner).toBe('acme-org');
        expect(repoName).toBe('acme-storefront');
        expect(mockPreviewCode).toHaveBeenCalledWith('acme-org', 'acme-storefront', '/*');
        expect(mockRepublishStorefrontConfig).toHaveBeenCalledWith(
            expect.objectContaining({ project: expect.anything() })
        );
        expect(result).toEqual({ editorPath: 'ok', quickEdit: 'ok', configRegen: 'ok' });
    });

    it('skips Quick Edit vendoring when no githubRepo metadata is present (still ok)', async () => {
        const result = await flip(makeEdsProject(NO_REPO), 'experience-workspace');

        expect(mockInstallQuickEdit).not.toHaveBeenCalled();
        expect(result.quickEdit).toBe('ok');
    });

    it('editor.path failure is swallowed → warn (never throws)', async () => {
        mockApplyDaLiveOrgConfigSettings.mockRejectedValueOnce(new Error('DA down'));

        const result = await flip(makeEdsProject(), 'da-live-classic');

        expect(result.editorPath).toBe('warn');
        expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('Quick Edit failure is swallowed → warn, config regen still runs', async () => {
        mockPreviewCode.mockRejectedValueOnce(new Error('Helix down'));

        const result = await flip(makeEdsProject(), 'experience-workspace');

        expect(result.quickEdit).toBe('warn');
        expect(result.configRegen).toBe('ok');
    });

    it('config.json regen !success → warn (non-fatal)', async () => {
        mockRepublishStorefrontConfig.mockResolvedValueOnce({ success: false, error: 'boom' });

        const result = await flip(makeEdsProject(), 'experience-workspace');

        expect(result.configRegen).toBe('warn');
    });

    it('config.json regen thrown error → warn (non-fatal)', async () => {
        mockRepublishStorefrontConfig.mockRejectedValueOnce(new Error('Config sync down'));

        const result = await flip(makeEdsProject(), 'experience-workspace');

        expect(result.configRegen).toBe('warn');
    });
});
