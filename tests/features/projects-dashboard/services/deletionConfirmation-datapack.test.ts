/**
 * "Also delete its pack": a project whose pack may go with it (`deletablePackOf`: the SC's own,
 * used by no other local project, owner 2026-11-03) is asked, beside the GitHub repository and
 * DA.live site, whether that pack goes too. Unticked,
 * because keeping a pack is reversible and deleting one is not; and never answered by the
 * `cleanupBehavior` setting, for the same reason. A ticked box deletes the pack after the
 * project's own files, and what happened goes on the cleanup results.
 *
 * The library call is mocked in the wall (`mockDeleteProjectDemoPack`); its own suite is
 * `demoPackDeletion.test.ts`. Every assertion here reads what it was handed.
 */

import {
    deleteProject,
    mockCreateQuickPick,
    mockDeletablePackOf,
    mockDeleteProjectDemoPack,
    mockDeleteRepository,
    mockGetConfiguration,
    mockGetToken,
    mockRm,
    mockShowInformationMessage,
    mockShowWarningMessage,
    mockSleep,
} from './projectDeletionService.testUtils';
import { SERVICES, armQuickPick, context, edsProject, plainProject } from './projectDeletionService.fixtures';
import { heldProgress } from '@/core/vscode/operationProgress';
import { answerOperationPrompt, isAwaitingAnswer } from '@/core/vscode/operationPrompt';
import type { HandlerContext } from '@/types/handlers';

const OWN = { name: 'acme-demo-1a2b3c', displayName: 'Acme Demo' };
const PACK_RESULT = { type: 'datapack', name: 'Acme Demo', success: true };

beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    mockSleep.mockResolvedValue(undefined);
    mockGetConfiguration.mockReturnValue({ get: () => 'ask' });
    mockShowInformationMessage.mockResolvedValue(undefined);
    mockGetToken.mockResolvedValue('gh-token');
    mockDeleteRepository.mockResolvedValue(undefined);
    mockDeleteProjectDemoPack.mockResolvedValue(PACK_RESULT);
    mockDeletablePackOf.mockResolvedValue(OWN);
});

describe('a project whose pack may go with it is asked about it', () => {
    it('offers the pack, unticked, even on a project with nothing online', async () => {
        const pick = armQuickPick('accept', []);

        await deleteProject(context(), plainProject(), SERVICES);

        expect(pick.items().map((item) => item.id)).toEqual(['datapack']);
        expect(pick.selectedAtShow()).toStrictEqual([]);
        expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('offers it after the repository and the site on an EDS project', async () => {
        const pick = armQuickPick('accept', []);

        await deleteProject(context(), edsProject(), SERVICES);

        expect(pick.items().map((item) => item.id)).toEqual(['github', 'daLive', 'datapack']);
    });

    it('keeps the pack when the box is left unticked', async () => {
        armQuickPick('accept', []);

        const result = await deleteProject(context(), plainProject(), SERVICES);

        expect(mockRm).toHaveBeenCalled();
        expect(mockDeleteProjectDemoPack).not.toHaveBeenCalled();
        expect(result.data).toEqual({ success: true, projectName: 'demo-project', cleanupResults: [] });
    });

    it('deletes the pack after the project files when ticked, and reports it', async () => {
        armQuickPick('accept', ['datapack']);
        const ctx: HandlerContext = context();
        const order: string[] = [];
        mockRm.mockImplementation(async () => { order.push('files'); });
        mockDeleteProjectDemoPack.mockImplementation(async () => { order.push('pack'); return PACK_RESULT; });

        const result = await deleteProject(ctx, plainProject(), SERVICES);

        expect(mockDeleteProjectDemoPack).toHaveBeenCalledWith(ctx, OWN);
        expect(order).toEqual(['files', 'pack']);
        expect(result.data).toEqual({ success: true, projectName: 'demo-project', cleanupResults: [PACK_RESULT] });
    });

    it('cancels without deleting anything when the question is dismissed', async () => {
        armQuickPick('escape', ['datapack']);

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockRm).not.toHaveBeenCalled();
        expect(mockDeleteProjectDemoPack).not.toHaveBeenCalled();
    });
});

describe('the cleanupBehavior setting never deletes a pack', () => {
    it('deleteAll ticks the online resources, never the pack, and still asks', async () => {
        mockGetConfiguration.mockReturnValue({ get: () => 'deleteAll' });
        const pick = armQuickPick('accept');

        await deleteProject(context(), edsProject(), SERVICES);

        expect(mockCreateQuickPick).toHaveBeenCalled();
        expect(pick.selectedAtShow().map((item) => item.id)).toStrictEqual(['github', 'daLive']);
        expect(mockDeleteRepository).toHaveBeenCalled();
        expect(mockDeleteProjectDemoPack).not.toHaveBeenCalled();
    });

    it('localOnly asks the plain question and keeps the pack', async () => {
        mockGetConfiguration.mockReturnValue({ get: () => 'localOnly' });
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockShowWarningMessage).toHaveBeenCalled();
        expect(mockRm).toHaveBeenCalled();
        expect(mockDeleteProjectDemoPack).not.toHaveBeenCalled();
    });
});

describe('the same question in the progress modal', () => {
    const ID = 'delete-demo-project';

    it('asks with one unticked box naming the pack, and deletes it when ticked', async () => {
        const ctx = context();
        const done = deleteProject(ctx, plainProject(), SERVICES, { progress: 'modal', operationId: ID });
        for (let i = 0; i < 50 && !isAwaitingAnswer(ID); i++) await Promise.resolve();
        const fields = heldProgress(ID)?.prompt?.fields;
        answerOperationPrompt(ID, 'Delete', { datapack: 'true' });
        await done;

        expect(fields?.map(({ id, kind, value, description }) => ({ id, kind, value, description }))).toStrictEqual([
            { id: 'datapack', kind: 'checkbox', value: '', description: 'Acme Demo' },
        ]);
        expect(fields?.[0]?.label).toBe('Delete Datapack');
        expect(mockDeleteProjectDemoPack).toHaveBeenCalledWith(ctx, OWN);
    });

    it('ticks the repository and the site under deleteAll, never the pack, and leaving it deletes nothing', async () => {
        mockGetConfiguration.mockReturnValue({ get: () => 'deleteAll' });
        const done = deleteProject(context(), edsProject(), SERVICES, { progress: 'modal', operationId: ID });
        for (let i = 0; i < 50 && !isAwaitingAnswer(ID); i++) await Promise.resolve();
        const fields = heldProgress(ID)?.prompt?.fields;
        answerOperationPrompt(ID, undefined, {});
        await done;

        expect(fields?.map(({ id, label, value }) => ({ id, label, value }))).toStrictEqual([
            { id: 'github', label: 'Delete Repository', value: 'true' },
            { id: 'daLive', label: 'Delete DA.live Site', value: 'true' },
            { id: 'datapack', label: 'Delete Datapack', value: '' },
        ]);
        expect(mockRm).not.toHaveBeenCalled();
    });
});

describe('a project whose pack may not go with it', () => {
    it('is not asked about a pack at all', async () => {
        mockDeletablePackOf.mockResolvedValue(undefined);
        mockShowWarningMessage.mockResolvedValue('Delete');

        await deleteProject(context(), plainProject(), SERVICES);

        expect(mockCreateQuickPick).not.toHaveBeenCalled();
        expect(mockDeleteProjectDemoPack).not.toHaveBeenCalled();
    });
});
