/**
 * updatesModalHandlers — an update that did not apply, fixed in place (owner, 2026-11-19, as the
 * Prerequisites step installs a missing tool). `fixUpdateWithAi` opens the SC's AI on it, from the
 * run's own record and only by the row's id; `checkUpdateRows` asks whether it is still waiting and
 * applies nothing.
 */

// FIRST: this module owns the jest.mock calls the handler must see.
import {
    apply,
    found,
    handlers,
    mockApplyUpdatesHeadless,
    mockExecuteCommand,
    mockFindAllUpdates,
    modal,
    applied,
    resetModalMocks,
    selections,
    statusesSent,
} from './updatesModalHandlers.testUtils';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

beforeEach(resetModalMocks);

/** Bodea's template update applied and told failed: the run has ended with one to fix. */
async function failedTemplate() {
    mockApplyUpdatesHeadless.mockImplementation(
        async (sel: UpdateSelections, _ctx, _report, options) => {
            options.onItem('template', sel.template[0], {
                state: 'failed',
                message: 'GitHub is missing part of the history.',
            });
            return applied();
        }
    );
    const h = handlers();
    const ctx = createMockHandlerContext();
    const rows = h.presentUpdates(found());
    const template = rows.find((r) => r.kind === 'template');
    if (!template) throw new Error('the check has a template row');
    await apply(h)(ctx, modal([template.id]));
    return { h, ctx, template };
}

describe('fixUpdateWithAi', () => {
    it("opens the SC's AI on the update with what it said, from the run's record", async () => {
        const { h, ctx, template } = await failedTemplate();

        const answer = await h.handleFixUpdateWithAi(ctx, { id: template.id });

        expect(answer).toEqual({ success: true });
        const [command, request] =
            mockExecuteCommand.mock.calls.find(([c]) => c === 'demoBuilder.openInClaude') ?? [];
        expect(command).toBe('demoBuilder.openInClaude');
        expect(request.fresh).toBe(true);
        expect(request.prompt).toContain('Demo Builder project Bodea');
        expect(request.prompt).toContain('- What it said: GitHub is missing part of the history.');
        expect(request.prompt).toContain('read_debug_logs');
        expect(request.prompt).toContain('apply_updates');
        // The chat acts on the project the failure is about, not whichever is open, and fixes the
        // project, never Demo Builder's own code (owner walk, 2026-11-19).
        expect(request.aboutProject).toBe('Bodea');
        expect(request.prompt).toContain("do not change Demo Builder's own code");
    });

    it('refuses a row the run did not fail, and opens nothing', async () => {
        const { h, ctx } = await failedTemplate();

        const answer = await h.handleFixUpdateWithAi(ctx, { id: 'blockLibrary:0' });

        expect(answer).toEqual({ success: false, error: 'This update has no failure to fix.' });
        expect(mockExecuteCommand).not.toHaveBeenCalledWith(
            'demoBuilder.openInClaude',
            expect.anything()
        );
    });
});

describe('checkUpdateRows', () => {
    it('answers the update still waiting, and tells no row anything', async () => {
        const { h, ctx, template } = await failedTemplate();
        mockFindAllUpdates.mockResolvedValue(found());
        const told = statusesSent(ctx).length;

        const answer = await h.handleCheckUpdateRows(ctx, { ids: [template.id] });

        expect(answer).toEqual({ success: true, data: { waiting: [template.id] } });
        expect(statusesSent(ctx)).toHaveLength(told);
        expect(mockApplyUpdatesHeadless).toHaveBeenCalledTimes(1);
    });

    it('tells an update no longer listed done, and it then has no failure to fix', async () => {
        const { h, ctx, template } = await failedTemplate();
        mockFindAllUpdates.mockResolvedValue(
            found({ selections: { ...selections(), template: [] } })
        );

        const answer = await h.handleCheckUpdateRows(ctx, { ids: [template.id] });

        expect(answer).toEqual({ success: true, data: { waiting: [] } });
        expect(statusesSent(ctx).at(-1)).toEqual({ id: template.id, state: 'done' });
        expect(await h.handleFixUpdateWithAi(ctx, { id: template.id })).toMatchObject({
            success: false,
        });
    });
});

// The project's card names it, so its row does not repeat it (owner, 2026-11-19).
describe("a row's reason on screen", () => {
    it("drops the project's name leading it", async () => {
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            options.onItem('template', sel.template[0], { state: 'failed', message: "bodea: Couldn't merge the changes." });
            options.onItem('template', sel.template[0], { state: 'failed', message: "bodea (Adobe boilerplate): Couldn't merge." });
            return applied();
        });
        const h = handlers();
        const ctx = createMockHandlerContext();
        const template = h.presentUpdates(found()).find((r) => r.kind === 'template');
        await apply(h)(ctx, modal([template?.id ?? '']));

        expect(statusesSent(ctx)).toEqual([
            { id: template?.id, state: 'failed', message: "Couldn't merge the changes.", retryable: false },
            { id: template?.id, state: 'failed', message: "Couldn't merge.", retryable: false },
        ]);
    });
});

// Retry only where a second try can get past it; anything else goes to Fix with AI (owner, 2026-11-19).
describe('whether a retry can help a failed row', () => {
    it('says so for a failure where nothing answered, and not for one a retry cannot fix', async () => {
        mockApplyUpdatesHeadless.mockImplementation(async (sel: UpdateSelections, _ctx, _report, options) => {
            options.onItem('template', sel.template[0], { state: 'failed', message: 'The request to GitHub timed out.' });
            options.onItem('template', sel.template[0], { state: 'failed', message: 'repository lacks the necessary blob to perform 3-way merge' });
            return applied();
        });
        const h = handlers();
        const ctx = createMockHandlerContext();
        const template = h.presentUpdates(found()).find((r) => r.kind === 'template');
        await apply(h)(ctx, modal([template?.id ?? '']));

        expect(statusesSent(ctx)).toEqual([
            expect.objectContaining({ state: 'failed', retryable: true }),
            expect.objectContaining({ state: 'failed', retryable: false }),
        ]);
    });
});

