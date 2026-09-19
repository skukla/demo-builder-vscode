/**
 * withOperationProgress — the one place that decides where a long operation reports
 * (PL-59 phase 2, `.rptc/plans/operation-progress/extension-wide.md`, rules R1–R3, R7).
 *
 * The rule each test pins is named beside it; the plan's routing table says which
 * operation starts where.
 */

import * as vscode from 'vscode';
import { withPhaseSinks } from '@/core/utils/agentPhaseChannel';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
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
        });
        expect(modalPayloads().at(-1)).toEqual({ id: ID, state: 'succeeded' });
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
