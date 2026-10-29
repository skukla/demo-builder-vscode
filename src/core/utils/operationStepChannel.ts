/**
 * The channel a STEP takes from deep inside an operation to the progress modal the
 * operation runs in.
 *
 * WHY a channel of its own (progress vocabulary slice 2, owner 2026-10-16): a command
 * a dashboard button runs (Sync Storefront, Refresh Blocks) reports through
 * `BaseCommand.withProgress`, whose lines reach the modal as plain phases
 * (`agentPhaseChannel`). A plain line is only ever the line UNDER a step, and with no
 * step reported yet the first one froze as the step for the whole run: "Saving your
 * changes" over a push and a publish. Turning a plain line into a step when it happens
 * to match a step name would have changed every other modal too (a nested mesh deploy
 * says "Building the mesh config" under a reset's own step). A step said AS a step is
 * the explicit way.
 *
 * vscode-free, the same AsyncLocalStorage pattern as `agentPhaseChannel`.
 *
 * @module core/utils/operationStepChannel
 */

import { AsyncLocalStorage } from 'async_hooks';

/** Where a step shows: line 1 of the modal, with the line under it. */
export type StepSink = (stage: string, step?: string) => void;

const storage = new AsyncLocalStorage<StepSink>();

/**
 * Run `fn` with `sink` receiving every {@link reportStep} made inside it, however deep.
 * Installed by the progress modal's runner.
 */
export function withStepSink<T>(sink: StepSink, fn: () => Promise<T>): Promise<T> {
    return storage.run(sink, fn);
}

/**
 * Report a step of the operation in flight to the modal showing it.
 *
 * Never throws: a modal that cannot take the step must not cost the SC the operation.
 *
 * @param stage - the step's name, a label from the stage table
 * @param step - what it is doing now, for the line under it
 * @returns true when a modal took it; false when none is showing the run, and the
 *          caller reports it its own way (a notification's message)
 */
export function reportStep(stage: string, step?: string): boolean {
    const sink = storage.getStore();
    if (!sink) return false;
    try {
        sink(stage, step);
    } catch {
        // A broken sink is not the operation's problem.
    }
    return true;
}
