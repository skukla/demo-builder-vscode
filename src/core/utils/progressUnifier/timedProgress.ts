/**
 * Timed progress: the clock, not the output, decides the percentage.
 *
 * - synthetic: an estimated-duration curve that caps at 95% until the command exits
 * - immediate: fast commands, stepped 20 -> 50 -> 80 -> 100 over a minimum duration
 *
 * Moved out of ProgressUnifier.ts by EDS-8 (2026-10-08); the bodies are unchanged.
 */

import { settleStep } from './stepExit';
import type { ExecutionContext, ProgressHandler, ProgressReporterDeps } from './types';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { InstallStep } from '@/types/prerequisites';

/**
 * Synthetic progress: Time-based estimated progress
 * Used when command output doesn't provide progress information.
 * Progress caps at 95% until command completes.
 */
export async function executeSynthetic(
    deps: ProgressReporterDeps,
    step: InstallStep,
    context: ExecutionContext,
    onProgress: ProgressHandler,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = deps.spawnCommand(context.command);
        const startTime = deps.dateProvider.now();
        const estimatedDuration = step.estimatedDuration || TIMEOUTS.DEFAULT_STEP_DURATION;

        // Update progress every second
        const progressInterval = deps.timerProvider.setInterval(async () => {
            const elapsed = deps.dateProvider.now() - startTime;
            const progress = Math.min(95, (elapsed / estimatedDuration) * 100);

            const baseDetail = step.message || context.stepName;

            await onProgress({
                overall: {
                    percent: Math.round(((context.stepIndex + (progress / 100)) / context.totalSteps) * 100),
                    currentStep: context.stepIndex + 1,
                    totalSteps: context.totalSteps,
                    stepName: context.stepName,
                },
                command: {
                    type: 'indeterminate',
                    percent: Math.round(progress),
                    detail: deps.enhanceDetailWithElapsedTime(baseDetail),
                    confidence: 'synthetic',
                },
            });
        }, TIMEOUTS.PROGRESS_UPDATE_INTERVAL);

        child.stdout.on('data', (data) => {
            deps.logger.trace(`[${context.stepName}] ${data.toString().trim()}`);
        });

        child.stderr.on('data', (data) => {
            deps.logger.trace(`[${context.stepName}] ${data.toString().trim()}`);
        });

        child.on('close', async (code) => {
            deps.timerProvider.clearInterval(progressInterval);

            // Final update
            await onProgress({
                overall: {
                    percent: Math.round(((context.stepIndex + 1) / context.totalSteps) * 100),
                    currentStep: context.stepIndex + 1,
                    totalSteps: context.totalSteps,
                    stepName: context.stepName,
                },
                command: {
                    type: 'determinate',
                    percent: 100,
                    detail: deps.enhanceDetailWithElapsedTime('Complete'),
                    confidence: 'synthetic',
                },
            });

            settleStep(code, step, context, resolve, reject);
        });
    });
}

/**
 * Immediate progress: Fast commands with smooth progress transitions
 * Provides 20% -> 50% -> 80% -> 100% progress steps.
 */
export async function executeImmediate(
    deps: ProgressReporterDeps,
    step: InstallStep,
    context: ExecutionContext,
    onProgress: ProgressHandler,
): Promise<void> {
    // Special handling for internal commands
    if (context.command === 'configureFnmShell') {
        await onProgress({
            overall: {
                percent: Math.round(((context.stepIndex + 1) / context.totalSteps) * 100),
                currentStep: context.stepIndex + 1,
                totalSteps: context.totalSteps,
                stepName: step.name,
            },
            command: {
                type: 'determinate',
                percent: 100,
                detail: step.message || context.stepName,
                confidence: 'exact',
            },
        });
        return;
    }

    return new Promise((resolve, reject) => {
        const child = deps.spawnCommand(context.command);
        const estimatedDuration = step.estimatedDuration || TIMEOUTS.PROGRESS_ESTIMATED_DEFAULT_SHORT;
        const minDuration = Math.min(estimatedDuration, TIMEOUTS.PROGRESS_MIN_DURATION_CAP);
        const startTime = deps.dateProvider.now();
        let commandCompleted = false;
        let commandExitCode: number | null = null;

        // Create smooth progress updates
        const stepDetail = step.message || context.stepName;
        const progressSteps = [
            { time: minDuration * 0.2, percent: 20, detail: stepDetail },
            { time: minDuration * 0.5, percent: 50, detail: stepDetail },
            { time: minDuration * 0.8, percent: 80, detail: stepDetail },
        ];

        const progressTimeouts: NodeJS.Timeout[] = [];

        // Schedule progress updates
        progressSteps.forEach(({ time, percent, detail }) => {
            const timeout = deps.timerProvider.setTimeout(async () => {
                if (!commandCompleted) {
                    await onProgress({
                        overall: {
                            percent: Math.round(((context.stepIndex + (percent / 100)) / context.totalSteps) * 100),
                            currentStep: context.stepIndex + 1,
                            totalSteps: context.totalSteps,
                            stepName: context.stepName,
                        },
                        command: {
                            type: 'determinate',
                            percent,
                            detail,
                            confidence: 'exact',
                        },
                    });
                }
            }, time);
            progressTimeouts.push(timeout);
        });

        child.on('close', async (code) => {
            commandCompleted = true;
            commandExitCode = code;

            // Clear any pending progress updates
            progressTimeouts.forEach(timeout => deps.timerProvider.clearTimeout(timeout));

            // Calculate remaining time for smooth transition
            const elapsed = deps.dateProvider.now() - startTime;
            const remainingTime = Math.max(0, minDuration - elapsed);

            // Wait for minimum duration to ensure smooth transition
            deps.timerProvider.setTimeout(async () => {
                await onProgress({
                    overall: {
                        percent: Math.round(((context.stepIndex + 1) / context.totalSteps) * 100),
                        currentStep: context.stepIndex + 1,
                        totalSteps: context.totalSteps,
                        stepName: context.stepName,
                    },
                    command: {
                        type: 'determinate',
                        percent: 100,
                        detail: 'Complete',
                        confidence: 'exact',
                    },
                });

                settleStep(commandExitCode, step, context, resolve, reject);
            }, remainingTime);
        });
    });
}
