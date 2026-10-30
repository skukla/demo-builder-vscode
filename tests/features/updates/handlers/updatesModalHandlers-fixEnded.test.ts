/**
 * updatesModalHandlers — a run whose clash was kept for the SC's AI leaves its row where
 * the AI's ending can reach it (EDS-56, 2026-10-30): when the AI finishes or drops the fix,
 * the window still showing that run flips the row it said "working on it" under. A new
 * list or a new run forgets it, since its ids then name other rows.
 */

// FIRST: this module owns the jest.mock calls the handler must see.
import {
    apply,
    applied,
    found,
    justrite,
    mockApplyUpdatesHeadless,
    modal,
    resetModalMocks,
    selections,
    statusesSent,
    type Handlers,
} from './updatesModalHandlers.testUtils';
import type { BoilerplateBase } from '@/features/updates/services/boilerplateBase';
import { emptyResult } from '@/features/updates/services/updateApplyResult';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { PendingUpdateRow } from '@/types/pendingUpdates';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

type Notice = typeof import('@/features/updates/handlers/fixEndedNotice');

/** The handler and the notice from one module sandbox, so they share the remembered rows. */
function loaded(): { h: Handlers; notice: Notice } {
    let h!: Handlers;
    let notice!: Notice;
    jest.isolateModules(() => {
        h = jest.requireActual('@/features/updates/handlers/updatesModalHandlers');
        notice = jest.requireActual('@/features/updates/handlers/fixEndedNotice');
    });
    return { h, notice };
}

const BASE: BoilerplateBase = {
    template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
    commit: 'a'.repeat(40),
    lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
    found: 'first-commit',
};

/** JustRite's Adobe boilerplate update, its clash kept for the SC's AI. */
function boilerplateCheck(): ReturnType<typeof found> {
    const sel: UpdateSelections = {
        ...selections(),
        template: [],
        blockLibrary: [],
        boilerplate: [{ project: justrite, base: BASE, tested: 'b'.repeat(40) }],
    };
    return found({ selections: sel, count: 1 });
}

const KEPT = applied({
    boilerplate: {
        ...emptyResult(),
        failCount: 1,
        clashes: [{ project: 'JustRite', projectName: 'justrite', track: 'boilerplate', files: ['blocks/header/header.js'], keptIn: '/p/justrite/components/eds-storefront' }],
    },
});

async function runKept() {
    const { h, notice } = loaded();
    const ctx = createMockHandlerContext();
    const rows: PendingUpdateRow[] = h.presentUpdates(boilerplateCheck());
    mockApplyUpdatesHeadless.mockResolvedValue(KEPT);
    await apply(h)(ctx, modal(rows.map((r) => r.id)));
    ctx.sendMessage.mockClear();
    return { h, notice, ctx, rowId: rows[0].id };
}

beforeEach(resetModalMocks);

describe('applyUpdates: a clash kept for the SC\'s AI', () => {
    it('flips the row the run left "working on it" when the AI finishes, by the id the screen knows', async () => {
        const { notice, ctx, rowId } = await runKept();

        notice.tellFixEnded(justrite, 'boilerplate', 'finished', true);

        expect(statusesSent(ctx)).toEqual([
            { id: rowId, state: 'done', message: 'Updated by your AI.' },
            { id: 'localCopy:/p/justrite', state: 'done' },
        ]);
    });

    it('forgets the row once another list is shown', async () => {
        const { h, notice, ctx } = await runKept();

        h.presentUpdates(found());
        notice.tellFixEnded(justrite, 'boilerplate', 'finished', true);

        expect(statusesSent(ctx)).toStrictEqual([]);
    });

    it('forgets the row once another run starts', async () => {
        const { h, notice, ctx } = await runKept();

        mockApplyUpdatesHeadless.mockResolvedValue(applied());
        const rows = h.presentUpdates(found());
        await apply(h)(createMockHandlerContext(), modal([rows[0].id]));
        notice.tellFixEnded(justrite, 'boilerplate', 'finished', true);

        expect(statusesSent(ctx)).toStrictEqual([]);
    });

    it('remembers no row for a clash that was only reported, not kept', async () => {
        const { h, notice } = loaded();
        const ctx = createMockHandlerContext();
        const rows = h.presentUpdates(boilerplateCheck());
        const clash = KEPT.boilerplate.clashes?.[0];
        mockApplyUpdatesHeadless.mockResolvedValue(
            applied({ boilerplate: { ...emptyResult(), failCount: 1, clashes: clash ? [{ ...clash, keptIn: undefined }] : [] } }),
        );
        await apply(h)(ctx, modal(rows.map((r) => r.id)));
        ctx.sendMessage.mockClear();

        notice.tellFixEnded(justrite, 'boilerplate', 'finished', true);

        expect(statusesSent(ctx)).toStrictEqual([]);
    });
});
