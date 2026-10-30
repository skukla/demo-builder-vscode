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
    mockSyncBoilerplate,
    mockSyncWithTemplate,
    resetFakes,
} from './updateApplyService.testUtils';
import * as vscode from 'vscode';
import { keepClash } from '@/features/updates/services/pendingClash';
import { applyUpdatesHeadless, type UpdateQuestions } from '@/features/updates/services/updateApplyService';
import type { ClashAnswer } from '@/features/updates/services/updateClash';
import type { TemplateSyncResult } from '@/features/updates/services/templateSyncTypes';
import type { Project } from '@/types/base';

// Keeping a clash runs real git in the local copy; that is pendingClash.test's.
jest.mock('@/features/updates/services/pendingClash', () => ({ keepClash: jest.fn() }));
const mockKeepClash = keepClash as jest.Mock;

const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;

function setSyncBehavior(value: 'ask' | 'enabled' | 'disabled'): void {
    getConfigMock.mockReturnValue({ get: jest.fn((_k: string, def: unknown) => value ?? def) });
}

function questions(answers: { clash?: ClashAnswer; replace?: boolean } = {}): jest.Mocked<UpdateQuestions> {
    return {
        onClash: jest.fn().mockResolvedValue(answers.clash ?? 'leave'),
        onUnfinished: jest.fn().mockResolvedValue('later'),
        replaceLibraryBlocks: jest.fn().mockResolvedValue(answers.replace ?? false),
    };
}

const CONFLICTED: TemplateSyncResult = {
    success: false,
    strategy: 'merge',
    syncedCommit: '',
    conflicts: ['blocks/hero/hero.js'],
    clash: {
        source: { owner: 'adobe', repo: 'aem-boilerplate-commerce' },
        base: 'a'.repeat(40),
        target: 'b'.repeat(40),
        preserveFiles: ['fstab.yaml', 'config.json'],
    },
    edits: [{ file: 'blocks/hero/hero.js', whose: 'storefront' }],
    error:
        'The update stopped on 1 file that was edited (blocks/hero/hero.js, an edit made in this storefront). '
        + 'Nothing was changed: the storefront on GitHub is as it was.',
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

describe('a template update that clashes with edits in the storefront', () => {
    const apply = (project: Project, ask: UpdateQuestions, ctx = makeCtx()) =>
        applyUpdatesHeadless({ ...emptySelections(), template: [{ project }] }, ctx, undefined, { questions: ask });

    it('asks with the files and a reset offered, and resets to the template on Reset', async () => {
        mockSyncWithTemplate
            .mockResolvedValueOnce(CONFLICTED)
            .mockResolvedValueOnce({ success: true, strategy: 'reset', syncedCommit: 'r1' });
        const project = edsProject();
        const ask = questions({ clash: 'reset' });

        const res = await apply(project, ask);

        expect(ask.onClash).toHaveBeenCalledWith(project, { track: 'template', files: ['blocks/hero/hero.js'], canReset: true });
        expect(mockSyncWithTemplate).toHaveBeenLastCalledWith(project, { strategy: 'reset' });
        expect(res.template).toEqual({ successCount: 1, failCount: 0, errors: [] });
    });

    it('changes nothing on Leave, and reports the files', async () => {
        mockSyncWithTemplate.mockResolvedValue(CONFLICTED);

        const res = await apply(edsProject(), questions({ clash: 'leave' }));

        expect(mockSyncWithTemplate).toHaveBeenCalledTimes(1);
        expect(mockKeepClash).not.toHaveBeenCalled();
        expect(res.template.failCount).toBe(1);
        expect(res.template.clashes).toEqual([
            { project: 'demo', projectName: 'demo', track: 'template', files: ['blocks/hero/hero.js'], edits: [{ file: 'blocks/hero/hero.js', whose: 'storefront' }] },
        ]);
    });

    it('keeps the clash in the local copy on Fix with AI, saves the record and says where it is', async () => {
        mockSyncWithTemplate.mockResolvedValue(CONFLICTED);
        mockKeepClash.mockResolvedValue({ kind: 'kept', storefrontPath: '/p/demo/components/eds-storefront', files: ['blocks/hero/hero.js'] });
        const project = edsProject();
        const ctx = makeCtx();

        const res = await apply(project, questions({ clash: 'fix' }), ctx);

        expect(mockKeepClash).toHaveBeenCalledWith(
            project,
            { track: 'template', clash: CONFLICTED.clash, conflicts: ['blocks/hero/hero.js'], fixes: false },
            ctx,
        );
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(mockSyncWithTemplate).toHaveBeenCalledTimes(1);
        expect(res.template.clashes).toEqual([
            {
                project: 'demo',
                projectName: 'demo',
                track: 'template',
                files: ['blocks/hero/hero.js'],
                edits: [{ file: 'blocks/hero/hero.js', whose: 'storefront' }],
                keptIn: '/p/demo/components/eds-storefront',
            },
        ]);
        expect(res.template.errors).toEqual([
            'demo: 1 file clashes with edits in the storefront (blocks/hero/hero.js, an edit made in this storefront). '
                + "It is kept in the project's local copy to fix with AI; nothing was pushed.",
        ]);
    });

    it('says why, when the clash could not be kept', async () => {
        mockSyncWithTemplate.mockResolvedValue(CONFLICTED);
        mockKeepClash.mockResolvedValue({ kind: 'not-kept', reason: 'this project has no local copy of its storefront' });
        const ctx = makeCtx();

        const res = await apply(edsProject(), questions({ clash: 'fix' }), ctx);

        expect(ctx.stateManager.saveProject).not.toHaveBeenCalled();
        expect(res.template.errors[0]).toMatch(/It could not be kept for fixing: this project has no local copy of its storefront\.$/);
        expect(res.template.clashes?.[0]).toMatchObject({ notKept: 'this project has no local copy of its storefront' });
    });

    // Resetting it to the bare template would remove Demo Builder's fixes (EDS-51).
    it('asks a storefront built on the tested boilerplate without a reset, and never resets it', async () => {
        mockSyncWithTemplate.mockResolvedValue(CONFLICTED);
        const project = thinLayerProject();
        const ask = questions({ clash: 'reset' });

        await apply(project, ask);

        expect(ask.onClash).toHaveBeenCalledWith(project, expect.objectContaining({ canReset: false }));
        expect(mockSyncWithTemplate).toHaveBeenCalledTimes(1);
    });

    it("keeps a tested-boilerplate storefront's clash with its fixes to ride in the finishing commit", async () => {
        mockSyncWithTemplate.mockResolvedValue(CONFLICTED);
        mockKeepClash.mockResolvedValue({ kind: 'kept', storefrontPath: '/p/x', files: ['blocks/hero/hero.js'] });

        await apply(thinLayerProject(), questions({ clash: 'fix' }));

        expect(mockKeepClash).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fixes: true }), expect.anything());
    });
});

describe("Adobe's boilerplate update that clashes", () => {
    const BASE = {
        template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
        commit: 'a'.repeat(40),
        lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
        found: 'first-commit' as const,
    };

    it('asks without a reset, and keeps the clash on Fix with AI', async () => {
        mockSyncBoilerplate.mockResolvedValue(CONFLICTED);
        mockKeepClash.mockResolvedValue({ kind: 'kept', storefrontPath: '/p/demo/components/eds-storefront', files: ['blocks/hero/hero.js'] });
        const project = edsProject();
        const ask = questions({ clash: 'fix' });

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), boilerplate: [{ project, base: BASE, tested: 'b'.repeat(40) }] },
            makeCtx(),
            undefined,
            { questions: ask },
        );

        expect(ask.onClash).toHaveBeenCalledWith(project, { track: 'boilerplate', files: ['blocks/hero/hero.js'], canReset: false });
        expect(mockKeepClash).toHaveBeenCalledWith(project, expect.objectContaining({ track: 'boilerplate', fixes: false }), expect.anything());
        expect(res.boilerplate.clashes?.[0]).toMatchObject({ track: 'boilerplate', keptIn: '/p/demo/components/eds-storefront' });
        expect(res.boilerplate.errors[0]).toMatch(/^demo \(Adobe boilerplate\): 1 file clashes/);
    });

    // The Updates modal's row: a clash the SC answered is their choice, not a failure
    // (owner, 2026-10-21). The result still counts it as not applied, for the agent.
    it('tells its row as left alone, not failed, on Leave', async () => {
        mockSyncBoilerplate.mockResolvedValue(CONFLICTED);
        const onItem = jest.fn();
        const item = { project: edsProject(), base: BASE, tested: 'b'.repeat(40) };

        const res = await applyUpdatesHeadless({ ...emptySelections(), boilerplate: [item] }, makeCtx(), undefined, {
            questions: questions({ clash: 'leave' }),
            onItem,
        });

        expect(onItem).toHaveBeenLastCalledWith('boilerplate', item, {
            state: 'skipped',
            message: 'Not updated. It clashes with an edit made in this storefront, which was left as it is. Nothing was changed.',
        });
        expect(res.boilerplate.failCount).toBe(1);
    });

    it("says on Leave when the edit came with the colleague's demo, naming no file", async () => {
        mockSyncBoilerplate.mockResolvedValue({
            ...CONFLICTED,
            edits: [{ file: 'blocks/hero/hero.js', whose: 'copied-demo', from: 'kmanns/justrite' }],
        });
        const onItem = jest.fn();
        const item = { project: edsProject(), base: BASE, tested: 'b'.repeat(40) };

        await applyUpdatesHeadless({ ...emptySelections(), boilerplate: [item] }, makeCtx(), undefined, {
            questions: questions({ clash: 'leave' }),
            onItem,
        });

        expect(onItem.mock.calls.at(-1)?.[2]).toEqual({
            state: 'skipped',
            message: 'Not updated. It clashes with an edit that came with kmanns/justrite, which was left as it is. Nothing was changed.',
        });
    });
});

describe("a template update's row, when its clash was answered", () => {
    const tell = async (answer: ClashAnswer) => {
        mockSyncWithTemplate.mockResolvedValue(CONFLICTED);
        const onItem = jest.fn();
        await applyUpdatesHeadless({ ...emptySelections(), template: [{ project: edsProject() }] }, makeCtx(), undefined, {
            questions: questions({ clash: answer }),
            onItem,
        });
        return onItem.mock.calls.at(-1)?.[2];
    };

    it('is left alone, saying where the clash is, when it was kept to fix with AI', async () => {
        mockKeepClash.mockResolvedValue({ kind: 'kept', storefrontPath: '/p/demo/components/eds-storefront', files: ['blocks/hero/hero.js'] });

        expect(await tell('fix')).toEqual({
            state: 'skipped',
            message: 'Not updated yet. Your AI is working on it, and nothing goes live until you approve it.',
        });
    });

    it('fails, with the reason, when the clash could not be kept', async () => {
        mockKeepClash.mockResolvedValue({ kind: 'not-kept', reason: 'this project has no local copy of its storefront' });

        expect(await tell('fix')).toMatchObject({ state: 'failed', message: expect.stringContaining('could not be kept') });
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
