/**
 * An Edit that changes the datapack (PL-75): Reset's question about the old pack's
 * data first, then the old data removed when asked, the new choice recorded, and
 * creation's own steps after it. The rebuild re-imported on top of the old pack
 * and could never clear one.
 */

jest.mock('@/features/eds/services/reset/edsResetSampleData', () => ({
    beginSampleDataRemovalCheck: jest.fn().mockReturnValue(Promise.resolve(true)),
    removeProjectSampleData: jest.fn().mockResolvedValue(undefined),
    // The Save As question a removal asks when the demo's pack is not the SC's: never shown here.
    askSaveAsNameWith: jest.fn(() => jest.fn()),
}));
jest.mock('@/features/project-creation/handlers/executorSampleDataPhase', () => ({
    executeSampleDataPhase: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/project-creation/services/catalogPrewarmPhase', () => ({
    executeCatalogPrewarmPhase: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/project-creation/services/catalogMenuPhase', () => ({
    executeCatalogMenuPhase: jest.fn().mockResolvedValue(undefined),
    rewriteCatalogMenuPhase: jest.fn().mockResolvedValue(undefined),
}));

import {
    beginSampleDataRemovalCheck,
    removeProjectSampleData,
} from '@/features/eds/services/reset/edsResetSampleData';
import {
    applyDatapackChange,
    planDatapackChange,
} from '@/features/project-creation/handlers/executorEditDatapack';
import { executeSampleDataPhase } from '@/features/project-creation/handlers/executorSampleDataPhase';
import {
    executeCatalogMenuPhase,
    rewriteCatalogMenuPhase,
} from '@/features/project-creation/services/catalogMenuPhase';
import { executeCatalogPrewarmPhase } from '@/features/project-creation/services/catalogPrewarmPhase';
import type { Project } from '@/types/base';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const OLD = { name: 'citisignal', version: '1.0.0' };
const NEW = { name: 'bodea', version: '2.0.0' };

function setup(overrides: Partial<Project> = {}) {
    const project = createMockProject({ datapack: OLD, selectedStack: 'eds-paas', ...overrides });
    const stateManager = createMockStateManager({ saveProject: jest.fn().mockResolvedValue(undefined) });
    const context = createMockHandlerContext({ stateManager });
    return { project, stateManager, context, progress: jest.fn() };
}

const toNew: ProjectCreationConfig = { projectName: 'justrite', datapack: NEW };

beforeEach(() => jest.clearAllMocks());

describe('planDatapackChange — asked before anything runs', () => {
    it('asks nothing when the datapack did not change', async () => {
        const { project } = setup();
        const ask = jest.fn();

        expect(await planDatapackChange(project, ['selectedAppBuilderComponents'], ask)).toStrictEqual({
            changes: false,
            removeOld: false,
        });
        expect(ask).not.toHaveBeenCalled();
    });

    it('asks nothing when the project had no pack: there is no data to remove', async () => {
        const { project } = setup({ datapack: undefined });
        const ask = jest.fn();

        expect(await planDatapackChange(project, ['datapack'], ask)).toStrictEqual({
            changes: true,
            removeOld: false,
        });
        expect(ask).not.toHaveBeenCalled();
    });

    it("asks Reset's question about the old pack, with the removal check already started", async () => {
        const { project } = setup();
        const ask = jest.fn().mockResolvedValue(true);

        const plan = await planDatapackChange(project, ['datapack'], ask);

        expect(beginSampleDataRemovalCheck).toHaveBeenCalledWith(project);
        expect(ask).toHaveBeenCalledWith(project, expect.any(Promise));
        expect(plan).toStrictEqual({ changes: true, removeOld: true });
    });
});

describe('applyDatapackChange', () => {
    it('does nothing when the datapack did not change', async () => {
        const { context, project, progress, stateManager } = setup();

        await applyDatapackChange(context, project, toNew, { changes: false, removeOld: false }, progress);

        expect(stateManager.saveProject).not.toHaveBeenCalled();
        expect(executeSampleDataPhase).not.toHaveBeenCalled();
    });

    it('removes the OLD pack, then records and imports the new one, rewriting the pages', async () => {
        const { context, project, progress, stateManager } = setup();
        // The removal reads the pack off the project: it must still be the old one.
        let removed: unknown;
        (removeProjectSampleData as jest.Mock).mockImplementationOnce(async (p: Project) => {
            removed = p.datapack;
        });

        await applyDatapackChange(context, project, toNew, { changes: true, removeOld: true }, progress);

        expect(removed).toStrictEqual(OLD);
        expect(project.datapack).toStrictEqual(NEW);
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(executeSampleDataPhase).toHaveBeenCalledWith(context, project, progress);
        expect(executeCatalogPrewarmPhase).toHaveBeenCalledWith(context, project, progress);
        // The old categories are gone: their pages come out before the new ones go in.
        expect(rewriteCatalogMenuPhase).toHaveBeenCalledWith(context, project, progress);
        expect(executeCatalogMenuPhase).not.toHaveBeenCalled();
    });

    // Step-05 R1: a removal that took everything clears the old pack on the project and saves it.
    // The new pack is recorded after it, so the Edit's own save is the one that names it.
    it('still records the new pack when the removal cleared the old one', async () => {
        const { context, project, progress, stateManager } = setup();
        (removeProjectSampleData as jest.Mock).mockImplementationOnce(async (p: Project, c: typeof context) => {
            p.datapack = undefined;
            await c.stateManager.saveProject(p);
        });
        const named: Array<Project['datapack']> = [];
        stateManager.saveProject.mockImplementation(async (p: Project) => {
            named.push(p.datapack);
        });

        await applyDatapackChange(context, project, toNew, { changes: true, removeOld: true }, progress);

        expect(named).toStrictEqual([undefined, NEW]);
        expect(project.datapack).toStrictEqual(NEW);
        expect(executeSampleDataPhase).toHaveBeenCalledWith(context, project, progress);
    });

    // Step-04 S7: an Edit to no datapack saves the project without the old one's failed install.
    it('saves the project without a failed install of the pack it no longer names', async () => {
        const failure = { ...OLD, reason: 'Products refused.', at: '2026-11-12T10:00:00.000Z', retries: 0 };
        const { context, project, progress, stateManager } = setup({ datapackInstallFailure: failure });
        let saved: Project['datapackInstallFailure'] | 'not saved' = 'not saved';
        stateManager.saveProject.mockImplementationOnce(async (p: Project) => {
            saved = p.datapackInstallFailure;
        });

        await applyDatapackChange(context, project, { projectName: 'justrite' }, { changes: true, removeOld: false }, progress);

        expect(saved).toBeUndefined();
    });

    it('keeps the old data when the SC chose Keep Data', async () => {
        const { context, project, progress } = setup();

        await applyDatapackChange(context, project, toNew, { changes: true, removeOld: false }, progress);

        expect(removeProjectSampleData).not.toHaveBeenCalled();
        expect(executeSampleDataPhase).toHaveBeenCalled();
        // The old categories still stand, so their pages do too: the write only adds.
        expect(executeCatalogMenuPhase).toHaveBeenCalledWith(context, project, progress);
        expect(rewriteCatalogMenuPhase).not.toHaveBeenCalled();
    });

    it('writes no category pages on a headless storefront', async () => {
        const { context, project, progress } = setup({ selectedStack: 'headless-paas' });

        await applyDatapackChange(context, project, toNew, { changes: true, removeOld: false }, progress);

        expect(executeCatalogMenuPhase).not.toHaveBeenCalled();
        expect(rewriteCatalogMenuPhase).not.toHaveBeenCalled();
    });

    it('leaves pre-warming and the pages to a storefront reset that follows', async () => {
        const { context, project, progress } = setup();

        await applyDatapackChange(context, project, toNew, { changes: true, removeOld: true }, progress, true);

        expect(executeSampleDataPhase).toHaveBeenCalled();
        expect(executeCatalogPrewarmPhase).not.toHaveBeenCalled();
        expect(rewriteCatalogMenuPhase).not.toHaveBeenCalled();
        expect(executeCatalogMenuPhase).not.toHaveBeenCalled();
    });

    it('records "no datapack" and imports nothing when the SC cleared it', async () => {
        const { context, project, progress, stateManager } = setup();

        await applyDatapackChange(
            context,
            project,
            { projectName: 'justrite' },
            { changes: true, removeOld: true },
            progress,
        );

        expect(project.datapack).toBeUndefined();
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(executeSampleDataPhase).not.toHaveBeenCalled();
    });
});
