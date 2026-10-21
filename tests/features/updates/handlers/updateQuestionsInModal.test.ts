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
    it('asks about a clash on the colleague\'s row with all three choices, naming the project and the files', async () => {
        ask.mockResolvedValue('Fix with AI');

        const answer = await questionsInModal.onClash(stopped, {
            track: 'template',
            files: ['head.html', 'scripts/a.js'],
            canReset: true,
        });

        expect(answer).toBe('fix');
        expect(ask).toHaveBeenCalledWith(
            expect.stringContaining('Bodea: The template update clashes with edits in the storefront in 2 files (head.html, scripts/a.js)'),
            'Fix with AI',
            'Leave it as it is',
            'Reset to template',
        );
    });

    it("never offers a reset on Adobe's row, and says which update it is", async () => {
        ask.mockResolvedValue('Leave it as it is');

        const answer = await questionsInModal.onClash(stopped, { track: 'boilerplate', files: ['blocks/header/header.js'], canReset: false });

        expect(answer).toBe('leave');
        expect(ask).toHaveBeenCalledWith(
            expect.stringContaining("Adobe's boilerplate update clashes"),
            'Fix with AI',
            'Leave it as it is',
        );
        expect(ask.mock.calls[0][0]).not.toContain('Reset to template');
    });

    it.each([
        ['Reset to template', true, 'reset'],
        // A reset the question did not offer is never taken.
        ['Reset to template', false, 'leave'],
        ['Leave it as it is', true, 'leave'],
        // Dismissed: nothing changes.
        [undefined, true, 'leave'],
    ])('answers %s (reset offered: %s) as %s', async (choice, canReset, expected) => {
        ask.mockResolvedValue(choice);

        expect(await questionsInModal.onClash(stopped, { track: 'template', files: ['head.html'], canReset })).toBe(expected);
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
