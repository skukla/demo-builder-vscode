/**
 * An Edit that changes the datapack (PL-75): Reset's question about the old pack's
 * data first, then the old data removed when asked, the new choice recorded, and
 * creation's own steps after it. The rebuild re-imported on top of the old pack
 * and could never clear one.
 */

jest.mock('@/features/eds/services/reset/edsResetDatapack', () => ({
    beginSampleDataRemovalCheck: jest.fn().mockReturnValue(Promise.resolve(true)),
    removeProjectSampleDataOutcome: jest.fn().mockResolvedValue({}),
    // The Save As question a removal asks when the demo's pack is not the SC's: never shown here.
    askSaveAsNameWith: jest.fn(() => jest.fn()),
}));
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    installedByDemoBuilder: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/features/project-creation/handlers/executorDatapackPhase', () => ({
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
    removeProjectSampleDataOutcome,
} from '@/features/eds/services/reset/edsResetDatapack';
import type { NameMemory } from '@/features/data-installer/services/packNames';
import type { DatapackRemoval } from '@/features/eds/services/reset/resetDatapackStep';
import * as vscode from 'vscode';
import {
    applyDatapackChange,
    askSwitchInDialog,
    planDatapackChange,
} from '@/features/project-creation/handlers/executorEditDatapack';
import { executeSampleDataPhase } from '@/features/project-creation/handlers/executorDatapackPhase';
import {
    executeCatalogMenuPhase,
    rewriteCatalogMenuPhase,
} from '@/features/project-creation/services/catalogMenuPhase';
import { executeCatalogPrewarmPhase } from '@/features/project-creation/services/catalogPrewarmPhase';
import { PACK_NAMES_KEY } from '@/features/data-installer/services/packNames';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { ProjectCreationConfig } from '@/types/webviewRequests';
import { REMOVAL_NO_TARGET } from '../../../helpers/datapackRemovalFixtures';
import { LEFT_NOTE, REMOVAL_LEFT_IN_STORE } from '../../../helpers/datapackRemovalFixtures';
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
/** The library's pack names as remembered in global state (`packNames.ts`). */
function remembering(context: ReturnType<typeof setup>['context'], names: Record<string, string>): void {
    (context.context.globalState.get as jest.Mock).mockImplementation((key: string) => (key === PACK_NAMES_KEY ? names : undefined));
}
const mockedRemove = removeProjectSampleDataOutcome as jest.MockedFunction<typeof removeProjectSampleDataOutcome>;

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

    // One datapack per project in beta.153 (decisions J8-1): another pack is a Switch, and Cancel
    // changes nothing. "Keep Datapack adds the new pack alongside" left the old pack's data in
    // Commerce with the project naming only the new one (live run 8, owner 2026-11-16).
    it('asks to switch to the new pack, naming it, once the old one can be uninstalled', async () => {
        const { project } = setup();
        const ask = jest.fn().mockResolvedValue(true);

        const plan = await planDatapackChange(project, ['datapack'], ask, 'bodea');

        expect(beginSampleDataRemovalCheck).toHaveBeenCalledWith(project);
        expect(ask).toHaveBeenCalledWith(project, 'bodea');
        expect(plan).toStrictEqual({ changes: true, removeOld: true });
    });

    it('stops the Edit, changing nothing, when the SC cancels the switch', async () => {
        const { project } = setup();
        const ask = jest.fn().mockResolvedValue(false);

        await expect(planDatapackChange(project, ['datapack'], ask, 'bodea')).rejects.toThrow('Nothing was changed.');
    });

    it('asks nothing when the old pack has nothing to uninstall', async () => {
        const { project } = setup();
        (beginSampleDataRemovalCheck as jest.Mock).mockReturnValueOnce(Promise.resolve(false));
        const ask = jest.fn();

        expect(await planDatapackChange(project, ['datapack'], ask, 'bodea')).toStrictEqual({ changes: true, removeOld: false });
        expect(ask).not.toHaveBeenCalled();
    });
});

describe('askSwitchInDialog — the Switch question, as the Datapacks screen asks it', () => {
    const warning = vscode.window.showWarningMessage as unknown as jest.Mock;

    it('asks "Switch to <new>?" with Switch, naming both packs as the SC knows them', async () => {
        const { project } = setup();
        warning.mockResolvedValueOnce({ title: 'Switch' });
        const remembered = { citisignal: 'CitiSignal', bodea: 'Bodea' };
        const memory: NameMemory = { get: <T>() => remembered as T, update: async () => undefined };

        expect(await askSwitchInDialog(project, 'bodea', memory)).toBe(true);
        expect(warning).toHaveBeenCalledWith(
            'Switch to Bodea?',
            { modal: true, detail: 'Uninstalls CitiSignal first, then installs Bodea. Your changes are saved first. Can take several minutes.' },
            { title: 'Switch' },
        );
    });

    it('asks "Uninstall <old>?" when the Edit chose no datapack, and Cancel answers no', async () => {
        const { project } = setup();
        warning.mockResolvedValueOnce(undefined);

        expect(await askSwitchInDialog(project, undefined)).toBe(false);
        expect(warning).toHaveBeenCalledWith(
            'Uninstall citisignal?',
            { modal: true, detail: 'Deletes what it installed in Commerce. Your changes are saved first. Can take several minutes.' },
            { title: 'Uninstall' },
        );
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
        mockedRemove.mockImplementationOnce(async (p: Project) => {
            removed = p.datapack;
            return {};
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
        mockedRemove.mockImplementationOnce(async (p: Project, c: HandlerContext) => {
            p.datapack = undefined;
            await c.stateManager.saveProject(p);
            return {};
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

        expect(mockedRemove).not.toHaveBeenCalled();
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

    // step-07 D2 (R1-b), owner Q1: the old pack's data did not all come out, so the datapack part
    // stops; the rest of the Edit stands and the line goes into its warnings.
    // Owner 2026-11-14: short, cause first, naming the datapack as the SC knows it.
    it.each<[string, DatapackRemoval, string]>([
        ['failed', { kept: 'Commerce refused 2 products.' }, "CitiSignal couldn't be uninstalled, so the datapack is still CitiSignal: Commerce refused 2 products."],
        ['stopped partway', { kept: 'Categories could not be removed.', partly: true }, 'Part of CitiSignal was uninstalled, so the datapack is still CitiSignal: Categories could not be removed.'],
        ['went unanswered', { kept: 'You changed 2 things since it was installed. They were not answered.', unanswered: true }, "CitiSignal couldn't be uninstalled, so the datapack is still CitiSignal: You changed 2 things since it was installed. They were not answered."],
        ['left part in Commerce', REMOVAL_LEFT_IN_STORE, `Part of CitiSignal was left in Commerce, so the datapack is still CitiSignal: ${LEFT_NOTE}`],
        ['left part in Commerce with no note', { leftInStore: true }, 'Part of CitiSignal was left in Commerce, so the datapack is still CitiSignal.'],
    ])('keeps the old pack recorded and installs nothing when the removal %s', async (_case, removal, line) => {
        const { context, project, progress, stateManager } = setup();
        remembering(context, { citisignal: 'CitiSignal' });
        mockedRemove.mockResolvedValueOnce(removal);

        const warning = await applyDatapackChange(context, project, toNew, { changes: true, removeOld: true }, progress);

        expect(warning).toBe(line);
        expect(project.datapack).toStrictEqual(OLD);
        expect(stateManager.saveProject).not.toHaveBeenCalled();
        expect(executeSampleDataPhase).not.toHaveBeenCalled();
        expect(executeCatalogPrewarmPhase).not.toHaveBeenCalled();
        expect(rewriteCatalogMenuPhase).not.toHaveBeenCalled();
        expect(executeCatalogMenuPhase).not.toHaveBeenCalled();
    });

    it("names the old pack by its id when its name was never read", async () => {
        const { context, project, progress } = setup();
        mockedRemove.mockResolvedValueOnce({ kept: 'Commerce refused 2 products.' });

        const warning = await applyDatapackChange(context, project, toNew, { changes: true, removeOld: true }, progress);

        expect(warning).toBe("citisignal couldn't be uninstalled, so the datapack is still citisignal: Commerce refused 2 products.");
    });

    // Owner 2026-11-14 (item 6): no website and store view was ever recorded, so nothing was
    // installed: nothing to remove, and the Edit switches the datapack with no line.
    it('switches the datapack with no line when the old one was never installed (no install target)', async () => {
        const { context, project, progress } = setup();
        mockedRemove.mockResolvedValueOnce(REMOVAL_NO_TARGET);

        const warning = await applyDatapackChange(context, project, toNew, { changes: true, removeOld: true }, progress);

        expect(warning).toBeUndefined();
        expect(project.datapack).toStrictEqual(NEW);
        expect(executeSampleDataPhase).toHaveBeenCalledWith(context, project, progress);
    });

    it('CONTROL: says nothing when the old data all came out', async () => {
        const { context, project, progress } = setup();

        await expect(applyDatapackChange(context, project, toNew, { changes: true, removeOld: true }, progress)).resolves.toBeUndefined();
    });
});
