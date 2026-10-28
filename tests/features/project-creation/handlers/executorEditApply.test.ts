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
jest.mock('@/features/project-creation/handlers/executorEditDestination', () => ({
    planDestinationChange: jest.fn().mockResolvedValue({ moves: false }),
    applyDestinationChange: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/project-creation/handlers/executorEditPackage', () => ({
    planPackageChange: jest.fn().mockResolvedValue({ resets: false }),
    applyPackageChange: jest.fn().mockResolvedValue(undefined),
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
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { addWithSteps, refuseAdd } from '@/features/dashboard/handlers/appBuilderComponentAdd';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentGuards';
import { removeWithCleanup } from '@/features/dashboard/handlers/appBuilderComponentRemove';
import {
    applyDatapackChange,
    planDatapackChange,
} from '@/features/project-creation/handlers/executorEditDatapack';
import {
    applyDestinationChange,
    planDestinationChange,
} from '@/features/project-creation/handlers/executorEditDestination';
import { finishEditWithoutRebuild } from '@/features/project-creation/handlers/executorEditApply';
import {
    applyPackageChange,
    planPackageChange,
} from '@/features/project-creation/handlers/executorEditPackage';
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
    const leaveAdobeProject = jest.fn().mockResolvedValue(true);
    const resetStorefront = jest.fn().mockResolvedValue(true);
    const ask = { removeIntegrations: confirm, leaveAdobeProject, removeOldDatapack, resetStorefront };
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

        expect(planDatapackChange).toHaveBeenCalledWith(project, ['datapack'], ask.removeOldDatapack);
        expect(applyDatapackChange).toHaveBeenCalledWith(context, project, NEW_PACK, plan, progress, false);
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

describe('finishEditWithoutRebuild — the project moved', () => {
    it('removes first, then moves, then adds, so what arrives deploys to the new destination', async () => {
        const { context, progress, ask, project } = setup();
        const order: string[] = [];
        const plan = { moves: true, project: { id: 'proj-2' }, workspace: { id: 'ws-2' }, target: 'P2' };
        (planDestinationChange as jest.Mock).mockResolvedValueOnce(plan);
        (removeWithCleanup as jest.Mock).mockImplementationOnce(async () => (order.push('remove'), { success: true }));
        (applyDestinationChange as jest.Mock).mockImplementationOnce(async () => order.push('move'));
        (addWithSteps as jest.Mock).mockImplementationOnce(async () => (order.push('add'), { success: true }));
        const swapAndMove = config({
            selectedAppBuilderComponents: ['erp-integration'],
            editChanges: ['adobeProject', 'adobeWorkspace', 'selectedAppBuilderComponents'],
        });

        expect(await finishEditWithoutRebuild(context, swapAndMove, progress, ask)).toBe(true);

        expect(planDestinationChange).toHaveBeenCalledWith(
            project,
            swapAndMove,
            swapAndMove.editChanges,
            ['starter-kit'],
            ask.leaveAdobeProject,
        );
        expect(applyDestinationChange).toHaveBeenCalledWith(context, project, plan, progress);
        expect(order).toStrictEqual(['remove', 'move', 'add']);
    });

    it('checks sign-in for a move alone, with nothing added or removed', async () => {
        const { context, progress, ask, project } = setup();
        (planDestinationChange as jest.Mock).mockResolvedValueOnce({
            moves: true,
            project: { id: 'proj-2' },
            workspace: { id: 'ws-2' },
            target: 'P2',
        });

        await finishEditWithoutRebuild(context, config({ editChanges: ['adobeWorkspace'] }), progress, ask);

        expect(runGuards).toHaveBeenCalledWith(context, project);
    });
});

describe('finishEditWithoutRebuild — the package changed on Edge Delivery', () => {
    const NEW_PACKAGE = config({
        selectedStack: 'eds-accs',
        selectedPackage: 'bodea',
        datapack: { name: 'bodea', version: '1.0.0' },
        editChanges: ['datapack', 'selectedPackage'],
    });

    it('asks first, then resets last, and tells the datapack step the reset writes the pages', async () => {
        const { context, progress, ask, project } = setup();
        const order: string[] = [];
        (planDatapackChange as jest.Mock).mockResolvedValueOnce({ changes: true, removeOld: false });
        (planPackageChange as jest.Mock).mockResolvedValueOnce({ resets: true });
        (applyDatapackChange as jest.Mock).mockImplementationOnce(async () => order.push('datapack'));
        (applyPackageChange as jest.Mock).mockImplementationOnce(async () => order.push('reset'));

        expect(await finishEditWithoutRebuild(context, NEW_PACKAGE, progress, ask)).toBe(true);

        expect(planPackageChange).toHaveBeenCalledWith(project, NEW_PACKAGE.editChanges, ask.resetStorefront);
        expect(applyDatapackChange).toHaveBeenCalledWith(
            context,
            project,
            NEW_PACKAGE,
            { changes: true, removeOld: false },
            progress,
            true,
        );
        expect(applyPackageChange).toHaveBeenCalledWith(context, project, NEW_PACKAGE, { resets: true }, progress);
        expect(order).toStrictEqual(['datapack', 'reset']);
    });

    it('rebuilds instead for a package change on a headless stack', async () => {
        const { context, progress, ask } = setup();

        const handled = await finishEditWithoutRebuild(
            context,
            { ...NEW_PACKAGE, selectedStack: 'headless-paas' },
            progress,
            ask,
        );

        expect(handled).toBe(false);
        expect(planPackageChange).not.toHaveBeenCalled();
    });
});

// One step on line 1 while integrations go and come, each one's own step on line 2
// under its name, as creation folds them (owner, 2026-10-16: "Fold").
describe('finishEditWithoutRebuild — what the progress screen shows', () => {
    type Report = (stage: string, step?: string) => void;

    it('shows an add under the one deploying step, with its own step under its name', async () => {
        const { context, progress, ask } = setup();
        (addWithSteps as jest.Mock).mockImplementationOnce(async (_c, _p, _e, report: Report) => {
            report(OPERATION_STAGES.deployingApp.label);
            return { success: true };
        });

        await finishEditWithoutRebuild(context, ADD_ERP, progress, ask);

        const entry = (addWithSteps as jest.Mock).mock.calls[0][2] as { name: string };
        expect(progress).toHaveBeenCalledWith(
            OPERATION_STAGES.deployingIntegrations.label,
            expect.any(Number),
            `${entry.name}: ${OPERATION_STAGES.deployingApp.label}`,
        );
    });

    it('shows a removal under the one removing step, with its own step under its name', async () => {
        const { context, progress, ask } = setup();
        (removeWithCleanup as jest.Mock).mockImplementationOnce(async (_c, _p, _id, report: Report) => {
            report(OPERATION_STAGES.removing.label);
            return { success: true };
        });

        await finishEditWithoutRebuild(context, REMOVE_KIT, progress, ask);

        expect(progress).toHaveBeenCalledWith(
            OPERATION_STAGES.removingIntegrations.label,
            expect.any(Number),
            `Starter Kit: ${OPERATION_STAGES.removing.label}`,
        );
        expect(progress).not.toHaveBeenCalledWith(OPERATION_STAGES.removing.label, expect.anything(), expect.anything());
    });
});
