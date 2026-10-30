/**
 * updateQuestionsInModal — the questions an update run asks in the Updates modal (PL-80):
 * the two the shared apply asks, and whether to stop a running demo first.
 */

import * as vscode from 'vscode';
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
        finish: [],
        component: [{ project: running, componentId: 'mesh', latestVersion: '2' }],
        adobeMcp: [],
        blockLibrary: [],
        blockLibraryInstall: [],
        inspector: [],
        integration: [],
    };
}

const getConfig = vscode.workspace.getConfiguration as jest.Mock;

/** demoBuilder.ai.requireAgentConsent, as the SC set it. */
function approvals(on: boolean): void {
    getConfig.mockReturnValue({ get: jest.fn(() => on) });
}

beforeEach(() => {
    ask.mockReset();
    approvals(true);
});


/** A question with this heading, whose sentence contains `part`. */
function question(title: string, part: string): unknown {
    return { title, message: expect.stringContaining(part) };
}

describe('questionsInModal', () => {
    it('asks about a clash on the colleague\'s row with all three choices, naming the project', async () => {
        ask.mockResolvedValue('Fix with AI');

        const answer = await questionsInModal.onClash(stopped, {
            track: 'template',
            files: ['head.html', 'scripts/a.js'],
            canReset: true,
        });

        expect(answer).toBe('fix');
        expect(ask).toHaveBeenCalledWith(
            {
                title: 'The update clashes with your edits',
                message:
                    "This update changes something that was already edited in Bodea's storefront. " +
                    'Use AI to keep both changes. Your AI asks you before anything goes live.\n' +
                    'Or use the update and drop those edits.',
            },
            'Fix with AI',
            'Leave it as it is',
            'Use the update',
        );
    });

    // Owner, 2026-10-30: it said "Nothing goes live until you approve it" with approvals off.
    it('says it goes live as soon as the AI finishes when approvals are off', async () => {
        approvals(false);
        ask.mockResolvedValue('Fix with AI');

        await questionsInModal.onClash(stopped, { track: 'boilerplate', files: ['blocks/header/header.js'], canReset: false });

        expect(ask.mock.calls[0][0].message).toBe(
            "This update changes something that was already edited in Bodea's storefront. " +
                'Use AI to keep both changes. It goes live as soon as your AI finishes.',
        );
    });

    it('says whether the AI asks before anything goes live, from the setting, read each time', () => {
        approvals(false);
        expect(questionsInModal.aiAsksFirst()).toBe(false);
        approvals(true);
        expect(questionsInModal.aiAsksFirst()).toBe(true);
    });

    it("never offers a reset on Adobe's row", async () => {
        ask.mockResolvedValue('Leave it as it is');

        const answer = await questionsInModal.onClash(stopped, { track: 'boilerplate', files: ['blocks/header/header.js'], canReset: false });

        expect(answer).toBe('leave');
        expect(ask).toHaveBeenCalledWith(
            question('The update clashes with your edits', "This update changes something that was already edited in Bodea's storefront"),
            'Fix with AI',
            'Leave it as it is',
        );
        expect(ask.mock.calls[0][0].message).not.toMatch(/use the update/i);
    });

    it.each([
        ['Use the update', true, 'reset'],
        // A reset the question did not offer is never taken.
        ['Use the update', false, 'leave'],
        ['Leave it as it is', true, 'leave'],
        // Dismissed: nothing changes.
        [undefined, true, 'leave'],
    ])('answers %s (reset offered: %s) as %s', async (choice, canReset, expected) => {
        ask.mockResolvedValue(choice);

        expect(await questionsInModal.onClash(stopped, { track: 'template', files: ['head.html'], canReset })).toBe(expected);
    });

    it('asks what to do with a fix that is not ready, with three choices that need no code', async () => {
        ask.mockResolvedValue('Fix with AI');

        const answer = await questionsInModal.onUnfinished(stopped, 'blocks/header/header.js still has conflict markers');

        expect(answer).toBe('fix');
        expect(ask).toHaveBeenCalledWith(
            {
                title: 'The fix is not finished',
                message:
                    "The AI didn't finish fixing Bodea's storefront. You can have it keep going, pick it up " +
                    'later from Check for Updates, or drop it and skip this update.',
            },
            'Fix with AI',
            'Keep it for later',
            'Drop the fix',
        );
    });

    it.each([
        ['Drop the fix', 'leave'],
        ['Keep it for later', 'later'],
        // Dismissed: the fix is kept, nothing is lost.
        [undefined, 'later'],
    ])('answers %s as %s', async (choice, expected) => {
        ask.mockResolvedValue(choice);

        expect(await questionsInModal.onUnfinished(stopped, 'x')).toBe(expected);
    });

    it('asks whether to replace a library, and answers yes only on Replace blocks', async () => {
        ask.mockResolvedValueOnce('Replace blocks').mockResolvedValueOnce('Keep my blocks');

        expect(await questionsInModal.replaceLibraryBlocks('Demo Builder Blocks', stopped)).toBe(true);
        expect(await questionsInModal.replaceLibraryBlocks('Demo Builder Blocks', stopped)).toBe(false);
        expect(ask).toHaveBeenCalledWith(
            {
                title: 'Replace the blocks?',
                message:
                    '"Replace blocks" puts in the new versions, and any edits you made to these blocks are lost. "Keep my blocks" leaves them as they are.',
            },
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
        expect(ask).toHaveBeenCalledWith(
            { title: 'Stop the demo to update it?', message: 'JustRite is running. Stop it to update it?' },
            'Stop and update',
            'Skip',
        );
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
