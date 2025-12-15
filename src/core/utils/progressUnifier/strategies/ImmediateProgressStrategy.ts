/**
 * ImmediateProgressStrategy
 *
 * Progress strategy for very fast operations that complete almost immediately.
 * Provides smooth visual progress with minimum duration to avoid UI flickering.
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';
import { ProgressHandler, ExecutionContext } from '../types';
import { IProgressStrategy, StrategyDependencies } from './IProgressStrategy';

/**
 * Immediate progress strategy implementation
 *
 * Handles fast commands by:
 * 1. Showing smooth progress steps (20%, 50%, 80%, 100%)
 * 2. Ensuring minimum display duration to avoid UI flickering
 * 3. Supporting internal commands that don't spawn processes
 */
export class ImmediateProgressStrategy implements IProgressStrategy {
    /**
     * Execute a fast command with smooth progress transitions
     */
    async execute(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
        deps: StrategyDependencies
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

            // Create smooth progress updates (skip initial 0% to avoid blip)
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

                // Calculate how long we should wait before showing completion
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

                    if (commandExitCode === 0 || step.continueOnError) {
                        resolve();
                    } else {
                        reject(new Error(`Command failed with code ${commandExitCode}: ${context.command}`));
                    }
                }, remainingTime);
            });
        });
    }
}
