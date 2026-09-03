/**
 * updateExecutor.performComponentUpdates and the Inspector SDK half of
 * performAddonUpdates.
 *
 * Component updates are grouped per project so the project is saved ONCE after
 * all of its components, and the running-demo guard is asked once per project
 * rather than once per component. What the updater is handed — the project, the
 * component id, the download URL, the version — is the contract with the
 * updater, so it is asserted as arguments, not inferred from the outcome.
 */

import { captureProgress, makeUpdateContext } from './updateExecutor.testUtils';
import * as vscode from 'vscode';
import {
    performAddonUpdates,
    performComponentUpdates,
} from '@/features/updates/commands/updateExecutor';
import type {
    InspectorUpdateItem,
    ProjectUpdateItem,
} from '@/features/updates/commands/updateTypes';
import { ComponentUpdater } from '@/features/updates/services/componentUpdater';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/updates/services/componentUpdater');

const UpdaterMock = ComponentUpdater as jest.MockedClass<typeof ComponentUpdater>;
const showWarningMock = vscode.window.showWarningMessage as jest.Mock;
const showErrorMock = vscode.window.showErrorMessage as jest.Mock;
const withProgressMock = vscode.window.withProgress as jest.Mock;

const RELEASE = {
    version: '2.0.0',
    downloadUrl: 'https://example.com/mesh-2.0.0.zip',
    releaseNotes: '',
    publishedAt: '2026-01-01T00:00:00Z',
    isPrerelease: false,
};

function makeItem(project: Project, overrides: Partial<ProjectUpdateItem> = {}): ProjectUpdateItem {
    return {
        project,
        componentId: 'api-mesh',
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        releaseInfo: RELEASE,
        isProjectUpdate: true,
        label: project.name,
        ...overrides,
    };
}

describe('performComponentUpdates', () => {
    let updateComponent: jest.Mock;
    let report: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        updateComponent = jest.fn().mockResolvedValue(undefined);
        UpdaterMock.prototype.updateComponent = updateComponent;
        report = captureProgress();
    });

    it('builds the updater from the context and hands it project, id, download URL and version', async () => {
        const ctx = makeUpdateContext();
        const project = createMockProject();

        await performComponentUpdates([makeItem(project)], ctx);

        expect(UpdaterMock).toHaveBeenCalledWith(ctx.logger, '/ext', ctx.commandManager);
        expect(updateComponent).toHaveBeenCalledWith(
            project,
            'api-mesh',
            'https://example.com/mesh-2.0.0.zip',
            '2.0.0',
        );
    });

    it('groups by project: updates every component, saves the project once, splits the bar evenly', async () => {
        const ctx = makeUpdateContext();
        const project = createMockProject({ name: 'demo' });

        await performComponentUpdates(
            [makeItem(project), makeItem(project, { componentId: 'eds-storefront' })],
            ctx,
        );

        expect(updateComponent).toHaveBeenCalledTimes(2);
        expect(ctx.stateManager.saveProject).toHaveBeenCalledTimes(1);
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(report).toHaveBeenNthCalledWith(1, { message: 'api-mesh in demo…', increment: 50 });
        expect(report).toHaveBeenNthCalledWith(2, {
            message: 'eds-storefront in demo…',
            increment: 50,
        });
    });

    it('shows a non-cancellable notification titled Updating Components', async () => {
        const ctx = makeUpdateContext();

        await performComponentUpdates([makeItem(createMockProject())], ctx);

        expect(withProgressMock).toHaveBeenCalledWith(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Updating Components',
                cancellable: false,
            },
            expect.any(Function),
        );
    });

    it('a selection without release info is skipped — but its project is still saved', async () => {
        const ctx = makeUpdateContext();
        const project = createMockProject();

        await performComponentUpdates([makeItem(project, { releaseInfo: undefined })], ctx);

        expect(updateComponent).not.toHaveBeenCalled();
        expect(showWarningMock).not.toHaveBeenCalled();
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('a running project whose demo the user keeps is dropped entirely', async () => {
        const ctx = makeUpdateContext();
        const project = createMockProject({ status: 'running' });
        showWarningMock.mockResolvedValue('Skip');

        await performComponentUpdates([makeItem(project)], ctx);

        expect(showWarningMock).toHaveBeenCalledWith(
            expect.stringContaining('is currently running'),
            'Stop & Update',
            'Skip',
        );
        expect(withProgressMock).not.toHaveBeenCalled();
        expect(updateComponent).not.toHaveBeenCalled();
        expect(ctx.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('a skipped project does not take the others with it', async () => {
        const ctx = makeUpdateContext();
        const running = createMockProject({ name: 'a', path: '/p/a', status: 'running' });
        const idle = createMockProject({ name: 'b', path: '/p/b', status: 'ready' });
        showWarningMock.mockResolvedValue('Skip');

        await performComponentUpdates([makeItem(running), makeItem(idle)], ctx);

        expect(updateComponent).toHaveBeenCalledTimes(1);
        expect(updateComponent).toHaveBeenCalledWith(idle, 'api-mesh', RELEASE.downloadUrl, '2.0.0');
        expect(report).toHaveBeenCalledWith({ message: 'api-mesh in b…', increment: 100 });
    });

    it('all succeed: no warning summary', async () => {
        const ctx = makeUpdateContext();

        await performComponentUpdates([makeItem(createMockProject())], ctx);

        expect(showWarningMock).not.toHaveBeenCalled();
        expect(showErrorMock).not.toHaveBeenCalled();
    });

    it('a failing component shows its error, the others proceed, and the summary counts both', async () => {
        const ctx = makeUpdateContext();
        const project = createMockProject({ name: 'demo' });
        updateComponent
            .mockRejectedValueOnce(new Error('download 404\nat stack'))
            .mockResolvedValueOnce(undefined);

        await performComponentUpdates(
            [makeItem(project), makeItem(project, { componentId: 'eds-storefront' })],
            ctx,
        );

        expect(showErrorMock).toHaveBeenCalledWith(
            'Failed to update api-mesh in demo: download 404',
        );
        expect(ctx.logger.error).toHaveBeenCalledTimes(1);
        expect(showWarningMock).toHaveBeenCalledWith(
            'Updated 1 component(s), 1 failed. Restart affected demos to apply changes.',
            'OK',
        );
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
    });
});

describe('performAddonUpdates — Inspector SDK', () => {
    function makeInspectorItem(project: Project): InspectorUpdateItem {
        return {
            project,
            latestCommit: 'sdk-new',
            commitsBehind: 4,
            isInspectorUpdate: true,
            label: 'Inspector SDK',
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
        });
    });

    it('moves the recorded SDK commit to the latest and saves the project', async () => {
        const ctx = makeUpdateContext();
        const project = createMockProject({
            installedInspectorSdk: { commitSha: 'sdk-old', installedAt: '2026-01-01T00:00:00Z' },
        });

        await performAddonUpdates([], [makeInspectorItem(project)], new Set(), ctx);

        expect(project.installedInspectorSdk?.commitSha).toBe('sdk-new');
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(showErrorMock).not.toHaveBeenCalled();
    });

    it('rolls the commit back and shows the error when the save fails', async () => {
        const ctx = makeUpdateContext({
            saveProject: jest.fn().mockRejectedValue(new Error('disk full')),
        });
        const project = createMockProject({
            installedInspectorSdk: { commitSha: 'sdk-old', installedAt: '2026-01-01T00:00:00Z' },
        });

        await expect(
            performAddonUpdates([], [makeInspectorItem(project)], new Set(), ctx),
        ).resolves.toBeUndefined();

        expect(project.installedInspectorSdk?.commitSha).toBe('sdk-old');
        expect(showErrorMock).toHaveBeenCalledWith('Failed to update Inspector SDK: disk full');
        expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    });
});
