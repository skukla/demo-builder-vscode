/**
 * Uninstall Datapack (owner, 2026-11-09, walk F96): a project whose datapack Demo Builder
 * installed in a Commerce instance (`removableDataOf`) is asked, beside the GitHub repository and
 * DA.live site, whether that data comes out too. Unticked, and never answered by the
 * `cleanupBehavior` setting, because it writes to a store. A ticked box removes the data FIRST,
 * the SC's changes settled as a reset settles them; a removal that does not finish stops the
 * delete and keeps the project. The question's sentence says the data stays unless removed.
 *
 * The removal is mocked in the wall (`mockRemoveDataBeforeDelete`); its own suite is
 * `datapackDataRemoval.test.ts`. Every assertion here reads what it was handed.
 */

import {
    deleteProject,
    mockCreateQuickPick,
    mockDeleteRepository,
    mockGetConfiguration,
    mockGetToken,
    mockRemovableDataOf,
    mockRemoveDataBeforeDelete,
    mockRm,
    mockShowInformationMessage,
    mockShowWarningMessage,
    mockSleep,
} from './projectDeletionService.testUtils';
import { SERVICES, armQuickPick, context, edsProject, plainProject } from './projectDeletionService.fixtures';
import { heldProgress } from '@/core/vscode/operationProgress';
import { answerOperationPrompt, isAwaitingAnswer } from '@/core/vscode/operationPrompt';
import type { HandlerContext } from '@/types/handlers';

const DATA = { displayName: 'Acme Demo' };
const DESCRIPTION = "Acme Demo, from this demo's Commerce instance. Your changes are saved first.";
const WITH_DATA = "Project files are removed from this machine. Datapacks stay installed in Commerce unless you uninstall them.";
const FILES_ONLY = 'Project files are removed from this machine.';

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    mockSleep.mockResolvedValue(undefined);
    mockGetConfiguration.mockReturnValue({ get: () => 'ask' });
    mockShowInformationMessage.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue('gh-token');
    mockDeleteRepository.mockResolvedValue(undefined);
    mockRemovableDataOf.mockResolvedValue(DATA);
    mockRemoveDataBeforeDelete.mockResolvedValue(undefined);
});

describe('a project with datapack data is asked about it', () => {
    it('offers the data, unticked, naming the pack, even on a project with nothing online', async () => {
        const pick = armQuickPick('accept', []);

        await deleteProject(context(), plainProject(), SERVICES);

        expect(pick.items().map((item) => [item.id, item.description])).toEqual([['datapackData', DESCRIPTION]]);
        expect(pick.selectedAtShow()).toStrictEqual([]);
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('offers it after the repository and the site on an EDS project', async () => {
        const pick = armQuickPick('accept', []);

        await deleteProject(context(), edsProject(), SERVICES);

        expect(pick.items().map((item) => item.id)).toEqual(['github', 'daLive', 'datapackData']);
    });

    it('leaves the data when the box is left unticked', async () => {
        armQuickPick('accept', []);

        const result = await deleteProject(context(), plainProject(), SERVICES);

        expect(mockRm).toHaveBeenCalled();
        expect(mockRemoveDataBeforeDelete).not.toHaveBeenCalled();
        expect(result.data).toEqual({ success: true, projectName: 'demo-project', cleanupResults: [] });
    });

    it('removes the data before the repository and the files when ticked', async () => {
        armQuickPick('accept', ['github', 'datapackData']);
        const ctx: HandlerContext = context();
        const project = edsProject();
        const order: string[] = [];
        mockRemoveDataBeforeDelete.mockImplementation(async () => { order.push('data'); });
        mockDeleteRepository.mockImplementation(async () => { order.push('repository'); });
        mockRm.mockImplementation(async () => { order.push('files'); });

        const result = await deleteProject(ctx, project, SERVICES);

        expect(mockRemoveDataBeforeDelete).toHaveBeenCalledWith(ctx, project, expect.any(Function), expect.any(Function));
        expect(order).toEqual(['data', 'repository', 'files']);
        expect(result.data).toMatchObject({ success: true, projectName: 'demo-project' });
    });

    it('keeps the project, and everything online, when the data does not all come out', async () => {
        armQuickPick('accept', ['github', 'datapackData']);
        const why = "Its datapack's data was not removed, so the project was kept: Commerce refused 2 products.";
        mockRemoveDataBeforeDelete.mockResolvedValue(why);

        const result = await deleteProject(context(), edsProject(), SERVICES);

        expect(mockDeleteRepository).not.toHaveBeenCalled();
        expect(mockRm).not.toHaveBeenCalled();
        expect(result.data).toMatchObject({ success: false, projectName: 'demo-project', error: why });
    });

    it('cancels without removing anything when the question is dismissed', async () => {
        armQuickPick('escape', ['datapackData']);

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockRm).not.toHaveBeenCalled();
        expect(mockRemoveDataBeforeDelete).not.toHaveBeenCalled();
    });
});

describe('the cleanupBehavior setting never removes the data', () => {
    it('deleteAll ticks the online resources, never the data, and still asks', async () => {
        mockGetConfiguration.mockReturnValue({ get: () => 'deleteAll' });
        const pick = armQuickPick('accept');

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockCreateQuickPick).toHaveBeenCalled();
        expect(pick.selectedAtShow().map((item) => item.id)).toStrictEqual(['github', 'daLive']);
        expect(mockDeleteRepository).toHaveBeenCalled();
        expect(mockRemoveDataBeforeDelete).not.toHaveBeenCalled();
    });

    it('localOnly asks the plain question and leaves the data', async () => {
        mockGetConfiguration.mockReturnValue({ get: () => 'localOnly' });
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockShowWarningMessage).toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled();
        expect(mockRemoveDataBeforeDelete).not.toHaveBeenCalled();
    });
});

describe('the same question in the progress modal', () => {
    const ID = 'delete-demo-project';

    async function asked(project = plainProject(), values: Record<string, string> = {}, action: string | null = 'Delete') {
        const done = deleteProject(context(), project, SERVICES, { progress: 'modal', operationId: ID });
        for (let i = 0; i < 50 && !isAwaitingAnswer(ID); i++) await Promise.resolve();
        const prompt = heldProgress(ID)?.prompt;
        // null dismisses the question.
        answerOperationPrompt(ID, action ?? undefined, values);
        await done;
        return prompt;
    }

    it('asks with one unticked box naming the pack, says the data stays, and removes it when ticked', async () => {
        const prompt = await asked(plainProject(), { datapackData: 'true' });

        expect(prompt?.message).toBe(WITH_DATA);
        expect(prompt?.fields?.map(({ id, label, kind, value, description }) => ({ id, label, kind, value, description }))).toStrictEqual([
            { id: 'datapackData', label: 'Uninstall Datapack', kind: 'checkbox', value: '', description: DESCRIPTION },
        ]);
        expect(mockRemoveDataBeforeDelete).toHaveBeenCalled();
    });

    it('ticks the repository and the site under deleteAll, never the data, and leaving it removes nothing', async () => {
        mockGetConfiguration.mockReturnValue({ get: () => 'deleteAll' });

        const prompt = await asked(edsProject(), {}, null);

        expect(prompt?.fields?.map(({ id, value }) => ({ id, value }))).toStrictEqual([
            { id: 'github', value: 'true' },
            { id: 'daLive', value: 'true' },
            { id: 'datapackData', value: '' },
        ]);
        expect(mockRm).not.toHaveBeenCalled();
        expect(mockRemoveDataBeforeDelete).not.toHaveBeenCalled();
    });

    it('says only that the files go when there is no data to offer', async () => {
        mockRemovableDataOf.mockResolvedValue(undefined);

        const prompt = await asked(edsProject(), {}, null);

        expect(prompt?.message).toBe(FILES_ONLY);
        expect(prompt?.fields?.map(({ id }) => id)).toStrictEqual(['github', 'daLive']);
    });
});

describe('a project with no datapack data', () => {
    it('is not asked about data at all', async () => {
        mockRemovableDataOf.mockResolvedValue(undefined);
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockCreateQuickPick).not.toHaveBeenCalled();
        expect(mockRemoveDataBeforeDelete).not.toHaveBeenCalled();
    });
});
