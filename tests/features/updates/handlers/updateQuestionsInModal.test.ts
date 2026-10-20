/**
 * updateQuestionsInModal — the questions an update run asks in the Updates modal (PL-80):
 * the two the shared apply asks, and whether to stop a running demo first.
 */

import { askDuringOperation } from '@/core/vscode/operationPrompt';
import { questionsInModal, stopRunningDemos } from '@/features/updates/handlers/updateQuestionsInModal';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/core/vscode/operationPrompt', () => ({ askDuringOperation: jest.fn() }));
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

const ask = askDuringOperation as jest.Mock;

const running = createMockProject({ name: 'justrite', title: 'JustRite', path: '/p/justrite', status: 'running' });
const stopped = createMockProject({ name: 'bodea', title: 'Bodea', path: '/p/bodea', status: 'stopped' });

function selections(): UpdateSelections {
    return {
        forkSync: [{ owner: 'skukla', repo: 'citisignal', branch: 'main' }],
        template: [{ project: running }, { project: stopped }],
        boilerplate: [],
        component: [{ project: running, componentId: 'mesh', latestVersion: '2' }],
        adobeMcp: [],
        blockLibrary: [],
        blockLibraryInstall: [],
        inspector: [],
        integration: [],
    };
}

beforeEach(() => ask.mockReset());

describe('questionsInModal', () => {
    it('asks about a template conflict, naming the project and the files, and answers yes on a reset', async () => {
        ask.mockResolvedValue('Reset to template');

        const answer = await questionsInModal.resetTemplateOnConflict(stopped, ['head.html', 'scripts/a.js']);

        expect(answer).toBe(true);
        expect(ask).toHaveBeenCalledWith(
            expect.stringContaining('Bodea: the template update conflicts with your edits in 2 files (head.html, scripts/a.js)'),
            'Reset to template',
            'Keep my edits',
        );
    });

    it.each([['Keep my edits'], [undefined]])('answers no to a reset on %s', async (choice) => {
        ask.mockResolvedValue(choice);

        expect(await questionsInModal.resetTemplateOnConflict(stopped, ['head.html'])).toBe(false);
    });

    it('asks whether to replace a library, and answers yes only on Replace blocks', async () => {
        ask.mockResolvedValueOnce('Replace blocks').mockResolvedValueOnce('Keep my blocks');

        expect(await questionsInModal.replaceLibraryBlocks('Demo Builder Blocks', stopped)).toBe(true);
        expect(await questionsInModal.replaceLibraryBlocks('Demo Builder Blocks', stopped)).toBe(false);
        expect(ask).toHaveBeenCalledWith(
            expect.stringContaining('Demo Builder Blocks has new blocks for Bodea'),
            'Replace blocks',
            'Keep my blocks',
        );
    });
});

describe('stopRunningDemos', () => {
    it('asks once per running project, and stops the open one before its update', async () => {
        ask.mockResolvedValue('Stop and update');
        const stopDemo = jest.fn().mockResolvedValue(undefined);

        const out = await stopRunningDemos(selections(), '/p/justrite', stopDemo);

        expect(ask).toHaveBeenCalledTimes(1);
        expect(ask).toHaveBeenCalledWith('JustRite is running. Stop it to update it?', 'Stop and update', 'Skip');
        expect(stopDemo).toHaveBeenCalledTimes(1);
        expect(out).toEqual({ selections: selections(), skipped: [] });
    });

    it("leaves a skipped project's updates out, keeps everyone else's, and says why", async () => {
        ask.mockResolvedValue('Skip');
        const stopDemo = jest.fn();

        const out = await stopRunningDemos(selections(), '/p/justrite', stopDemo);

        expect(stopDemo).not.toHaveBeenCalled();
        expect(out.selections.template.map((t) => t.project.path)).toEqual(['/p/bodea']);
        expect(out.selections.component).toStrictEqual([]);
        expect(out.selections.forkSync).toHaveLength(1);
        expect(out.skipped).toEqual(['JustRite: not updated, because its demo is running.']);
    });

    it('asks nothing when no project is running', async () => {
        const quiet = { ...selections(), template: [{ project: stopped }], component: [] };

        const out = await stopRunningDemos(quiet, '/p/justrite', jest.fn());

        expect(ask).not.toHaveBeenCalled();
        expect(out.selections).toBe(quiet);
    });
});
