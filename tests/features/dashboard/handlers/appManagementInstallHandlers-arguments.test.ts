/**
 * appManagementInstallHandlers — what the handlers hand their collaborators, and
 * the words they answer with.
 *
 * The sibling suite pins the outcomes. This one pins the ARGUMENTS: which save
 * the runner deps are built with, the version read from disk and handed to the
 * installer, where the installer's step text goes, and the card and notification
 * wording. A mock answers the same whatever it is handed, so each of these was
 * free to be wrong while every outcome test stayed green.
 */

import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import {
    KIT_STATE,
    handleGetAppBuilderInstallStatus,
    handleInstallAppBuilderComponent,
    handleReinstallAppBuilderComponent,
    handlerRunnerDeps,
    kitProject,
    mockBuildDefaultRunnerDeps,
    mockCtxSaveProject,
    mockDeveloperPermissions,
    mockInstallAppManagement,
    mockProgressSteps,
    mockProgressTitles,
    mockReadAppVersion,
    mockResolveAppManagementAuth,
    mockSendStatusUpdate,
    mockUninstallAppManagement,
    resetInstallHandlerMocks,
    setupMocks,
} from './appManagementInstallHandlers.testUtils';

const KIT_PATH = '/projects/demo/kit-app';

/** The kit, with its files on disk — where the installed version is read from. */
function kitProjectOnDisk(): Partial<Project> {
    return {
        ...kitProject(),
        componentInstances: {
            'kit-app': { id: 'kit-app', name: 'Kit App', status: 'deployed', path: KIT_PATH },
        },
    };
}

beforeEach(resetInstallHandlerMocks);

describe('handlerRunnerDeps — which save the runner is built with', () => {
    type BuiltContext = { saveProject: (p: Project) => unknown; marker?: string };
    const builtContext = (): BuiltContext =>
        mockBuildDefaultRunnerDeps.mock.calls[0][0] as BuiltContext;

    it('builds on the context it was given, saving through that context by default', async () => {
        const { mockContext, mockProject } = setupMocks(kitProject());

        await handlerRunnerDeps(mockContext, mockProject);

        expect(builtContext().marker).toBe('the built context');
        expect(builtContext().saveProject).toBe(mockCtxSaveProject);
    });

    it('saves a project that is not the open one in place, never making it current', async () => {
        // AB-73: the update check updates a pair in ANOTHER project. Saving it the
        // ordinary way would make that project the open one.
        const { mockContext, mockProject } = setupMocks(kitProject());

        await handlerRunnerDeps(mockContext, mockProject, undefined, 'in-place');
        await builtContext().saveProject(mockProject);

        expect(mockContext.stateManager.saveProjectConfigOnly).toHaveBeenCalledWith(mockProject);
        expect(mockCtxSaveProject).not.toHaveBeenCalled();
        expect(builtContext().marker).toBe('the built context');
    });

    it('hands the builder no progress adapter when the caller reports nothing', async () => {
        const { mockContext, mockProject } = setupMocks(kitProject());

        await handlerRunnerDeps(mockContext, mockProject);

        expect(mockBuildDefaultRunnerDeps.mock.calls[0][1]).toBeUndefined();
    });

    it('forwards the stage, its step and the position to the caller’s report', async () => {
        const { mockContext, mockProject } = setupMocks(kitProject());
        const report = jest.fn();

        await handlerRunnerDeps(mockContext, mockProject, report);
        const forward = mockBuildDefaultRunnerDeps.mock.calls[0][1] as (...a: unknown[]) => void;
        forward('Deploying', 'action 2 of 3', { index: 1, total: 4 });

        expect(report).toHaveBeenCalledWith('Deploying', 'action 2 of 3', { index: 1, total: 4 });
    });
});

describe('the install pass — the version it installs and where its steps go', () => {
    it('reads the version from the integration’s own files and hands it to the installer', async () => {
        const { mockContext, mockProject } = setupMocks(kitProjectOnDisk());
        mockDeveloperPermissions();

        await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(mockReadAppVersion).toHaveBeenCalledWith(KIT_PATH);
        expect(mockInstallAppManagement).toHaveBeenCalledWith(
            mockProject,
            'kit-app',
            expect.any(Function),
            { appVersion: '0.3.1' }
        );
    });

    it('installs without a version when the deps carry no version reader', async () => {
        const { mockContext } = setupMocks(kitProjectOnDisk());
        mockDeveloperPermissions();
        mockBuildDefaultRunnerDeps.mockReturnValue({
            installAppManagement: mockInstallAppManagement,
        });

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(result.success).toBe(true);
        expect(mockInstallAppManagement.mock.calls[0][3]).toStrictEqual({ appVersion: undefined });
    });

    it('installs for a project that records no component files at all', async () => {
        const { mockContext, mockProject } = setupMocks({
            ...kitProject(),
            componentInstances: undefined,
        });
        mockDeveloperPermissions();

        const result = await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(mockProject.componentInstances).toBeUndefined();
        expect(result.success).toBe(true);
        expect(mockReadAppVersion).not.toHaveBeenCalled();
    });

    it('shows the installer’s steps under the install stage', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockDeveloperPermissions();
        mockInstallAppManagement.mockImplementation(
            async (_project: unknown, _id: unknown, report: (message: string) => void) => {
                mockProgressSteps.length = 0;
                report('Waiting for Commerce to answer');
                return { status: 'installed' };
            }
        );

        await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(mockProgressSteps).toStrictEqual(['Installing into Commerce']);
    });

    it('titles the notification and the card with what is happening to what', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockDeveloperPermissions();

        await handleInstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(mockProgressTitles).toStrictEqual(['Installing Kit App']);
        expect(mockSendStatusUpdate).toHaveBeenCalledWith(
            'kit-app',
            'deploying',
            'Installing Integration'
        );
    });

    it('started from the integrations screen, it narrates in the modal and opens no notification', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockDeveloperPermissions();

        const result = await handleInstallAppBuilderComponent(mockContext, {
            id: 'kit-app',
            progress: 'modal',
        });

        expect(result.success).toBe(true);
        expect(mockProgressTitles).toStrictEqual([]);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'operationProgress',
            expect.objectContaining({ id: 'kit-app' })
        );
    });
});

describe('the reinstall pass', () => {
    it('needs an id, even with no payload at all', async () => {
        const { mockContext } = setupMocks(kitProject());

        const result = await handleReinstallAppBuilderComponent(mockContext);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.CONFIG_INVALID);
        expect(mockUninstallAppManagement).not.toHaveBeenCalled();
    });

    it('installs the version on disk after the uninstall', async () => {
        const { mockContext, mockProject } = setupMocks(kitProjectOnDisk());
        mockDeveloperPermissions();

        await handleReinstallAppBuilderComponent(mockContext, { id: 'kit-app' });

        expect(mockInstallAppManagement).toHaveBeenCalledWith(
            mockProject,
            'kit-app',
            expect.any(Function),
            { appVersion: '0.3.1' }
        );
    });
});

describe('the status read — what a refusal says', () => {
    it('names the integration the project does not have', async () => {
        const { mockContext } = setupMocks({ appBuilderComponents: {} });

        const result = await handleGetAppBuilderInstallStatus(mockContext, { id: 'ghost' });

        expect(result.error).toBe('Integration "ghost" not found.');
    });

    it('says why an integration with no install API has no install state', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                plain: {
                    ...KIT_STATE,
                    deployedUrls: { 'web/x': 'https://ns.adobeioruntime.net/api/v1/web/x' },
                },
            },
        });

        const result = await handleGetAppBuilderInstallStatus(mockContext, { id: 'plain' });

        expect(result.error).toBe(
            '"plain" is not an App Management app (it deploys no install API), so it has no install state.'
        );
    });

    it('says a sign-in is needed when there is none', async () => {
        const { mockContext } = setupMocks(kitProject());
        mockResolveAppManagementAuth.mockResolvedValue(undefined);

        const result = await handleGetAppBuilderInstallStatus(mockContext, { id: 'kit-app' });

        expect(result.error).toBe('Adobe sign-in required to read the install state.');
    });

    it('reads an app that has no install record yet, repairing nothing', async () => {
        // A record with no `installation` is the state right after a deploy whose
        // install pass never ran. The live read must still answer.
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'kit-app': { ...KIT_STATE, installation: undefined } },
        });

        const result = (await handleGetAppBuilderInstallStatus(mockContext, {
            id: 'kit-app',
        })) as { success: boolean; data: Record<string, unknown> };

        expect(result.success).toBe(true);
        expect(result.data).toStrictEqual({
            id: 'kit-app',
            persisted: undefined,
            live: {
                status: 'succeeded',
                startedAt: '2026-08-27T01:00:00Z',
                completedAt: '2026-08-27T01:02:00Z',
            },
        });
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
    });
});
