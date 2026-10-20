/**
 * updatesModalHandlers — the Updates modal's two messages on the projects list (PL-80).
 *
 * `checkUpdates` answers rows and keeps the check; `applyUpdates` applies the ticked ids
 * against that check through the shared headless apply, in the progress modal, and
 * answers the report. The progress plumbing is the real one: what the screen is told is
 * the subject. The check, the apply and the extension's installer are faked.
 */

import { UPDATES_OPERATION_ID } from '@/core/utils/operationIds';
import type { FoundUpdates } from '@/features/updates/services/allUpdates';
import { emptyResult, type ApplyUpdatesResult } from '@/features/updates/services/updateApplyResult';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { MessageHandler } from '@/types/handlers';
import type { ApplyUpdatesRequest, PendingUpdateRow } from '@/types/pendingUpdates';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';

const mockFindAllUpdates = jest.fn();
const mockApplyUpdatesHeadless = jest.fn();
const mockUpdateExtension = jest.fn();
jest.mock('@/features/updates/services/allUpdates', () => ({
    findAllUpdates: (...args: unknown[]) => mockFindAllUpdates(...args),
}));
jest.mock('@/features/updates/services/updateApplyService', () => ({
    applyUpdatesHeadless: (...args: unknown[]) => mockApplyUpdatesHeadless(...args),
}));
jest.mock('@/features/updates/services/extensionUpdater', () => ({
    ExtensionUpdater: jest.fn().mockImplementation(() => ({ updateExtension: mockUpdateExtension })),
}));
jest.mock('@/features/dashboard/handlers/integrationUpdateHandlers', () => ({
    integrationUpdateProbe: jest.fn(() => ({ check: jest.fn(), inOtherOrg: jest.fn() })),
    updateIntegrationPairFor: jest.fn(),
}));
jest.mock('@/core/di/serviceLocator', () => ({ ServiceLocator: { getCommandExecutor: jest.fn(() => ({})) } }));

const bodea = createMockProject({ name: 'bodea', title: 'Bodea', path: '/p/bodea', status: 'stopped' });
const justrite = createMockProject({ name: 'justrite', title: 'JustRite', path: '/p/justrite', status: 'stopped' });

function selections(): UpdateSelections {
    return {
        forkSync: [],
        template: [{ project: bodea, commitsBehind: 2 }],
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
            commitsBehind: 1,
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
    const cats = ['forkSync', 'template', 'component', 'adobeMcp', 'addon', 'blockLibraryInstall', 'integration'];
    return {
        ...(Object.fromEntries(cats.map((c) => [c, emptyResult()])) as unknown as ApplyUpdatesResult),
        totalApplied: 1,
        totalFailed: 0,
        ...overrides,
    };
}

/** A fresh module per test: the kept check is module state. */
function handlers(): { check: MessageHandler; apply: MessageHandler<ApplyUpdatesRequest> } {
    let loaded!: typeof import('@/features/updates/handlers/updatesModalHandlers');
    jest.isolateModules(() => {
        loaded = jest.requireActual('@/features/updates/handlers/updatesModalHandlers');
    });
    return { check: loaded.handleCheckUpdates, apply: loaded.handleApplyUpdates };
}

const modal = (ids: string[]): ApplyUpdatesRequest => ({ ids, progress: 'modal' });

beforeEach(() => {
    jest.clearAllMocks();
    mockFindAllUpdates.mockResolvedValue(found());
    mockApplyUpdatesHeadless.mockResolvedValue(applied());
});

describe('checkUpdates', () => {
    it('answers the rows for everything waiting, the open project first', async () => {
        const { check } = handlers();

        const answer = await check(createMockHandlerContext());

        const rows = (answer.data as { rows: PendingUpdateRow[] }).rows;
        expect(answer.success).toBe(true);
        expect(rows.map((r) => [r.group.title, r.label])).toEqual([
            ['JustRite', 'Demo Builder Blocks'],
            ['Bodea', 'EDS template'],
            ['Bodea', 'Demo Builder Blocks'],
        ]);
    });

    it('lists the extension update first when there is one', async () => {
        mockFindAllUpdates.mockResolvedValue(found({ extension: { hasUpdate: true, current: '1.0.0', latest: '1.1.0' } }));

        const answer = await handlers().check(createMockHandlerContext());

        expect((answer.data as { rows: PendingUpdateRow[] }).rows[0]).toMatchObject({
            kind: 'extension',
            detail: '1.0.0 → 1.1.0',
        });
    });

    it('answers a plain sentence when the check fails, and logs the reason', async () => {
        mockFindAllUpdates.mockRejectedValue(new Error('rate limited'));
        const ctx = createMockHandlerContext();

        const answer = await handlers().check(ctx);

        expect(answer).toEqual({ success: false, error: "Couldn't check for updates. Details are in Debug Logs." });
        expect(ctx.logger.error).toHaveBeenCalled();
    });
});

describe('applyUpdates', () => {
    async function checkedThenApply(ids: (rows: PendingUpdateRow[]) => string[]) {
        const h = handlers();
        const ctx = createMockHandlerContext();
        const rows = ((await h.check(ctx)).data as { rows: PendingUpdateRow[] }).rows;
        const answer = await h.apply(ctx, modal(ids(rows)));
        return { answer, ctx, h };
    }

    it('applies exactly the ticked rows through the shared apply, with the questions asked in the modal', async () => {
        const { answer } = await checkedThenApply((rows) => rows.filter((r) => r.group.key === '/p/bodea').map((r) => r.id));

        const [sel, , , options] = mockApplyUpdatesHeadless.mock.calls[0];
        expect(sel.template.map((t: { project: { path: string } }) => t.project.path)).toEqual(['/p/bodea']);
        expect(sel.blockLibrary.map((b: { project: { path: string } }) => b.project.path)).toEqual(['/p/bodea']);
        expect(options.questions).toEqual(
            expect.objectContaining({ resetTemplateOnConflict: expect.any(Function), replaceLibraryBlocks: expect.any(Function) }),
        );
        expect(answer).toEqual({ success: true, data: { applied: 1, problems: [], notes: [] } });
    });

    it('tells the progress modal the run, and that it ended', async () => {
        const { ctx } = await checkedThenApply((rows) => [rows[0].id]);

        const states = ctx.sendMessage.mock.calls
            .filter(([type]) => type === 'operationProgress')
            .map(([, payload]) => (payload as { id: string; state: string }).state);
        expect(ctx.sendMessage).toHaveBeenCalledWith(
            'operationProgress',
            expect.objectContaining({ id: UPDATES_OPERATION_ID }),
        );
        expect(states[states.length - 1]).toBe('succeeded');
    });

    it('answers what did not apply, and ends the run with one warning sentence saying so', async () => {
        mockApplyUpdatesHeadless.mockResolvedValue(
            applied({ template: { ...emptyResult(), failCount: 1, errors: ['bodea: merge conflicts'] }, totalApplied: 0 }),
        );

        const { answer } = await checkedThenApply((rows) => rows.map((r) => r.id));

        expect(answer).toEqual({
            success: true,
            warning: '1 update did not apply. The Updates list says why.',
            data: { applied: 0, problems: ['bodea: merge conflicts'], notes: [] },
        });
    });

    it('installs the extension update last, from the release the check found', async () => {
        mockFindAllUpdates.mockResolvedValue(
            found({
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
            }),
        );

        await checkedThenApply((rows) => rows.map((r) => r.id));

        expect(mockUpdateExtension).toHaveBeenCalledWith('https://github.com/x.vsix', '1.1.0');
        expect(mockUpdateExtension.mock.invocationCallOrder[0]).toBeGreaterThan(
            mockApplyUpdatesHeadless.mock.invocationCallOrder[0],
        );
    });

    it('refuses with a plain sentence before any check, and applies a check only once', async () => {
        const h = handlers();
        const ctx = createMockHandlerContext();

        const before = await h.apply(ctx, modal(['template:0']));
        await h.check(ctx);
        await h.apply(ctx, modal(['template:0']));
        const again = await h.apply(ctx, modal(['template:0']));

        const outOfDate = { success: false, error: 'This list of updates is out of date. Check for updates again.' };
        expect(before).toEqual(outOfDate);
        expect(again).toEqual(outOfDate);
        expect(mockApplyUpdatesHeadless).toHaveBeenCalledTimes(1);
    });
});
