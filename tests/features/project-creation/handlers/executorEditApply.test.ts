/**
 * finishEditWithoutRebuild — an Edit that only adds or removes integrations or the
 * mesh does just that (PL-75).
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
jest.mock('@/features/project-creation/handlers/executorEditDatapack', () => ({
    planDatapackChange: jest.fn().mockResolvedValue({ changes: false, removeOld: false }),
    applyDatapackChange: jest.fn().mockResolvedValue(undefined),
}));
// The Integrations screen's own Add: what Edit adds through, mesh and integration alike.
jest.mock('@/features/dashboard/handlers/appBuilderComponentAdd', () => ({
    addWithSteps: jest.fn().mockResolvedValue({ success: true }),
    refuseAdd: jest.fn().mockReturnValue(undefined),
}));

import * as vscode from 'vscode';
import { addWithSteps, refuseAdd } from '@/features/dashboard/handlers/appBuilderComponentAdd';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentGuards';
import { removeWithCleanup } from '@/features/dashboard/handlers/appBuilderComponentRemove';
import {
    applyDatapackChange,
    planDatapackChange,
} from '@/features/project-creation/handlers/executorEditDatapack';
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
    const removeOldDatapack = jest.fn().mockResolvedValue(false);
    const ask = { removeIntegrations: confirm, removeOldDatapack };
    return { context, stateManager, progress, confirm, ask, project };
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
        const { context, stateManager, progress, ask } = setup();

        expect(await finishEditWithoutRebuild(context, config(), progress, ask)).toBe(true);

        expect(stateManager.saveProject).toHaveBeenCalledTimes(1);
        expect(runGuards).not.toHaveBeenCalled();
        expect(addWithSteps).not.toHaveBeenCalled();
    });

    it('hands back to the rebuild when anything but integrations changed', async () => {
        const { context, progress, ask } = setup();
        const changed = { ...ADD_ERP, editChanges: [...ADD_ERP.editChanges!, 'selectedPackage'] };

        expect(await finishEditWithoutRebuild(context, changed, progress, ask)).toBe(false);

        expect(runGuards).not.toHaveBeenCalled();
        expect(addWithSteps).not.toHaveBeenCalled();
    });


    it('hands back to the rebuild when the wizard could not say what changed', async () => {
        const { context, progress, ask } = setup();

        const handled = await finishEditWithoutRebuild(
            context,
            { ...ADD_ERP, editChanges: undefined },
            progress,
            ask,
        );

        expect(handled).toBe(false);
    });
});

describe('finishEditWithoutRebuild — an integration added', () => {
    it("adds only the new one, through the Integrations screen's Add, with its picks and settings", async () => {
        const { context, stateManager, progress, confirm, ask, project } = setup();

        expect(await finishEditWithoutRebuild(context, ADD_ERP, progress, ask)).toBe(true);

        expect(runGuards).toHaveBeenCalledWith(context, project);
        const entry = expect.objectContaining({ id: 'erp-integration' });
        expect(refuseAdd).toHaveBeenCalledWith(project, entry);
        expect(addWithSteps).toHaveBeenCalledTimes(1);
        expect(addWithSteps).toHaveBeenCalledWith(context, project, entry, expect.any(Function), {
            apis: ['AdobeIOManagementAPISDK'],
        });
        expect(project.componentConfigs?.['erp-integration']).toEqual({ ERP_NAME: 'Northwind ERP' });
        expect(confirm).not.toHaveBeenCalled();
        expect(removeWithCleanup).not.toHaveBeenCalled();
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(progress).toHaveBeenLastCalledWith('Project Created', 100, expect.any(String));
    });

    it('fails the Finish when the add fails, and does not report success', async () => {
        const { context, progress, ask } = setup();
        (addWithSteps as jest.Mock).mockResolvedValueOnce({ success: false, error: 'deploy failed' });

        await expect(finishEditWithoutRebuild(context, ADD_ERP, progress, ask)).rejects.toThrow(
            'deploy failed',
        );

        expect(progress).not.toHaveBeenCalledWith('Project Created', 100, expect.any(String));
    });

    it("fails the Finish with the screen's own refusal, and adds nothing", async () => {
        const { context, progress, ask } = setup();
        (refuseAdd as jest.Mock).mockReturnValueOnce({ success: false, error: 'is already added' });

        await expect(finishEditWithoutRebuild(context, ADD_ERP, progress, ask)).rejects.toThrow(
            'is already added',
        );

        expect(addWithSteps).not.toHaveBeenCalled();
    });
});

describe('finishEditWithoutRebuild — the mesh added', () => {
    const ADD_MESH = config({
        selectedAppBuilderComponents: ['starter-kit', 'eds-commerce-mesh'],
        editChanges: ['selectedAppBuilderComponents'],
    });

    it('adds it through the same Add as an integration', async () => {
        const { context, progress, ask, project } = setup();

        expect(await finishEditWithoutRebuild(context, ADD_MESH, progress, ask)).toBe(true);

        expect(addWithSteps).toHaveBeenCalledWith(
            context,
            project,
            expect.objectContaining({ id: 'eds-commerce-mesh', kind: 'mesh' }),
            expect.any(Function),
            { apis: undefined },
        );
        expect(progress).toHaveBeenLastCalledWith('Project Created', 100, expect.any(String));
    });
});

describe('finishEditWithoutRebuild — an integration removed', () => {
    it('asks first, by name, then removes it the way the Integrations screen does', async () => {
        const { context, progress, confirm, ask, project } = setup();

        expect(await finishEditWithoutRebuild(context, REMOVE_KIT, progress, ask)).toBe(true);

        expect(confirm).toHaveBeenCalledWith(['Starter Kit']);
        expect(removeWithCleanup).toHaveBeenCalledWith(context, project, 'starter-kit', expect.any(Function));
        expect(addWithSteps).not.toHaveBeenCalled();
    });

    it('changes nothing when the SC declines, and reads as cancelled', async () => {
        const { context, stateManager, progress, confirm, ask } = setup();
        confirm.mockResolvedValue(false);

        await expect(finishEditWithoutRebuild(context, REMOVE_KIT, progress, ask)).rejects.toThrow(
            'cancelled by user',
        );

        expect(runGuards).not.toHaveBeenCalled();
        expect(removeWithCleanup).not.toHaveBeenCalled();
        expect(stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('stops at a removal that fails, before adding anything', async () => {
        const { context, progress, ask } = setup();
        (removeWithCleanup as jest.Mock).mockResolvedValueOnce({ success: false, error: 'Removal stopped' });
        const swap = config({
            selectedAppBuilderComponents: ['erp-integration'],
            editChanges: ['selectedAppBuilderComponents'],
        });

        await expect(finishEditWithoutRebuild(context, swap, progress, ask)).rejects.toThrow(
            'Removal stopped',
        );

        expect(addWithSteps).not.toHaveBeenCalled();
    });

    it('tells the SC what the removal could not clean up', async () => {
        const { context, progress, ask } = setup();
        (removeWithCleanup as jest.Mock).mockResolvedValueOnce({
            success: true,
            warnings: ['Starter Kit was removed, but its Runtime cleanup did not finish.'],
        });

        await finishEditWithoutRebuild(context, REMOVE_KIT, progress, ask);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'Starter Kit was removed, but its Runtime cleanup did not finish.',
        );
    });
});

describe('finishEditWithoutRebuild — the guards', () => {
    it('removes and adds nothing when a guard refuses', async () => {
        const { context, progress, ask } = setup();
        (runGuards as jest.Mock).mockResolvedValueOnce({ error: 'Adobe sign-in required.' });

        await expect(finishEditWithoutRebuild(context, REMOVE_KIT, progress, ask)).rejects.toThrow(
            'Adobe sign-in required.',
        );

        expect(removeWithCleanup).not.toHaveBeenCalled();
    });
});

describe('finishEditWithoutRebuild — the datapack changed', () => {
    const NEW_PACK = config({ datapack: { name: 'bodea', version: '1.0.0' }, editChanges: ['datapack'] });

    it('plans it before anything runs, then applies it after the integrations', async () => {
        const { context, progress, ask, project } = setup();
        const plan = { changes: true, removeOld: true };
        (planDatapackChange as jest.Mock).mockResolvedValueOnce(plan);

        expect(await finishEditWithoutRebuild(context, NEW_PACK, progress, ask)).toBe(true);

        expect(planDatapackChange).toHaveBeenCalledWith(context, project, ['datapack'], ask.removeOldDatapack);
        expect(applyDatapackChange).toHaveBeenCalledWith(context, project, NEW_PACK, plan, progress);
        // Nothing of Adobe's is touched for a datapack: no sign-in check, no add.
        expect(runGuards).not.toHaveBeenCalled();
        expect(addWithSteps).not.toHaveBeenCalled();
        expect(progress).toHaveBeenLastCalledWith('Project Created', 100, expect.any(String));
    });

    it('asks nothing about the datapack when the SC declines the integration removal', async () => {
        const { context, progress, confirm, ask } = setup();
        confirm.mockResolvedValue(false);
        const both = config({
            selectedAppBuilderComponents: [],
            datapack: { name: 'bodea', version: '1.0.0' },
            editChanges: ['datapack', 'selectedAppBuilderComponents'],
        });

        await expect(finishEditWithoutRebuild(context, both, progress, ask)).rejects.toThrow('cancelled by user');

        expect(planDatapackChange).not.toHaveBeenCalled();
        expect(applyDatapackChange).not.toHaveBeenCalled();
    });
});
