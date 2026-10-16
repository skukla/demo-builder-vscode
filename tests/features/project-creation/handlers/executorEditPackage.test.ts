/**
 * An Edit that changes the package on an Edge Delivery storefront (PL-75): the
 * package's choices recorded, its settings through Configure's own staging, the
 * settings files written, then the dashboard's own Reset onto it, asked about
 * before anything ran. The rebuild reinstalled every component instead.
 */

jest.mock('@/features/dashboard/services/projectSettingsChange', () => ({
    stageSettingsChange: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/features/eds/services/reset/edsResetUI', () => ({
    resetEdsProjectWithUI: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/features/project-creation/helpers/envFileRegeneration', () => ({
    regenerateProjectEnvFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/project-creation/services/aiBundle/aiBundleService', () => ({
    generateAIContextFiles: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/components/services/componentRegistryAccess', () => ({
    componentRegistryFrom: jest.fn(() => ({ loadRegistry: jest.fn().mockResolvedValue({ envVars: {} }) })),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn(), getCommandExecutor: jest.fn() },
}));

import { stageSettingsChange } from '@/features/dashboard/services/projectSettingsChange';
import { resetEdsProjectWithUI } from '@/features/eds/services/reset/edsResetUI';
import {
    applyPackageChange,
    planPackageChange,
} from '@/features/project-creation/handlers/executorEditPackage';
import { regenerateProjectEnvFiles } from '@/features/project-creation/helpers/envFileRegeneration';
import { generateAIContextFiles } from '@/features/project-creation/services/aiBundle/aiBundleService';
import type { ReportStage } from '@/core/vscode/withOperationProgress';
import type { Project } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { makeAddedDemo } from '../../../helpers/demoPackageFixtures';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

function setup(overrides: Partial<Project> = {}) {
    const project = createMockProject({
        selectedStack: 'eds-accs',
        selectedPackage: 'citisignal',
        demo: makeAddedDemo(),
        componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'default', OLD_DEFAULT: 'x' } },
        ...overrides,
    });
    const stateManager = createMockStateManager({
        saveProject: jest.fn().mockResolvedValue(undefined),
        saveProjectConfigOnly: jest.fn().mockResolvedValue(undefined),
    });
    return { project, stateManager, context: createMockHandlerContext({ stateManager }), progress: jest.fn() };
}

const toBodea: ProjectCreationConfig = {
    projectName: 'justrite',
    selectedStack: 'eds-accs',
    selectedPackage: 'bodea',
    selectedAddons: ['live-search'],
    selectedBlockLibraries: ['bodea-blocks'],
    customBlockLibraries: [],
    componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_VIEW_CODE: 'default' } },
};

beforeEach(() => jest.clearAllMocks());

describe('planPackageChange — asked before anything runs', () => {
    it('asks nothing when the package did not change', async () => {
        const ask = jest.fn();

        expect(await planPackageChange(setup().project, ['datapack'], ask)).toStrictEqual({ resets: false });
        expect(ask).not.toHaveBeenCalled();
    });

    it('asks about the reset, and reads a no as cancelled', async () => {
        const { project } = setup();

        expect(await planPackageChange(project, ['selectedPackage'], jest.fn().mockResolvedValue(true))).toStrictEqual(
            { resets: true },
        );
        await expect(
            planPackageChange(project, ['demo'], jest.fn().mockResolvedValue(false)),
        ).rejects.toThrow('cancelled by user');
    });
});

describe('applyPackageChange', () => {
    it('records the choices, stages only the settings that changed, writes the files, then resets', async () => {
        const { project, context, progress, stateManager } = setup();
        const order: string[] = [];
        (regenerateProjectEnvFiles as jest.Mock).mockImplementationOnce(async () => order.push('env'));
        (resetEdsProjectWithUI as jest.Mock).mockImplementationOnce(async () => (order.push('reset'), { success: true }));

        await applyPackageChange(context, project, toBodea, { resets: true }, progress);

        expect(project.selectedPackage).toBe('bodea');
        // The added demo would win over the package: a shipped package clears it.
        expect(project.demo).toBeUndefined();
        expect(project.selectedAddons).toStrictEqual(['live-search']);
        expect(project.selectedBlockLibraries).toStrictEqual(['bodea-blocks']);
        // Only what differs: the old package's default goes, the kept value is not re-sent.
        expect(stageSettingsChange).toHaveBeenCalledWith(
            project,
            { 'adobe-commerce-accs': { OLD_DEFAULT: '' } },
            expect.objectContaining({ secrets: context.context.secrets }),
        );
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(resetEdsProjectWithUI).toHaveBeenCalledWith(
            expect.objectContaining({
                project,
                includeBlockLibrary: true,
                verifyCdn: true,
                withinEdit: { report: expect.any(Function) },
            }),
        );
        expect(order).toStrictEqual(['env', 'reset']);
        expect(generateAIContextFiles).toHaveBeenCalledWith(project.path, project, context.context.extensionPath);
    });

    // Reset's own steps, counted Reset's way, on the creation screen (PL-75): the
    // count used to be dropped on the way through.
    it("passes each of Reset's steps on with its position and the line under it", async () => {
        const { project, context, progress } = setup();
        (resetEdsProjectWithUI as jest.Mock).mockImplementationOnce(
            async (options: { withinEdit: { report: ReportStage } }) => {
                options.withinEdit.report('Copying the content', '40 of 103 files', { index: 4, total: 11 });
                options.withinEdit.report('Checking requirements');
                return { success: true };
            },
        );

        await applyPackageChange(context, project, toBodea, { resets: true }, progress);

        expect(progress).toHaveBeenCalledWith('Copying the content', 80, '40 of 103 files', { index: 4, total: 11 });
        expect(progress).toHaveBeenCalledWith('Checking requirements', 80, undefined, undefined);
    });

    it('says the package is saved and how to finish when the reset fails', async () => {
        const { project, context, progress } = setup();
        (resetEdsProjectWithUI as jest.Mock).mockResolvedValueOnce({ success: false, error: 'GitHub App missing' });

        await expect(applyPackageChange(context, project, toBodea, { resets: true }, progress)).rejects.toThrow(
            'The storefront reset failed: GitHub App missing. The new package is saved; use Reset to try again.',
        );
    });

    it('reads a reset the SC cancelled as cancelled, not failed', async () => {
        const { project, context, progress } = setup();
        (resetEdsProjectWithUI as jest.Mock).mockResolvedValueOnce({ success: false, cancelled: true });

        await expect(applyPackageChange(context, project, toBodea, { resets: true }, progress)).rejects.toThrow(
            'cancelled by user',
        );
    });

    it('does nothing without a package change', async () => {
        const { project, context, progress } = setup();

        await applyPackageChange(context, project, toBodea, { resets: false }, progress);

        expect(project.selectedPackage).toBe('citisignal');
        expect(resetEdsProjectWithUI).not.toHaveBeenCalled();
    });
});
