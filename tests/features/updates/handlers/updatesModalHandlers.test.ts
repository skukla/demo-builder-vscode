/**
 * updatesModalHandlers — the Updates modal's state and its apply (PL-80).
 *
 * Check for Updates hands its check over (`presentUpdates`), which keeps it and answers
 * the rows; `applyUpdates` applies the ticked ids against that check through the shared
 * headless apply, telling the screen each row's status as it starts and ends. The
 * progress plumbing is the real one: what the screen is told is the subject. The apply
 * and the extension's installer are faked.
 */

import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import type { FoundUpdates } from '@/features/updates/services/allUpdates';
import { emptyResult, type ApplyUpdatesResult } from '@/features/updates/services/updateApplyResult';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { MessageHandler } from '@/types/handlers';
import type { ApplyUpdatesRequest, PendingUpdateRow } from '@/types/pendingUpdates';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const mockApplyUpdatesHeadless = jest.fn();
const mockUpdateExtension = jest.fn();
jest.mock('@/features/updates/services/updateApplyService', () => ({
    applyUpdatesHeadless: (...args: unknown[]) => mockApplyUpdatesHeadless(...args),
}));
jest.mock('@/features/updates/services/extensionUpdater', () => ({
    ExtensionUpdater: jest.fn().mockImplementation(() => ({ updateExtension: mockUpdateExtension })),
}));
jest.mock('@/features/dashboard/handlers/integrationUpdateHandlers', () => ({
    updateIntegrationPairFor: jest.fn(),
}));
jest.mock('@/core/di/serviceLocator', () => ({ ServiceLocator: { getCommandExecutor: jest.fn(() => ({})) } }));
// The handler loads in its own module sandbox (handlers() below), with its own vscode; the
// Chat command it runs is recorded here, outside the sandbox.
const mockExecuteCommand = jest.fn();
jest.mock('vscode', () => {
    const actual = jest.requireActual('vscode');
    return { ...actual, commands: { ...actual.commands, executeCommand: (...args: unknown[]) => mockExecuteCommand(...args) } };
});
// Opening the AI reads the local copies; that is fixWithAi.test's (real git).
const mockOpenFixWithAi = jest.fn();
jest.mock('@/features/updates/services/fixWithAi', () => ({
    openFixWithAi: (...args: unknown[]) => mockOpenFixWithAi(...args),
}));

const bodea = createMockProject({ name: 'bodea', title: 'Bodea', path: '/p/bodea', status: 'stopped' });
const justrite = createMockProject({ name: 'justrite', title: 'JustRite', path: '/p/justrite', status: 'stopped' });

function selections(): UpdateSelections {
    return {
        forkSync: [],
        template: [{ project: bodea }],
        boilerplate: [],
        finish: [],
        component: [],
        adobeMcp: [],
        blockLibrary: [justrite, bodea].map((project) => ({
            project,
            library: {
                name: 'Demo Builder Blocks',
                source: { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' },
                commitSha: 'a',
                blockIds: [],
                installedAt: '',
            },
            latestCommit: 'b',
        })),
        blockLibraryInstall: [],
        inspector: [],
        integration: [],
    };
}

function found(overrides: Partial<FoundUpdates> = {}): FoundUpdates {
    return { selections: selections(), currentProjectPath: '/p/justrite', count: 3, ...overrides };
}

function applied(overrides: Partial<ApplyUpdatesResult> = {}): ApplyUpdatesResult {
    return {
        forkSync: emptyResult(),
        template: emptyResult(),
        boilerplate: emptyResult(),
        finish: emptyResult(),
        component: emptyResult(),
        adobeMcp: emptyResult(),
        addon: emptyResult(),
        blockLibraryInstall: emptyResult(),
        integration: emptyResult(),
        totalApplied: 1,
        totalFailed: 0,
        ...overrides,
    };
}

type Handlers = typeof import('@/features/updates/handlers/updatesModalHandlers');

/** A fresh module per test: the presented check is module state. */
function handlers(): Handlers {
    let loaded!: Handlers;
    jest.isolateModules(() => {
        loaded = jest.requireActual('@/features/updates/handlers/updatesModalHandlers');
    });
    return loaded;
}

const modal = (ids: string[]): ApplyUpdatesRequest => ({ ids, progress: 'modal' });

/** The row statuses the screen was told, in order. */
function statusesSent(ctx: ReturnType<typeof createMockHandlerContext>): unknown[] {
    return ctx.sendMessage.mock.calls.filter(([type]) => type === 'updateRowStatus').map(([, status]) => status);
}
const apply = (h: Handlers): MessageHandler<ApplyUpdatesRequest> => h.handleApplyUpdates;

beforeEach(() => {
    jest.clearAllMocks();
    mockApplyUpdatesHeadless.mockResolvedValue(applied());
});

describe('presentUpdates', () => {
    it('answers the rows for the check, the open project first, and keeps them', () => {
        const h = handlers();

        const rows = h.presentUpdates(found());

        expect(rows.map((r) => [r.group.title, r.label])).toEqual([
            ['JustRite', 'Demo Builder Blocks'],
            ['Bodea', 'EDS template'],
            ['Bodea', 'Demo Builder Blocks'],
        ]);
        expect(h.presentedRows()).toEqual(rows);
    });

    it('lists the extension update first when there is one', () => {
        const rows = handlers().presentUpdates(found({ extension: { hasUpdate: true, current: '1.0.0', latest: '1.1.0' } }));

        expect(rows[0]).toMatchObject({ kind: 'extension', detail: '1.0.0 → 1.1.0' });
    });

    it('presents nothing before any check', () => {
        expect(handlers().presentedRows()).toStrictEqual([]);
    });
});

describe('applyUpdates', () => {
    async function presentedThenApply(pick: (rows: PendingUpdateRow[]) => string[], check = found()) {
        const h = handlers();
        const ctx = createMockHandlerContext();
        const rows = h.presentUpdates(check);
        const answer = await apply(h)(ctx, modal(pick(rows)));
        return { answer, ctx, h };
    }

    it('applies exactly the ticked rows through the shared apply, with the questions asked in the modal', async () => {
        const { answer } = await presentedThenApply((rows) =>
            rows.filter((r) => r.group.key === '/p/bodea').map((r) => r.id),
        );

        const [sel, , , options] = mockApplyUpdatesHeadless.mock.calls[0];
        expect(sel.template.map((t: { project: { path: string } }) => t.project.path)).toEqual(['/p/bodea']);
        expect(sel.blockLibrary.map((b: { project: { path: string } }) => b.project.path)).toEqual(['/p/bodea']);
        expect(options.questions).toEqual(
            expect.objectContaining({
                onClash: expect.any(Function),
                replaceLibraryBlocks: expect.any(Function),
            }),
        );
        expect(options.onItem).toEqual(expect.any(Function));
        expect(answer).toEqual({ success: true });
    });

    // The apply reports selection entries; the screen knows rows. An entry keeps the id
    // of its place in the check the SC saw, whatever else was left unticked.
    it("tells the screen each row's status by the id the SC saw, with its note or its reason", async () => {
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            const [library] = sel.blockLibrary;
            options.onItem('blockLibrary', library, { state: 'running' });
            options.onItem('blockLibrary', library, { state: 'done', note: 'One block left out.' });
            return applied();
        });

        const { ctx } = await presentedThenApply((rows) =>
            rows.filter((r) => r.group.key === '/p/bodea' && r.kind === 'blockLibrary').map((r) => r.id),
        );

        expect(statusesSent(ctx)).toEqual([
            { id: 'blockLibrary:1', state: 'running' },
            { id: 'blockLibrary:1', state: 'done', message: 'One block left out.' },
        ]);
    });

    it('opens the SC\'s AI on the projects whose clash was kept, through the Chat command', async () => {
        mockApplyUpdatesHeadless.mockResolvedValue(
            applied({
                template: {
                    ...emptyResult(),
                    failCount: 1,
                    clashes: [{ project: 'Bodea', projectName: 'bodea', track: 'template', files: ['head.html'], keptIn: '/p/bodea/components/eds-storefront' }],
                },
            }),
        );

        await presentedThenApply((rows) => rows.map((r) => r.id));

        const [projects, , open] = mockOpenFixWithAi.mock.calls[0];
        expect(projects).toEqual([bodea]);
        await open({ prompt: 'fix it', fresh: true, attachFiles: ['/p/bodea/components/eds-storefront/head.html'] });
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.openInClaude', {
            prompt: 'fix it',
            fresh: true,
            attachFiles: ['/p/bodea/components/eds-storefront/head.html'],
        });
    });

    it('hands the AI no project whose clash was only reported, not kept', async () => {
        mockApplyUpdatesHeadless.mockResolvedValue(
            applied({
                template: {
                    ...emptyResult(),
                    failCount: 1,
                    clashes: [{ project: 'Bodea', projectName: 'bodea', track: 'template', files: ['head.html'] }],
                },
            }),
        );

        await presentedThenApply((rows) => rows.map((r) => r.id));

        expect(mockOpenFixWithAi.mock.calls[0][0]).toStrictEqual([]);
    });

    it('tells the progress modal the run, and that it ended', async () => {
        const { ctx } = await presentedThenApply((rows) => [rows[0].id]);

        const states = ctx.sendMessage.mock.calls
            .filter(([type]) => type === 'operationProgress')
            .map(([, payload]) => (payload as { id: string; state: string }).state);
        expect(ctx.sendMessage).toHaveBeenCalledWith(
            'operationProgress',
            expect.objectContaining({ id: UPDATES_OPERATION_ID }),
        );
        expect(states[states.length - 1]).toBe('succeeded');
    });

    it('ends the run with one warning sentence when a row did not apply, the row saying why', async () => {
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            options.onItem('template', sel.template[0], { state: 'failed', message: 'bodea: merge conflicts' });
            return applied({ totalApplied: 0 });
        });

        const { answer, ctx } = await presentedThenApply((rows) => rows.map((r) => r.id));

        expect(answer).toEqual({ success: true, warning: '1 update did not apply.' });
        expect(statusesSent(ctx)).toEqual([{ id: 'template:0', state: 'failed', message: 'bodea: merge conflicts' }]);
    });

    it('installs the extension update last, from the release the check found', async () => {
        const check = found({
            extension: {
                hasUpdate: true,
                current: '1.0.0',
                latest: '1.1.0',
                releaseInfo: {
                    version: '1.1.0',
                    downloadUrl: 'https://github.com/x.vsix',
                    releaseNotes: '',
                    publishedAt: '',
                    isPrerelease: false,
                },
            },
        });

        await presentedThenApply((rows) => rows.map((r) => r.id), check);

        expect(mockUpdateExtension).toHaveBeenCalledWith('https://github.com/x.vsix', '1.1.0');
        expect(mockUpdateExtension.mock.invocationCallOrder[0]).toBeGreaterThan(
            mockApplyUpdatesHeadless.mock.invocationCallOrder[0],
        );
    });

    it('says on its row when the extension update fails, and counts it as not applied', async () => {
        mockUpdateExtension.mockRejectedValueOnce(new Error('download failed'));
        const check = found({
            extension: {
                hasUpdate: true,
                current: '1.0.0',
                latest: '1.1.0',
                releaseInfo: { version: '1.1.0', downloadUrl: 'https://github.com/x.vsix', releaseNotes: '', publishedAt: '', isPrerelease: false },
            },
        });

        const { answer, ctx } = await presentedThenApply((rows) => ['extension', rows[1].id], check);

        expect(statusesSent(ctx)).toEqual([
            { id: 'extension', state: 'running' },
            { id: 'extension', state: 'failed', message: 'Not updated. Details are in Debug Logs.' },
        ]);
        expect(answer).toEqual({ success: true, warning: '1 update did not apply.' });
    });

    it('refuses with a plain sentence before any check, and applies a check only once', async () => {
        const h = handlers();
        const ctx = createMockHandlerContext();

        const before = await apply(h)(ctx, modal(['template:0']));
        h.presentUpdates(found());
        await apply(h)(ctx, modal(['template:0']));
        const again = await apply(h)(ctx, modal(['template:0']));

        const outOfDate = { success: false, error: 'This list of updates is out of date. Check for updates again.' };
        expect(before).toEqual(outOfDate);
        expect(again).toEqual(outOfDate);
        expect(mockApplyUpdatesHeadless).toHaveBeenCalledTimes(1);
        expect(h.presentedRows()).toStrictEqual([]);
    });
});
