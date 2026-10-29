/**
 * Exact progress: the tool itself reports how far along it is.
 *
 * Percentages are parsed from command output (fnm's download lines, or any
 * `NN%` a generic tool prints) and passed through with `confidence: 'exact'`.
 * Moved out of ProgressUnifier.ts by EDS-8 (2026-10-08); the bodies are unchanged.
 */

import { determinateProgress } from './progressPayload';
import { settleStep } from './stepExit';
import type { ExecutionContext, ProgressHandler, ProgressReporterDeps } from './types';
import type { InstallStep } from '@/types/prerequisites';

/**
 * Exact progress: Parse percentages from command output
 * Used for tools like fnm that report download progress directly.
 */
export async function executeExact(
    deps: ProgressReporterDeps,
    step: InstallStep,
    context: ExecutionContext,
    onProgress: ProgressHandler,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = deps.spawnCommand(context.command);
        let lastDetail = '';
        const isFnmParser = step.progressParser === 'fnm';

        child.stdout.on('data', async (data) => {
            const output = data.toString();

            if (isFnmParser) {
                await parseFnmOutput(output, step, context, onProgress, lastDetail, (detail) => { lastDetail = detail; });
            } else {
                await parseGenericOutput(output, step, context, onProgress, lastDetail, (detail) => { lastDetail = detail; });
            }

            deps.logger.trace(`[${context.stepName}] ${output.trim()}`);
        });

        child.stderr.on('data', (data) => {
            deps.logger.trace(`[${context.stepName}] ${data.toString().trim()}`);
        });

        child.on('close', (code) => {
            settleStep(code, step, context, resolve, reject);
        });
    });
}

/**
 * Parse fnm-specific output format: a percentage line is reported as exact
 * progress (the same as generic output); any other non-empty line is shown as
 * indeterminate detail.
 */
async function parseFnmOutput(
    output: string,
    step: InstallStep,
    context: ExecutionContext,
    onProgress: ProgressHandler,
    lastDetail: string,
    setLastDetail: (detail: string) => void,
): Promise<void> {
    const trimmedOutput = output.trim();
    if (!trimmedOutput) return;

    if (await parseGenericOutput(output, step, context, onProgress, lastDetail, setLastDetail)) {
        return;
    }

    if (trimmedOutput !== lastDetail) {
        setLastDetail(trimmedOutput);
        await onProgress({
            overall: {
                percent: Math.round(((context.stepIndex + 0.5) / context.totalSteps) * 100),
                currentStep: context.stepIndex + 1,
                totalSteps: context.totalSteps,
                stepName: context.stepName,
            },
            command: {
                type: 'indeterminate',
                detail: trimmedOutput,
                confidence: 'exact',
            },
        });
    }
}

/**
 * Parse generic percentage-based output.
 *
 * @returns whether the output carried a percentage (reported or a repeat)
 */
async function parseGenericOutput(
    output: string,
    _step: InstallStep,
    context: ExecutionContext,
    onProgress: ProgressHandler,
    lastDetail: string,
    setLastDetail: (detail: string) => void,
): Promise<boolean> {
    const percentMatch = output.match(/(\d+)%/);
    if (!percentMatch) return false;

    const percent = parseInt(percentMatch[1]);
    const detail = output.trim().substring(0, 100);
    if (detail !== lastDetail) {
        setLastDetail(detail);
        await onProgress(determinateProgress(context, percent, detail));
    }
    return true;
}
