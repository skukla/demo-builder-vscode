/**
 * applyFinish — applying a "Finish" row (EDS-57): what each finish outcome reports, and
 * what an unfinished fix does with each answer. The finish itself is
 * pendingClashFinish.test's (real git); here it answers what the test says.
 */

jest.mock('@/features/updates/services/pendingClashFinish', () => ({
    finishClash: jest.fn(),
    leaveClash: jest.fn(),
}));
jest.mock('@/features/updates/services/pendingClashFinishDeps', () => ({
    createFinishDeps: jest.fn(() => ({ finishDeps: true })),
}));

import { finishClash, leaveClash } from '@/features/updates/services/pendingClashFinish';
import type { PendingClash } from '@/features/updates/services/pendingClash';
import { applyFinish } from '@/features/updates/services/updateApplyFinish';
import type { UpdateQuestions } from '@/features/updates/services/updateApplyTemplate';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { UnfinishedAnswer } from '@/features/updates/services/updateClash';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const finishMock = finishClash as jest.Mock;
const leaveMock = leaveClash as jest.Mock;

const CLASH: PendingClash = {
    track: 'boilerplate',
    source: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
    base: 'a'.repeat(40),
    target: 'b'.repeat(40),
    files: ['blocks/header/header.js'],
    fixes: false,
    keptAt: '2026-10-21T00:00:00.000Z',
};
const STOREFRONT = '/p/justrite/components/eds-storefront';
const justrite = createMockProject({
    name: 'justrite',
    title: 'JustRite',
    componentInstances: { 'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready', path: STOREFRONT } },
});

function ctx(): UpdateContext {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: createMockCommandExecutor(),
        logger: createMockLogger(),
    };
}

function asking(answer: UnfinishedAnswer, aiAsksFirst = true): jest.Mocked<UpdateQuestions> {
    return {
        onClash: jest.fn(),
        onUnfinished: jest.fn().mockResolvedValue(answer),
        replaceLibraryBlocks: jest.fn(),
        aiAsksFirst: jest.fn(() => aiAsksFirst),
    };
}

const finish = (questions?: UpdateQuestions, c = ctx()) => applyFinish([{ project: justrite, clash: CLASH }], c, undefined, questions);

beforeEach(() => jest.clearAllMocks());

describe('applyFinish', () => {
    it('reports a finished fix as applied, with any fix that could not be put back', async () => {
        finishMock.mockResolvedValue({
            kind: 'finished',
            commit: 'c'.repeat(40),
            files: CLASH.files,
            notes: ['A Demo Builder fix could not be put back: x (y).'],
            localCopyClean: true,
        });

        const result = await finish();

        expect(finishMock).toHaveBeenCalledWith(justrite, { finishDeps: true });
        expect(result).toEqual({
            successCount: 1,
            failCount: 0,
            errors: [],
            applied: [
                'JustRite: the Adobe boilerplate update fixed with AI is finished and live.',
                'JustRite: A Demo Builder fix could not be put back: x (y).',
            ],
        });
    });

    it('says a newer version came out when the fix was dropped for it', async () => {
        finishMock.mockResolvedValue({ kind: 'moved-on' });

        const result = await finish();

        expect(result.errors).toEqual(['JustRite: a newer version came out, so the fix was dropped. Check for updates again.']);
    });

    it('asks about a fix that is not ready, and keeps it for the AI on Fix with AI', async () => {
        finishMock.mockResolvedValue({ kind: 'not-fixed', reason: 'blocks/header/header.js still has conflict markers' });
        const questions = asking('fix');

        const result = await finish(questions);

        expect(questions.onUnfinished).toHaveBeenCalledWith(justrite, 'blocks/header/header.js still has conflict markers');
        expect(result.errors).toEqual(['JustRite: the AI is having another go. Your AI asks you before anything goes live.']);
        // keptIn is what makes the boundary open the SC's AI on it again.
        expect(result.clashes).toEqual([
            { project: 'JustRite', projectName: 'justrite', track: 'boilerplate', files: CLASH.files, keptIn: STOREFRONT },
        ]);
        expect(leaveMock).not.toHaveBeenCalled();
    });

    it('says the fix goes live as soon as the AI finishes when approvals are off', async () => {
        finishMock.mockResolvedValue({ kind: 'not-fixed', reason: 'x' });

        const result = await finish(asking('fix', false));

        expect(result.errors).toEqual(['JustRite: the AI is having another go. It goes live as soon as your AI finishes.']);
    });

    it('keeps the fix for later without reopening the AI', async () => {
        finishMock.mockResolvedValue({ kind: 'not-fixed', reason: 'x' });

        const result = await finish(asking('later'));

        expect(result.errors).toEqual(['JustRite: the fix waits in Check for Updates.']);
        expect(result.clashes?.[0]).not.toHaveProperty('keptIn');
        expect(leaveMock).not.toHaveBeenCalled();
    });

    it('drops the fix on Drop the fix, and says the update is offered again', async () => {
        finishMock.mockResolvedValue({ kind: 'not-fixed', reason: 'x' });
        const c = ctx();

        const result = await finish(asking('leave'), c);

        expect(leaveMock).toHaveBeenCalledWith(justrite, c);
        expect(result.errors).toEqual(['JustRite: the fix was dropped. The update will be offered again.']);
        expect(result.clashes).toBeUndefined();
    });

    it('keeps the fix and gives the reason when no one is asked (an agent)', async () => {
        finishMock.mockResolvedValue({ kind: 'not-fixed', reason: 'x' });

        const result = await finish();

        expect(result.errors).toEqual(['JustRite: not finished yet, because x.']);
        expect(leaveMock).not.toHaveBeenCalled();
    });

    it('does nothing for an empty list', async () => {
        await expect(applyFinish([], ctx())).resolves.toEqual({ successCount: 0, failCount: 0, errors: [] });
        expect(finishMock).not.toHaveBeenCalled();
    });
});
