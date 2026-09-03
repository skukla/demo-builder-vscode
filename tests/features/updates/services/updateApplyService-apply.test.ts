/**
 * updateApplyService.applyUpdatesHeadless — what each category core hands its
 * service, what it reports back, and how failures are worded.
 *
 * The sibling `updateApplyService.test.ts` pins the orchestration shape with the
 * REAL Adobe MCP core; this one mocks every collaborator so the arguments and
 * the per-item wording are the subject. The dedup uses the REAL
 * shouldSkipBlockLibrary, so "covered by template sync" is decided by project
 * metadata, not by a mock's answer.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    ComponentUpdaterCtor,
    ForkSyncServiceCtor,
    TemplateSyncServiceCtor,
    edsProject,
    emptySelections,
    installedLibrary,
    makeCtx,
    mockApplyAdobeMcpUpdate,
    mockApplyBlockLibraryUpdateResolved,
    mockSyncFork,
    mockSyncWithTemplate,
    mockUpdateCommitShaWithRollback,
    mockUpdateComponent,
    mockUpdateLastSyncedCommit,
    resetFakes,
} from './updateApplyService.testUtils';
import * as vscode from 'vscode';
import { applyUpdatesHeadless } from '@/features/updates/services/updateApplyService';

const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;

function setSyncBehavior(value: 'ask' | 'enabled' | 'disabled'): void {
    getConfigMock.mockReturnValue({ get: jest.fn((_k: string, def: unknown) => value ?? def) });
}

const fork = { owner: 'me', repo: 'a', branch: 'main' };

beforeEach(() => {
    resetFakes();
    setSyncBehavior('enabled');
});

describe('fork sync', () => {
    it('builds the service from the context and syncs owner/repo/branch, reporting progress', async () => {
        const ctx = makeCtx();
        const onProgress = jest.fn();
        const sel = { ...emptySelections(), forkSync: [fork] };

        const res = await applyUpdatesHeadless(sel, ctx, onProgress);

        expect(ForkSyncServiceCtor).toHaveBeenCalledWith(ctx.secrets, ctx.logger);
        expect(mockSyncFork).toHaveBeenCalledWith('me', 'a', 'main');
        expect(onProgress).toHaveBeenCalledWith('Syncing fork me/a...');
        expect(res.forkSync).toEqual({ successCount: 1, failCount: 0, errors: [] });
    });

    it('does not even build the service when nothing is selected', async () => {
        await applyUpdatesHeadless(emptySelections(), makeCtx());

        expect(ForkSyncServiceCtor).not.toHaveBeenCalled();
    });

    it.each([
        [
            'the service message',
            { success: false, message: 'upstream gone' },
            'me/a: upstream gone',
        ],
        ['a fallback when it has none', { success: false, message: '' }, 'me/a: sync failed'],
        [
            'the divergence wording over the message',
            { success: false, conflict: true, message: 'x' },
            'me/a: diverged from upstream (cannot fast-forward)',
        ],
    ])('a failed sync records %s', async (_label, answer, wording) => {
        mockSyncFork.mockResolvedValue(answer);

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), forkSync: [fork] },
            makeCtx()
        );

        expect(res.forkSync).toEqual({ successCount: 0, failCount: 1, errors: [wording] });
    });

    it('a thrown error is recorded sanitized, logged, and the loop continues', async () => {
        const ctx = makeCtx();
        mockSyncFork
            .mockRejectedValueOnce(new Error('network down\nat stack'))
            .mockResolvedValueOnce({ success: true, message: 'ok' });

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), forkSync: [fork, { ...fork, repo: 'b' }] },
            ctx
        );

        expect(res.forkSync).toEqual({
            successCount: 1,
            failCount: 1,
            errors: ['me/a: network down'],
        });
        expect(ctx.logger.error).toHaveBeenCalledTimes(1);
        expect(mockSyncFork).toHaveBeenLastCalledWith('me', 'b', 'main');
    });
});

describe('template sync', () => {
    it('builds the service from the context, syncs with merge, records the commit', async () => {
        const ctx = makeCtx();
        const project = edsProject();
        const onProgress = jest.fn();

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), template: [{ project }] },
            ctx,
            onProgress
        );

        expect(TemplateSyncServiceCtor).toHaveBeenCalledWith(
            ctx.secrets,
            ctx.logger,
            ctx.commandManager
        );
        expect(mockSyncWithTemplate).toHaveBeenCalledWith(project, { strategy: 'merge' });
        expect(mockUpdateLastSyncedCommit).toHaveBeenCalledWith(project, 'c1', ctx.stateManager);
        expect(onProgress).toHaveBeenCalledWith('Syncing template for demo...');
        expect(res.template).toEqual({ successCount: 1, failCount: 0, errors: [] });
    });

    it('does not build the service when nothing is selected', async () => {
        await applyUpdatesHeadless(emptySelections(), makeCtx());

        expect(TemplateSyncServiceCtor).not.toHaveBeenCalled();
    });

    it.each([
        ['its error', { success: false, error: 'merge aborted' }, 'demo: merge aborted'],
        ['Unknown error when it has none', { success: false }, 'demo: Unknown error'],
    ])('a failed result records %s and records no commit', async (_label, answer, wording) => {
        mockSyncWithTemplate.mockResolvedValue(answer);

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), template: [{ project: edsProject() }] },
            makeCtx()
        );

        expect(res.template).toEqual({ successCount: 0, failCount: 1, errors: [wording] });
        expect(mockUpdateLastSyncedCommit).not.toHaveBeenCalled();
    });

    it('a thrown error is recorded sanitized to its first line', async () => {
        mockSyncWithTemplate.mockRejectedValue(new Error('git exploded\nat stack'));

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), template: [{ project: edsProject() }] },
            makeCtx()
        );

        expect(res.template.errors).toEqual(['demo: git exploded']);
    });

    it('a synced project has its template-sourced library skipped by the add-on step', async () => {
        const project = edsProject();
        const fromTemplate = installedLibrary('Template Blocks', {
            owner: 'adobe',
            repo: 'aem-boilerplate-commerce',
            branch: 'main',
        });
        const other = installedLibrary('Other Blocks');

        const res = await applyUpdatesHeadless(
            {
                ...emptySelections(),
                template: [{ project }],
                blockLibrary: [
                    { project, library: fromTemplate, latestCommit: 'bbb' },
                    { project, library: other, latestCommit: 'ccc' },
                ],
            },
            makeCtx()
        );

        expect(mockApplyBlockLibraryUpdateResolved).toHaveBeenCalledTimes(1);
        expect(mockApplyBlockLibraryUpdateResolved).toHaveBeenCalledWith(
            expect.objectContaining({ library: other }),
            'enabled',
            expect.anything()
        );
        expect(res.addon.successCount).toBe(1);
    });

    it('a FAILED template sync does not shield its library from the add-on step', async () => {
        mockSyncWithTemplate.mockResolvedValue({ success: false, error: 'nope' });
        const project = edsProject();
        const fromTemplate = installedLibrary('Template Blocks', {
            owner: 'adobe',
            repo: 'aem-boilerplate-commerce',
            branch: 'main',
        });

        await applyUpdatesHeadless(
            {
                ...emptySelections(),
                template: [{ project }],
                blockLibrary: [{ project, library: fromTemplate, latestCommit: 'bbb' }],
            },
            makeCtx()
        );

        expect(mockApplyBlockLibraryUpdateResolved).toHaveBeenCalledTimes(1);
    });
});

describe('components', () => {
    const item = (project = edsProject(), componentId = 'mesh') => ({
        project,
        componentId,
        latestVersion: '2.0.0',
        downloadUrl: `https://x/${componentId}.zip`,
    });

    it('builds the updater from the context and hands it project, id, url, version', async () => {
        const ctx = makeCtx();
        const project = edsProject();
        const onProgress = jest.fn();

        await applyUpdatesHeadless(
            { ...emptySelections(), component: [item(project)] },
            ctx,
            onProgress
        );

        expect(ComponentUpdaterCtor).toHaveBeenCalledWith(ctx.logger, '/ext', ctx.commandManager);
        expect(mockUpdateComponent).toHaveBeenCalledWith(
            project,
            'mesh',
            'https://x/mesh.zip',
            '2.0.0'
        );
        expect(onProgress).toHaveBeenCalledWith('Updating mesh in demo...');
    });

    it('does not build the updater or save anything when nothing is selected', async () => {
        const ctx = makeCtx();

        await applyUpdatesHeadless(emptySelections(), ctx);

        expect(ComponentUpdaterCtor).not.toHaveBeenCalled();
        expect(ctx.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('groups by project: each project saved once, after all of its components', async () => {
        const ctx = makeCtx();
        const a = edsProject({ name: 'a', path: '/p/a' });
        const b = edsProject({ name: 'b', path: '/p/b' });

        const res = await applyUpdatesHeadless(
            {
                ...emptySelections(),
                component: [item(a, 'mesh'), item(b, 'mesh'), item(a, 'eds-storefront')],
            },
            ctx
        );

        expect(mockUpdateComponent).toHaveBeenCalledTimes(3);
        expect(ctx.stateManager.saveProject.mock.calls).toEqual([[a], [b]]);
        expect(res.component.successCount).toBe(3);
    });

    it('an item without a download URL is skipped, but its project is still saved', async () => {
        const ctx = makeCtx();
        const project = edsProject();

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), component: [{ ...item(project), downloadUrl: undefined }] },
            ctx
        );

        expect(mockUpdateComponent).not.toHaveBeenCalled();
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(res.component).toEqual({ successCount: 0, failCount: 0, errors: [] });
    });

    it('a failed component is recorded with its name and project, and the rest proceed', async () => {
        const ctx = makeCtx();
        const project = edsProject();
        mockUpdateComponent.mockRejectedValueOnce(new Error('download 404\nat stack'));

        const res = await applyUpdatesHeadless(
            {
                ...emptySelections(),
                component: [item(project, 'mesh'), item(project, 'eds-storefront')],
            },
            ctx
        );

        expect(res.component).toEqual({
            successCount: 1,
            failCount: 1,
            errors: ['mesh in demo: download 404'],
        });
        expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    });
});

describe('Adobe MCP', () => {
    const PKG = '@adobe-commerce/commerce-extensibility-tools';

    it('delegates each item to the shared core with the context, reporting progress', async () => {
        const ctx = makeCtx();
        const project = edsProject();
        const onProgress = jest.fn();

        const res = await applyUpdatesHeadless(
            {
                ...emptySelections(),
                adobeMcp: [{ project, packageName: PKG, latestVersion: '2.0.0' }],
            },
            ctx,
            onProgress
        );

        expect(mockApplyAdobeMcpUpdate).toHaveBeenCalledWith(project, PKG, '2.0.0', ctx);
        expect(onProgress).toHaveBeenCalledWith(`Updating ${PKG} → 2.0.0 in demo...`);
        expect(res.adobeMcp).toEqual({ successCount: 1, failCount: 0, errors: [] });
    });

    it('a failed item is recorded by project name', async () => {
        const ctx = makeCtx();
        mockApplyAdobeMcpUpdate.mockRejectedValue(new Error('npm update failed\nat stack'));

        const res = await applyUpdatesHeadless(
            {
                ...emptySelections(),
                adobeMcp: [{ project: edsProject(), packageName: PKG, latestVersion: '2.0.0' }],
            },
            ctx
        );

        expect(res.adobeMcp).toEqual({
            successCount: 0,
            failCount: 1,
            errors: ['demo: npm update failed'],
        });
        expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    });
});

describe('add-ons', () => {
    const lib = () => ({
        project: edsProject(),
        library: installedLibrary('Lib A'),
        latestCommit: 'bbb',
    });

    it.each([
        ['enabled', 'enabled', { successCount: 1, failCount: 0, errors: [] }],
        ['disabled', 'disabled', { successCount: 1, failCount: 0, errors: [] }],
        ['ask', 'disabled', { successCount: 0, failCount: 0, errors: [], deferred: ['Lib A'] }],
    ] as const)('syncBehavior %s applies as %s', async (setting, resolved, expected) => {
        setSyncBehavior(setting);
        const ctx = makeCtx();
        const onProgress = jest.fn();
        const item = lib();

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), blockLibrary: [item] },
            ctx,
            onProgress
        );

        expect(mockApplyBlockLibraryUpdateResolved).toHaveBeenCalledWith(item, resolved, ctx);
        expect(onProgress).toHaveBeenCalledWith('Updating block library Lib A...');
        expect(res.addon).toEqual(expected);
    });

    it('a failed block library is recorded by name', async () => {
        const ctx = makeCtx();
        mockApplyBlockLibraryUpdateResolved.mockRejectedValue(new Error('upstream 404\nat stack'));

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), blockLibrary: [lib()] },
            ctx
        );

        expect(res.addon).toEqual({
            successCount: 0,
            failCount: 1,
            errors: ['Lib A: upstream 404'],
        });
        expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    });

    it('moves the Inspector SDK commit through the rollback-guarded helper, saving the project', async () => {
        const ctx = makeCtx();
        const project = edsProject();
        const onProgress = jest.fn();
        mockUpdateCommitShaWithRollback.mockImplementation(
            async (_t: unknown, _s: string, save: () => Promise<void>) => save()
        );

        const res = await applyUpdatesHeadless(
            { ...emptySelections(), inspector: [{ project, latestCommit: 'newsha' }] },
            ctx,
            onProgress
        );

        expect(mockUpdateCommitShaWithRollback).toHaveBeenCalledWith(
            project.installedInspectorSdk,
            'newsha',
            expect.any(Function)
        );
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(onProgress).toHaveBeenCalledWith('Updating Inspector SDK in demo...');
        expect(res.addon.successCount).toBe(1);
    });

    it('a failed Inspector SDK update is recorded by project', async () => {
        const ctx = makeCtx();
        mockUpdateCommitShaWithRollback.mockRejectedValue(new Error('disk full'));

        const res = await applyUpdatesHeadless(
            {
                ...emptySelections(),
                inspector: [{ project: edsProject(), latestCommit: 'newsha' }],
            },
            ctx
        );

        expect(res.addon).toEqual({
            successCount: 0,
            failCount: 1,
            errors: ['Inspector SDK in demo: disk full'],
        });
        expect(ctx.logger.error).toHaveBeenCalledTimes(1);
    });
});

describe('totals', () => {
    it('sums successes and failures across every category', async () => {
        mockSyncFork.mockResolvedValue({ success: false, message: 'x' });
        mockUpdateCommitShaWithRollback.mockRejectedValue(new Error('y'));
        const project = edsProject();

        const res = await applyUpdatesHeadless(
            {
                forkSync: [fork],
                template: [{ project }],
                component: [{ project, componentId: 'mesh', latestVersion: '2', downloadUrl: 'u' }],
                adobeMcp: [{ project, packageName: 'p', latestVersion: '1' }],
                blockLibrary: [
                    { project, library: installedLibrary('Lib A'), latestCommit: 'bbb' },
                ],
                inspector: [{ project, latestCommit: 'z' }],
            },
            makeCtx()
        );

        expect(res.totalApplied).toBe(4);
        expect(res.totalFailed).toBe(2);
    });
});
