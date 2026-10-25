/**
 * withOperationProgress — the one place that decides where a long operation reports
 * (PL-59 phase 2, `.rptc/plans/operation-progress/extension-wide.md`, rules R1–R3, R7).
 *
 * The rule each test pins is named beside it; the plan's routing table says which
 * operation starts where.
 */

import * as vscode from 'vscode';
import { reportPhase, withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { reportStep } from '@/core/utils/operationStepChannel';
import { startModalRun } from '@/core/vscode/operationProgress';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { withProgressRegister } from '@/core/vscode/progressRegister';

const ID = 'op-1';
const STAGE = OPERATION_STAGES.deployingApp;
const screen = jest.fn(async (_type: string, _payload?: unknown): Promise<void> => undefined);

/** Every progress payload the modal's screen was sent. */
function modalPayloads(): Array<Record<string, unknown>> {
    return screen.mock.calls.filter(([type]) => type === 'operationProgress').map(([, p]) => p as Record<string, unknown>);
}

/** Capture the reporter withProgress hands the task. */
function stubWithProgress(): jest.Mock {
    const report = jest.fn();
    (vscode.window.withProgress as unknown as jest.Mock).mockImplementation(
        async (_options: unknown, task: (p: unknown) => Promise<unknown>) => task({ report }),
    );
    return report;
}

beforeEach(() => {
    jest.clearAllMocks();
    startModalRun(ID, screen);
});

describe('started from a button on a screen (R1)', () => {
    it('reports each stage to the modal with its detail and expectation, and opens no notification', async () => {
        await withOperationProgress({ id: ID, title: 'Deploying ERP', inModal: true }, async (report) => {
            report(STAGE.label);
            return { success: true };
        });

        expect(vscode.window.withProgress).not.toHaveBeenCalled();
        expect(modalPayloads()).toContainEqual({
            id: ID,
            state: 'running',
            stage: STAGE.label,
            step: STAGE.detail,
            expectation: STAGE.expectation,
            startedAt: expect.any(Number),
        });
        expect(modalPayloads().at(-1)).toEqual({
            id: ID,
            state: 'succeeded',
            startedAt: expect.any(Number),
            tookMs: expect.any(Number),
        });
    });

    // AB-26z: a fill that stood while its prices were not published said so only in the
    // answer an agent reads; the SC watching the modal saw a plain success.
    it('ends the modal with the warning of a run that succeeded with one', async () => {
        await withOperationProgress({ id: ID, title: 'Filling Northwind', inModal: true }, async () => ({
            success: true,
            warning: 'Demo data loaded; prices were not published.',
        }));

        expect(modalPayloads().at(-1)).toEqual({
            id: ID,
            state: 'succeeded',
            warning: 'Demo data loaded; prices were not published.',
        });
    });

    // A note the SC need not act on (prices still being published) ends the modal as a
    // plain success that says it; it is never dressed as a warning.
    it('ends the modal with the note of a run that succeeded with one', async () => {
        await withOperationProgress({ id: ID, title: 'Filling Northwind', inModal: true }, async () => ({
            success: true,
            note: 'Demo data loaded. Prices are still being published and will finish by themselves in a few minutes.',
        }));

        expect(modalPayloads().at(-1)).toEqual({
            id: ID,
            state: 'succeeded',
            note: 'Demo data loaded. Prices are still being published and will finish by themselves in a few minutes.',
        });
    });

    // What a run changed reaches the result screen (live release test, 2026-10-22: "Store
    // prepared" named nothing it did). An empty list is not carried.
    it('ends the modal with the lines of what a run that succeeded changed', async () => {
        await withOperationProgress({ id: ID, title: 'Preparing the store', inModal: true }, async () => ({
            success: true,
            details: ['Product attributes:', 'Added erp_owner to the attribute set Default'],
        }));
        expect(modalPayloads().at(-1)).toEqual({
            id: ID,
            state: 'succeeded',
            details: ['Product attributes:', 'Added erp_owner to the attribute set Default'],
        });

        await withOperationProgress({ id: ID, title: 'Preparing the store', inModal: true }, async () => ({ success: true, details: [] }));
        expect(modalPayloads().at(-1)).toEqual({ id: ID, state: 'succeeded' });
    });

    // When the step IS the job, the line under it is the job's count, never its name
    // a second time (progress vocabulary, owner 2026-10-16).
    it("drops the step's own name from the line under it", async () => {
        await withOperationProgress({ id: ID, title: 'Resetting Bodea', inModal: true }, async (report) => {
            report('Copying the content', 'Copying the content: 40 of 103 files');
            report('Copying the content', 'Publishing the pages: 3 of 9 pages');
            return { success: true };
        });

        const steps = modalPayloads()
            .filter((p) => p.state === 'running')
            .map((p) => p.step);
        expect(steps).toStrictEqual(['40 of 103 files', 'Publishing the pages: 3 of 9 pages']);
    });

    it('ends the modal with the reason when the operation fails', async () => {
        await withOperationProgress({ id: ID, title: 'Deploying ERP', inModal: true }, async () => ({
            success: false,
            error: 'Adobe refused this.',
        }));

        expect(modalPayloads().at(-1)).toEqual({ id: ID, state: 'failed', error: 'Adobe refused this.' });
    });

    // R7: a reset stops the demo through a command that opens its own notification,
    // and a headless reset redeploys the mesh through withProgressRegister. With the
    // modal up, both must report into it instead (owner, 2026-09-19).
    it('keeps everything the operation runs inside it in the modal, never a second notification', async () => {
        await withOperationProgress({ id: ID, title: 'Resetting Bodea', inModal: true }, async (report) => {
            report(STAGE.label);
            await withProgressRegister({ title: 'Deploying API Mesh' }, async (nested) => {
                nested('Building the mesh config');
            });
            return { success: true };
        });

        expect(vscode.window.withProgress).not.toHaveBeenCalled();
        expect(modalPayloads()).toContainEqual(
            expect.objectContaining({ stage: STAGE.label, step: 'Building the mesh config' }),
        );
    });

    // Slice 2 of the progress vocabulary (owner 2026-10-16): a command run inside the
    // modal (Sync Storefront, Refresh Blocks) had only plain lines to report, so its
    // first line froze as the step for the whole run. A step it reports as a step is
    // line 1; its plain lines stay under it.
    it('shows a step reported from inside the run as the step, with its plain lines under it', async () => {
        await withOperationProgress({ id: ID, title: 'Syncing the storefront', inModal: true }, async () => {
            reportStep(OPERATION_STAGES.savingChanges.label);
            reportPhase('Committing 3 files');
            reportStep(OPERATION_STAGES.pushingToGitHub.label, 'demo-org/demo-repo');
            return { success: true };
        });

        const running = modalPayloads()
            .filter((p) => p.state === 'running')
            .map(({ stage, step, expectation, position }) => ({ stage, step, expectation, position }));
        expect(running).toStrictEqual([
            {
                stage: OPERATION_STAGES.savingChanges.label,
                step: OPERATION_STAGES.savingChanges.detail,
                expectation: OPERATION_STAGES.savingChanges.expectation,
                position: undefined,
            },
            {
                stage: OPERATION_STAGES.savingChanges.label,
                step: 'Committing 3 files',
                expectation: OPERATION_STAGES.savingChanges.expectation,
                position: undefined,
            },
            {
                stage: OPERATION_STAGES.pushingToGitHub.label,
                step: 'demo-org/demo-repo',
                expectation: OPERATION_STAGES.pushingToGitHub.expectation,
                position: undefined,
            },
        ]);
    });
});

describe('started anywhere else (R2)', () => {
    it('opens one notification with the title, showing the stage name only', async () => {
        const report = stubWithProgress();

        await withOperationProgress({ id: ID, title: 'Deploying ERP', inModal: false }, async (step) => {
            step(STAGE.label, 'Running aio app deploy');
            return { success: true };
        });

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Deploying ERP' }),
            expect.any(Function),
        );
        // The stage, never the step: the notification's message is the short set.
        expect(report).toHaveBeenCalledWith({ message: STAGE.label });
        expect(modalPayloads()).toStrictEqual([]);
    });
});

describe('started by an agent (R3)', () => {
    it("opens nothing of its own; the stages reach the agent's notification", async () => {
        const seen: string[] = [];

        await withPhaseSinks([(message) => seen.push(message)], () =>
            withOperationProgress({ id: ID, title: 'Deploying ERP', inModal: false }, async (report) => {
                report(STAGE.label, 'Running aio app deploy');
                return { success: true };
            }),
        );

        expect(vscode.window.withProgress).not.toHaveBeenCalled();
        expect(seen).toEqual([STAGE.label]);
    });
});
