/**
 * updateExecutor.performTemplateUpdates — the running-demo guard, the per-project
 * sync, and the summary.
 *
 * The guard (`ensureProjectStopped`) is private and shared by every executor;
 * it is driven here through the template path because that path also returns
 * the set of paths that synced, which makes "was this project skipped" a value
 * rather than an absence.
 */

import { captureProgress, makeUpdateContext } from './updateExecutor.testUtils';
import * as vscode from 'vscode';
import { sleep } from '@/core/utils/sleep';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { performTemplateUpdates } from '@/features/updates/commands/updateExecutor';
import type { TemplateUpdateItem } from '@/features/updates/commands/updateTypes';
import type { TemplateSyncResult } from '@/features/updates/services/templateSyncService';
import { TemplateSyncService } from '@/features/updates/services/templateSyncService';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/updates/services/templateSyncService');
jest.mock('@/core/utils/sleep');

const ServiceMock = TemplateSyncService as jest.MockedClass<typeof TemplateSyncService>;
const sleepMock = sleep as jest.Mock;
const showWarningMock = vscode.window.showWarningMessage as jest.Mock;
const showInfoMock = vscode.window.showInformationMessage as jest.Mock;
const showErrorMock = vscode.window.showErrorMessage as jest.Mock;
const withProgressMock = vscode.window.withProgress as jest.Mock;
const executeCommandMock = vscode.commands.executeCommand as jest.Mock;

const STOP_AND_SYNC = 'Stop & Sync';

function makeItem(project: Project): TemplateUpdateItem {
    return {
        project,
        templateUpdate: {
            hasUpdates: true,
            currentCommit: 'aaa111',
            latestCommit: 'bbb222',
            commitsBehind: 3,
            templateOwner: 'adobe',
            templateRepo: 'aem-boilerplate-commerce',
        },
        isTemplateUpdate: true,
        label: project.name,
    };
}

function synced(overrides: Partial<TemplateSyncResult> = {}): TemplateSyncResult {
    return { success: true, strategy: 'merge', syncedCommit: 'bbb222', ...overrides };
}

describe('performTemplateUpdates', () => {
    let syncWithTemplate: jest.Mock;
    let updateLastSyncedCommit: jest.Mock;
    let report: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        syncWithTemplate = jest.fn().mockResolvedValue(synced());
        updateLastSyncedCommit = jest.fn().mockResolvedValue(undefined);
        ServiceMock.prototype.syncWithTemplate = syncWithTemplate;
        ServiceMock.prototype.updateLastSyncedCommit = updateLastSyncedCommit;
        report = captureProgress();
    });

    describe('running-demo guard', () => {
        it('does not prompt for a project that is not running', async () => {
            const ctx = makeUpdateContext();
            const project = createMockProject({ status: 'ready' });

            const result = await performTemplateUpdates([makeItem(project)], ctx);

            expect(showWarningMock).not.toHaveBeenCalled();
            expect(result).toEqual(new Set([project.path]));
        });

        it('prompts with Stop & Sync / Skip for a running project', async () => {
            const ctx = makeUpdateContext();
            const project = createMockProject({ name: 'live', status: 'running' });
            showWarningMock.mockResolvedValue(undefined);

            await performTemplateUpdates([makeItem(project)], ctx);

            expect(showWarningMock).toHaveBeenCalledWith(
                '"live" is currently running. Stop it before updating?',
                STOP_AND_SYNC,
                'Skip',
            );
        });

        it.each([
            ['dismissed', undefined],
            ['Skip', 'Skip'],
        ])('%s: skips the project — no sync, no progress bar, empty result', async (_label, choice) => {
            const ctx = makeUpdateContext();
            const project = createMockProject({ status: 'running' });
            showWarningMock.mockResolvedValue(choice);

            const result = await performTemplateUpdates([makeItem(project)], ctx);

            expect(syncWithTemplate).not.toHaveBeenCalled();
            expect(withProgressMock).not.toHaveBeenCalled();
            expect(executeCommandMock).not.toHaveBeenCalled();
            expect(result.size).toBe(0);
        });

        it('Stop & Sync on the CURRENT project: stops the demo, waits, then syncs', async () => {
            const project = createMockProject({ path: '/p/live', status: 'running' });
            const ctx = makeUpdateContext({
                getCurrentProject: jest.fn().mockResolvedValue(project),
            });
            showWarningMock.mockResolvedValue(STOP_AND_SYNC);

            const result = await performTemplateUpdates([makeItem(project)], ctx);

            expect(executeCommandMock).toHaveBeenCalledWith('demoBuilder.stopDemo');
            expect(sleepMock).toHaveBeenCalledWith(TIMEOUTS.DEMO_STOP_WAIT);
            expect(syncWithTemplate).toHaveBeenCalledTimes(1);
            expect(result).toEqual(new Set(['/p/live']));
        });

        it('Stop & Sync on a project that is NOT current: syncs without stopping anything', async () => {
            const project = createMockProject({ path: '/p/other', status: 'running' });
            const ctx = makeUpdateContext({
                getCurrentProject: jest
                    .fn()
                    .mockResolvedValue(createMockProject({ path: '/p/current' })),
            });
            showWarningMock.mockResolvedValue(STOP_AND_SYNC);

            await performTemplateUpdates([makeItem(project)], ctx);

            expect(executeCommandMock).not.toHaveBeenCalled();
            expect(sleepMock).not.toHaveBeenCalled();
            expect(syncWithTemplate).toHaveBeenCalledTimes(1);
        });

        it('Stop & Sync with no current project at all: syncs without stopping', async () => {
            const project = createMockProject({ status: 'running' });
            const ctx = makeUpdateContext({ getCurrentProject: jest.fn().mockResolvedValue(null) });
            showWarningMock.mockResolvedValue(STOP_AND_SYNC);

            await expect(performTemplateUpdates([makeItem(project)], ctx)).resolves.toEqual(
                new Set([project.path]),
            );
            expect(executeCommandMock).not.toHaveBeenCalled();
        });

        it('drops only the skipped project and syncs the rest', async () => {
            const ctx = makeUpdateContext();
            const running = createMockProject({ name: 'a', path: '/p/a', status: 'running' });
            const idle = createMockProject({ name: 'b', path: '/p/b', status: 'ready' });
            showWarningMock.mockResolvedValue('Skip');

            const result = await performTemplateUpdates([makeItem(running), makeItem(idle)], ctx);

            expect(syncWithTemplate).toHaveBeenCalledTimes(1);
            expect(syncWithTemplate).toHaveBeenCalledWith(idle, { strategy: 'merge' });
            expect(report).toHaveBeenCalledWith({ message: 'b…', increment: 100 });
            expect(result).toEqual(new Set(['/p/b']));
        });
    });

    describe('syncing', () => {
        it('builds the service from the context and syncs each project with the merge strategy', async () => {
            const ctx = makeUpdateContext();
            const project = createMockProject();

            await performTemplateUpdates([makeItem(project)], ctx);

            expect(ServiceMock).toHaveBeenCalledWith(ctx.secrets, ctx.logger, ctx.commandManager);
            expect(syncWithTemplate).toHaveBeenCalledWith(project, { strategy: 'merge' });
        });

        it('shows a non-cancellable notification titled Syncing Templates', async () => {
            const ctx = makeUpdateContext();

            await performTemplateUpdates([makeItem(createMockProject())], ctx);

            expect(withProgressMock).toHaveBeenCalledWith(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Syncing Templates',
                    cancellable: false,
                },
                expect.any(Function),
            );
        });

        it('reports each project by name with an even share of the bar', async () => {
            const ctx = makeUpdateContext();
            const a = createMockProject({ name: 'a', path: '/p/a' });
            const b = createMockProject({ name: 'b', path: '/p/b' });

            await performTemplateUpdates([makeItem(a), makeItem(b)], ctx);

            expect(report).toHaveBeenNthCalledWith(1, { message: 'a…', increment: 50 });
            expect(report).toHaveBeenNthCalledWith(2, { message: 'b…', increment: 50 });
        });

        it('on success records the synced commit through the state manager', async () => {
            const ctx = makeUpdateContext();
            const project = createMockProject();
            syncWithTemplate.mockResolvedValue(synced({ syncedCommit: 'ccc333' }));

            await performTemplateUpdates([makeItem(project)], ctx);

            expect(updateLastSyncedCommit).toHaveBeenCalledWith(project, 'ccc333', ctx.stateManager);
        });

        it('on success shows the plain success summary', async () => {
            const ctx = makeUpdateContext();

            await performTemplateUpdates([makeItem(createMockProject())], ctx);

            expect(showInfoMock).toHaveBeenCalledWith('Successfully synced 1 template(s).');
            expect(showErrorMock).not.toHaveBeenCalled();
        });

        it('warns about conflicts only when the merge fell back to reset AND conflicts were listed', async () => {
            const ctx = makeUpdateContext();
            const project = createMockProject({ name: 'demo' });
            syncWithTemplate.mockResolvedValue(
                synced({ strategy: 'reset', fallbackOccurred: true, conflicts: ['a.js', 'b.js'] }),
            );

            await performTemplateUpdates([makeItem(project)], ctx);

            expect(showWarningMock).toHaveBeenCalledWith(
                'demo: Merge conflicts in 2 files, fell back to reset.',
            );
        });

        it.each([
            ['fallback without a conflict list', { fallbackOccurred: true }],
            ['a conflict list without fallback', { fallbackOccurred: false, conflicts: ['a.js'] }],
        ])('does not warn on %s', async (_label, partial) => {
            const ctx = makeUpdateContext();
            syncWithTemplate.mockResolvedValue(synced(partial));

            await performTemplateUpdates([makeItem(createMockProject())], ctx);

            expect(showWarningMock).not.toHaveBeenCalled();
        });
    });

    describe('failures', () => {
        it('a failed result shows its error, records nothing, and returns no path', async () => {
            const ctx = makeUpdateContext();
            const project = createMockProject({ name: 'demo' });
            syncWithTemplate.mockResolvedValue(
                synced({ success: false, error: 'merge aborted' }),
            );

            const result = await performTemplateUpdates([makeItem(project)], ctx);

            expect(showErrorMock).toHaveBeenCalledWith(
                'Failed to sync template for demo: merge aborted',
            );
            expect(updateLastSyncedCommit).not.toHaveBeenCalled();
            expect(showInfoMock).not.toHaveBeenCalled();
            expect(result.size).toBe(0);
        });

        it('a failed result with no error text reads Unknown error', async () => {
            const ctx = makeUpdateContext();
            syncWithTemplate.mockResolvedValue(synced({ success: false }));

            await performTemplateUpdates([makeItem(createMockProject({ name: 'demo' }))], ctx);

            expect(showErrorMock).toHaveBeenCalledWith(
                'Failed to sync template for demo: Unknown error',
            );
        });

        it('a thrown error is shown sanitized to its first line', async () => {
            const ctx = makeUpdateContext();
            syncWithTemplate.mockRejectedValue(new Error('git exploded\n    at stack'));

            await performTemplateUpdates([makeItem(createMockProject({ name: 'demo' }))], ctx);

            expect(showErrorMock).toHaveBeenCalledWith(
                'Failed to sync template for demo: git exploded',
            );
            expect(ctx.logger.error).toHaveBeenCalledTimes(1);
        });

        it('a mix of outcomes shows the counted summary and returns only the successes', async () => {
            const ctx = makeUpdateContext();
            const good = createMockProject({ name: 'good', path: '/p/good' });
            const bad = createMockProject({ name: 'bad', path: '/p/bad' });
            syncWithTemplate
                .mockResolvedValueOnce(synced())
                .mockResolvedValueOnce(synced({ success: false, error: 'nope' }));

            const result = await performTemplateUpdates([makeItem(good), makeItem(bad)], ctx);

            expect(showInfoMock).toHaveBeenCalledWith('Synced 1 template(s), 1 failed.');
            expect(result).toEqual(new Set(['/p/good']));
        });
    });
});
