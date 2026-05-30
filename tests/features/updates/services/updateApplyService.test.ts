/**
 * updateApplyService.applyUpdatesHeadless — the modal-free apply orchestration.
 *
 * Underlying services + the shared addon core are mocked; this asserts the
 * per-category result shaping, failure collection, the headless block-library
 * 'ask' → 'disabled' deferral policy, the template-sync → add-on dedup thread,
 * and the aggregate totals.
 */

import * as vscode from 'vscode';
import { applyUpdatesHeadless, type UpdateSelections } from '@/features/updates/services/updateApplyService';
import { applyBlockLibraryUpdateResolved, updateCommitShaWithRollback } from '@/features/updates/commands/updateExecutor';
import { shouldSkipBlockLibrary } from '@/features/updates/commands/updateTypes';

const syncForkMock = jest.fn();
const syncWithTemplateMock = jest.fn();
const updateLastSyncedCommitMock = jest.fn();
const updateComponentMock = jest.fn();
const executeMock = jest.fn();

jest.mock('vscode', () => ({
    workspace: { getConfiguration: jest.fn() },
}), { virtual: true });

jest.mock('@/features/updates/services/forkSyncService', () => ({
    ForkSyncService: jest.fn(() => ({ syncFork: syncForkMock })),
}));
jest.mock('@/features/updates/services/templateSyncService', () => ({
    TemplateSyncService: jest.fn(() => ({ syncWithTemplate: syncWithTemplateMock, updateLastSyncedCommit: updateLastSyncedCommitMock })),
}));
jest.mock('@/features/updates/services/componentUpdater', () => ({
    ComponentUpdater: jest.fn(() => ({ updateComponent: updateComponentMock })),
}));
jest.mock('@/features/project-creation/services', () => ({ generateAIContextFiles: jest.fn() }));
jest.mock('@/core/di', () => ({ ServiceLocator: { getCommandExecutor: () => ({ execute: executeMock }) } }));
jest.mock('@/features/updates/commands/updateExecutor', () => ({
    applyBlockLibraryUpdateResolved: jest.fn(),
    updateCommitShaWithRollback: jest.fn(),
}));
jest.mock('@/features/updates/commands/updateTypes', () => ({
    getTemplateSource: jest.fn(),
    shouldSkipBlockLibrary: jest.fn(() => false),
}));
// Checkers are imported at module top (used by computeProjectUpdateSelections).
jest.mock('@/features/updates/services/templateUpdateChecker', () => ({ TemplateUpdateChecker: jest.fn() }));
jest.mock('@/features/updates/services/addonUpdateChecker', () => ({ AddonUpdateChecker: jest.fn() }));
jest.mock('@/features/updates/services/adobeMcpUpdateChecker', () => ({ AdobeMcpUpdateChecker: jest.fn() }));
jest.mock('@/features/updates/services/updateManager', () => ({ UpdateManager: jest.fn() }));

const applyBlockResolvedMock = applyBlockLibraryUpdateResolved as jest.Mock;
const updateShaRollbackMock = updateCommitShaWithRollback as jest.Mock;
const shouldSkipMock = shouldSkipBlockLibrary as unknown as jest.Mock;
const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;

function setSyncBehavior(value: 'ask' | 'enabled' | 'disabled'): void {
    getConfigMock.mockReturnValue({ get: jest.fn((_k: string, def: unknown) => value ?? def) });
}

const ctx = {
    secrets: {},
    extensionPath: '/ext',
    stateManager: { saveProject: jest.fn(async () => undefined) },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
} as never;

const project = { name: 'demo', path: '/p/demo', installedInspectorSdk: { commitSha: 'old' } } as never;

function emptySelections(): UpdateSelections {
    return { forkSync: [], template: [], component: [], adobeMcp: [], blockLibrary: [], inspector: [] };
}

describe('applyUpdatesHeadless', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setSyncBehavior('enabled');
        syncForkMock.mockResolvedValue({ success: true });
        syncWithTemplateMock.mockResolvedValue({ success: true, syncedCommit: 'c1', strategy: 'merge' });
        updateComponentMock.mockResolvedValue(undefined);
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        applyBlockResolvedMock.mockResolvedValue(undefined);
        updateShaRollbackMock.mockResolvedValue(undefined);
        shouldSkipMock.mockReturnValue(false);
    });

    it('returns all-zero with no failures when nothing is selected', async () => {
        const res = await applyUpdatesHeadless(emptySelections(), ctx);
        expect(res.totalApplied).toBe(0);
        expect(res.totalFailed).toBe(0);
        expect(syncForkMock).not.toHaveBeenCalled();
    });

    it('counts fork-sync success and records conflicts as failures', async () => {
        syncForkMock
            .mockResolvedValueOnce({ success: true })
            .mockResolvedValueOnce({ success: false, conflict: true });
        const sel = emptySelections();
        sel.forkSync = [
            { owner: 'me', repo: 'a', branch: 'main' },
            { owner: 'me', repo: 'b', branch: 'main' },
        ];
        const res = await applyUpdatesHeadless(sel, ctx);
        expect(res.forkSync.successCount).toBe(1);
        expect(res.forkSync.failCount).toBe(1);
        expect(res.forkSync.errors[0]).toMatch(/me\/b: diverged/);
    });

    it('updates components and saves the project once', async () => {
        const sel = emptySelections();
        sel.component = [{ project, componentId: 'mesh', latestVersion: '2.0.0', downloadUrl: 'http://x/mesh.zip' }];
        const res = await applyUpdatesHeadless(sel, ctx);
        expect(res.component.successCount).toBe(1);
        expect(updateComponentMock).toHaveBeenCalledWith(project, 'mesh', 'http://x/mesh.zip', '2.0.0');
        expect((ctx as never as { stateManager: { saveProject: jest.Mock } }).stateManager.saveProject).toHaveBeenCalledTimes(1);
    });

    it('applies a block library with the resolved behavior when syncBehavior is enabled', async () => {
        setSyncBehavior('enabled');
        const sel = emptySelections();
        sel.blockLibrary = [{ project, library: { name: 'Lib A' } as never, latestCommit: 'bbb' }];
        const res = await applyUpdatesHeadless(sel, ctx);
        expect(applyBlockResolvedMock).toHaveBeenCalledWith(expect.objectContaining({ latestCommit: 'bbb' }), 'enabled', ctx);
        expect(res.addon.successCount).toBe(1);
        expect(res.addon.deferred).toBeUndefined();
    });

    it('defers a block library to disabled (safe) when syncBehavior is ask', async () => {
        setSyncBehavior('ask');
        const sel = emptySelections();
        sel.blockLibrary = [{ project, library: { name: 'Lib A' } as never, latestCommit: 'bbb' }];
        const res = await applyUpdatesHeadless(sel, ctx);
        expect(applyBlockResolvedMock).toHaveBeenCalledWith(expect.anything(), 'disabled', ctx);
        expect(res.addon.successCount).toBe(0);
        expect(res.addon.deferred).toEqual(['Lib A']);
    });

    it('skips a block library covered by a successful template sync (dedup)', async () => {
        shouldSkipMock.mockReturnValue(true);
        const sel = emptySelections();
        sel.template = [{ project }];
        sel.blockLibrary = [{ project, library: { name: 'Lib A' } as never, latestCommit: 'bbb' }];
        const res = await applyUpdatesHeadless(sel, ctx);
        // template succeeded → its path is threaded into the dedup check
        expect(shouldSkipMock).toHaveBeenCalledWith(expect.anything(), project, expect.any(Set));
        expect(applyBlockResolvedMock).not.toHaveBeenCalled();
        expect(res.template.successCount).toBe(1);
    });

    it('updates the inspector SDK via the rollback-guarded helper', async () => {
        const sel = emptySelections();
        sel.inspector = [{ project, latestCommit: 'newsha' }];
        const res = await applyUpdatesHeadless(sel, ctx);
        expect(updateShaRollbackMock).toHaveBeenCalledWith({ commitSha: 'old' }, 'newsha', expect.any(Function));
        expect(res.addon.successCount).toBe(1);
    });

    it('aggregates totals across categories', async () => {
        const sel = emptySelections();
        sel.forkSync = [{ owner: 'me', repo: 'a', branch: 'main' }];
        sel.component = [{ project, componentId: 'mesh', latestVersion: '2', downloadUrl: 'u' }];
        const res = await applyUpdatesHeadless(sel, ctx);
        expect(res.totalApplied).toBe(2);
        expect(res.totalFailed).toBe(0);
    });
});
