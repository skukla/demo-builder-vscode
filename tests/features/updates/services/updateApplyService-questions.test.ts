/**
 * applyUpdatesHeadless with a person to ask (PL-80): the Updates modal applies through
 * the same headless path the agent uses, and asks the two questions the picker asked in
 * notifications. An agent passes no questions and keeps the defaults its own suites pin
 * (`updateApplyService-apply.test.ts`).
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    edsProject,
    emptySelections,
    installedLibrary,
    makeCtx,
    mockApplyBlockLibraryUpdateResolved,
    mockSyncWithTemplate,
    resetFakes,
} from './updateApplyService.testUtils';
import * as vscode from 'vscode';
import { applyUpdatesHeadless, type UpdateQuestions } from '@/features/updates/services/updateApplyService';
import type { Project } from '@/types/base';

const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;

function setSyncBehavior(value: 'ask' | 'enabled' | 'disabled'): void {
    getConfigMock.mockReturnValue({ get: jest.fn((_k: string, def: unknown) => value ?? def) });
}

function questions(answers: { reset?: boolean; replace?: boolean } = {}): jest.Mocked<UpdateQuestions> {
    return {
        resetTemplateOnConflict: jest.fn().mockResolvedValue(answers.reset ?? false),
        replaceLibraryBlocks: jest.fn().mockResolvedValue(answers.replace ?? false),
    };
}

const CONFLICTED = {
    success: false,
    strategy: 'merge',
    syncedCommit: '',
    conflicts: ['blocks/hero/hero.js'],
    error: 'Merge conflicts in 1 file (blocks/hero/hero.js); the template update was not applied.',
};

/** A storefront built on the tested boilerplate: it records an LKG source (ADR-006). */
function thinLayerProject(): Project {
    const base = edsProject();
    const storefront = base.componentInstances?.['eds-storefront'];
    return {
        ...base,
        componentInstances: {
            'eds-storefront': {
                ...storefront,
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                metadata: { ...storefront?.metadata, lkgSource: { owner: 'skukla', repo: 'eds-demo-patches' } },
            },
        },
    };
}

beforeEach(() => {
    resetFakes();
    setSyncBehavior('enabled');
});

describe('a template update that conflicts with the SC edits', () => {
    it('asks, naming the files, and resets to the template when the answer is yes', async () => {
        mockSyncWithTemplate
            .mockResolvedValueOnce(CONFLICTED)
            .mockResolvedValueOnce({ success: true, strategy: 'reset', syncedCommit: 'r1' });
        const project = edsProject();
        const ask = questions({ reset: true });

        const res = await applyUpdatesHeadless({ ...emptySelections(), template: [{ project }] }, makeCtx(), undefined, {
            questions: ask,
        });

        expect(ask.resetTemplateOnConflict).toHaveBeenCalledWith(project, ['blocks/hero/hero.js']);
        expect(mockSyncWithTemplate).toHaveBeenLastCalledWith(project, { strategy: 'reset' });
        expect(res.template).toEqual({ successCount: 1, failCount: 0, errors: [] });
    });

    it('keeps the storefront as it is when the answer is no', async () => {
        mockSyncWithTemplate.mockResolvedValue(CONFLICTED);

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), template: [{ project: edsProject() }] },
            makeCtx(),
            undefined,
            { questions: questions({ reset: false }) },
        );

        expect(mockSyncWithTemplate).toHaveBeenCalledTimes(1);
        expect(res.template.failCount).toBe(1);
    });

    // Resetting it to the bare template would remove Demo Builder's fixes (EDS-51).
    it('does not ask for a storefront built on the tested boilerplate', async () => {
        mockSyncWithTemplate.mockResolvedValue(CONFLICTED);
        const ask = questions({ reset: true });

        await applyUpdatesHeadless(
            { ...emptySelections(), template: [{ project: thinLayerProject() }] },
            makeCtx(),
            undefined,
            { questions: ask },
        );

        expect(ask.resetTemplateOnConflict).not.toHaveBeenCalled();
        expect(mockSyncWithTemplate).toHaveBeenCalledTimes(1);
    });
});

describe("a block library under the 'ask' sync setting", () => {
    const item = () => ({ project: edsProject(), library: installedLibrary('Lib A'), latestCommit: 'b' });

    it('asks, and replaces its blocks when the answer is yes', async () => {
        setSyncBehavior('ask');
        const ask = questions({ replace: true });
        const selected = item();

        const res = await applyUpdatesHeadless({ ...emptySelections(), blockLibrary: [selected] }, makeCtx(), undefined, {
            questions: ask,
        });

        expect(ask.replaceLibraryBlocks).toHaveBeenCalledWith('Lib A', selected.project);
        expect(mockApplyBlockLibraryUpdateResolved).toHaveBeenCalledWith(selected, 'enabled', expect.anything());
        expect(res.addon).toEqual({ successCount: 1, failCount: 0, errors: [] });
    });

    it('keeps its blocks, and lists it as not applied, when the answer is no', async () => {
        setSyncBehavior('ask');
        const selected = item();

        const res = await applyUpdatesHeadless({ ...emptySelections(), blockLibrary: [selected] }, makeCtx(), undefined, {
            questions: questions({ replace: false }),
        });

        expect(mockApplyBlockLibraryUpdateResolved).toHaveBeenCalledWith(selected, 'disabled', expect.anything());
        expect(res.addon).toEqual({ successCount: 0, failCount: 0, errors: [], deferred: ['Lib A'] });
    });

    it.each(['enabled', 'disabled'] as const)('does not ask when the setting is %s', async (setting) => {
        setSyncBehavior(setting);
        const ask = questions({ replace: true });

        await applyUpdatesHeadless({ ...emptySelections(), blockLibrary: [item()] }, makeCtx(), undefined, {
            questions: ask,
        });

        expect(ask.replaceLibraryBlocks).not.toHaveBeenCalled();
    });
});
