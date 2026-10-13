/**
 * finishEditWithoutRebuild — an Edit that only adds or removes integrations does
 * just that (PL-75).
 *
 * The rebuild redeployed every integration still ticked and never removed an
 * unticked one. These pin the in-place path: which Edits take it, what it is
 * handed, the confirmation before a removal, and that a failure stops it.
 */

jest.mock('@/features/dashboard/handlers/appBuilderComponentGuards', () => ({
    runGuards: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/dashboard/handlers/appBuilderComponentRemove', () => ({
    removeWithCleanup: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/features/project-creation/handlers/executorAppBuilderPhase', () => ({
    ensureWorkspaceRuntimeReady: jest.fn().mockResolvedValue(undefined),
    executeAppBuilderIntegrationsPhase: jest.fn().mockResolvedValue(undefined),
}));

import * as vscode from 'vscode';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentGuards';
import { removeWithCleanup } from '@/features/dashboard/handlers/appBuilderComponentRemove';
import {
    ensureWorkspaceRuntimeReady,
    executeAppBuilderIntegrationsPhase,
} from '@/features/project-creation/handlers/executorAppBuilderPhase';
import { finishEditWithoutRebuild } from '@/features/project-creation/handlers/executorEditApply';
import type { Project } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const EDIT_PATH = '/p/justrite';

/** A project with the starter kit deployed, as Edit opens it. */
function savedProject(): Project {
    return createMockProject({
        name: 'justrite',
        path: EDIT_PATH,
        componentSelections: { appBuilder: ['starter-kit'], dependencies: [] },
        appBuilderComponents: {
            'starter-kit': {
                kind: 'integration',
                status: 'deployed',
                name: 'Starter Kit',
                source: { owner: 'adobe', repo: 'commerce-integration-starter-kit' },
            },
        },
    });
}

function setup(project: Project = savedProject()) {
    const stateManager = createMockStateManager({
        loadProjectFromPath: jest.fn().mockResolvedValue(project),
        saveProject: jest.fn().mockResolvedValue(undefined),
    });
    const context = createMockHandlerContext({ stateManager });
    const progress = jest.fn();
    const confirm = jest.fn().mockResolvedValue(true);
    return { context, stateManager, progress, confirm, project };
}

function config(overrides: Partial<ProjectCreationConfig> = {}): ProjectCreationConfig {
    return {
        projectName: 'justrite',
        editProjectPath: EDIT_PATH,
        selectedAppBuilderComponents: ['starter-kit'],
        editChanges: [],
        ...overrides,
    };
}

const ADD_ERP = config({
    selectedAppBuilderComponents: ['starter-kit', 'erp-integration'],
    editChanges: [
        'componentConfigs.erp-integration',
        'selectedAppBuilderComponents',
        'selectedConsoleApis.erp-integration',
    ],
    componentApiPicks: { 'erp-integration': ['AdobeIOManagementAPISDK'] },
    componentConfigs: { 'erp-integration': { ERP_NAME: 'Northwind ERP' } },
});

const REMOVE_KIT = config({
    selectedAppBuilderComponents: [],
    editChanges: ['selectedAppBuilderComponents'],
});

beforeEach(() => {
    jest.clearAllMocks();
});

describe('finishEditWithoutRebuild — which Edits it finishes', () => {
    it('saves an unchanged Edit and adds or removes nothing', async () => {
        const { context, stateManager, progress, confirm } = setup();

        expect(await finishEditWithoutRebuild(context, config(), progress, confirm)).toBe(true);

        expect(stateManager.saveProject).toHaveBeenCalledTimes(1);
        expect(runGuards).not.toHaveBeenCalled();
        expect(executeAppBuilderIntegrationsPhase).not.toHaveBeenCalled();
    });

    it('hands back to the rebuild when anything but integrations changed', async () => {
        const { context, progress, confirm } = setup();
        const changed = { ...ADD_ERP, editChanges: [...ADD_ERP.editChanges!, 'datapack'] };

        expect(await finishEditWithoutRebuild(context, changed, progress, confirm)).toBe(false);

        expect(runGuards).not.toHaveBeenCalled();
        expect(executeAppBuilderIntegrationsPhase).not.toHaveBeenCalled();
    });

    it('hands back to the rebuild for the mesh, which feeds the storefront', async () => {
        const { context, progress, confirm } = setup();
        const addMesh = config({
            selectedAppBuilderComponents: ['starter-kit', 'eds-commerce-mesh'],
            editChanges: ['selectedAppBuilderComponents'],
        });

        expect(await finishEditWithoutRebuild(context, addMesh, progress, confirm)).toBe(false);
    });

    it('hands back to the rebuild when the wizard could not say what changed', async () => {
        const { context, progress, confirm } = setup();

        const handled = await finishEditWithoutRebuild(
            context,
            { ...ADD_ERP, editChanges: undefined },
            progress,
            confirm,
        );

        expect(handled).toBe(false);
    });
});

describe('finishEditWithoutRebuild — an integration added', () => {
    it('deploys only the new one, with its API picks and settings recorded first', async () => {
        const { context, stateManager, progress, confirm, project } = setup();

        expect(await finishEditWithoutRebuild(context, ADD_ERP, progress, confirm)).toBe(true);

        expect(runGuards).toHaveBeenCalledWith(context, project);
        const handed = expect.objectContaining({ selectedAppBuilderComponents: ['erp-integration'] });
        expect(ensureWorkspaceRuntimeReady).toHaveBeenCalledWith(context, handed);
        expect(executeAppBuilderIntegrationsPhase).toHaveBeenCalledWith(context, project, handed, progress);
        expect(project.componentApiPicks).toEqual({ 'erp-integration': ['AdobeIOManagementAPISDK'] });
        expect(project.componentConfigs?.['erp-integration']).toEqual({ ERP_NAME: 'Northwind ERP' });
        expect(confirm).not.toHaveBeenCalled();
        expect(removeWithCleanup).not.toHaveBeenCalled();
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(progress).toHaveBeenLastCalledWith('Project Created', 100, expect.any(String));
    });

    it('fails the Finish when the add fails, and does not report success', async () => {
        const { context, progress, confirm } = setup();
        (executeAppBuilderIntegrationsPhase as jest.Mock).mockRejectedValueOnce(new Error('deploy failed'));

        await expect(finishEditWithoutRebuild(context, ADD_ERP, progress, confirm)).rejects.toThrow(
            'deploy failed',
        );

        expect(progress).not.toHaveBeenCalledWith('Project Created', 100, expect.any(String));
    });
});

describe('finishEditWithoutRebuild — an integration removed', () => {
    it('asks first, by name, then removes it the way the Integrations screen does', async () => {
        const { context, progress, confirm, project } = setup();

        expect(await finishEditWithoutRebuild(context, REMOVE_KIT, progress, confirm)).toBe(true);

        expect(confirm).toHaveBeenCalledWith(['Starter Kit']);
        expect(removeWithCleanup).toHaveBeenCalledWith(context, project, 'starter-kit', expect.any(Function));
        expect(executeAppBuilderIntegrationsPhase).not.toHaveBeenCalled();
    });

    it('changes nothing when the SC declines, and reads as cancelled', async () => {
        const { context, stateManager, progress, confirm } = setup();
        confirm.mockResolvedValue(false);

        await expect(finishEditWithoutRebuild(context, REMOVE_KIT, progress, confirm)).rejects.toThrow(
            'cancelled by user',
        );

        expect(runGuards).not.toHaveBeenCalled();
        expect(removeWithCleanup).not.toHaveBeenCalled();
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('stops at a removal that fails, before adding anything', async () => {
        const { context, progress, confirm } = setup();
        (removeWithCleanup as jest.Mock).mockResolvedValueOnce({ success: false, error: 'Removal stopped' });
        const swap = config({
            selectedAppBuilderComponents: ['erp-integration'],
            editChanges: ['selectedAppBuilderComponents'],
        });

        await expect(finishEditWithoutRebuild(context, swap, progress, confirm)).rejects.toThrow(
            'Removal stopped',
        );

        expect(executeAppBuilderIntegrationsPhase).not.toHaveBeenCalled();
    });

    it('tells the SC what the removal could not clean up', async () => {
        const { context, progress, confirm } = setup();
        (removeWithCleanup as jest.Mock).mockResolvedValueOnce({
            success: true,
            warnings: ['Starter Kit was removed, but its Runtime cleanup did not finish.'],
        });

        await finishEditWithoutRebuild(context, REMOVE_KIT, progress, confirm);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Starter Kit was removed, but its Runtime cleanup did not finish.',
        );
    });
});

describe('finishEditWithoutRebuild — the guards', () => {
    it('removes and adds nothing when a guard refuses', async () => {
        const { context, progress, confirm } = setup();
        (runGuards as jest.Mock).mockResolvedValueOnce({ error: 'Adobe sign-in required.' });

        await expect(finishEditWithoutRebuild(context, REMOVE_KIT, progress, confirm)).rejects.toThrow(
            'Adobe sign-in required.',
        );

        expect(removeWithCleanup).not.toHaveBeenCalled();
    });
});
