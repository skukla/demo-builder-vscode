/**
 * SyntheticProgressStrategy
 *
 * Progress strategy that generates time-based synthetic progress updates.
 * Used when command output doesn't provide progress information.
 */

import { ProgressHandler, ExecutionContext } from '../types';
import { IProgressStrategy, StrategyDependencies } from './IProgressStrategy';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * Synthetic progress strategy implementation
 *
 * Generates progress updates based on elapsed time vs estimated duration.
 * Progress caps at 95% until command completes to indicate uncertainty.
 */
export class SyntheticProgressStrategy implements IProgressStrategy {
    /**
     * Execute a command with time-based synthetic progress
     */
    async execute(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
        deps: StrategyDependencies,
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
                deps.logger.info(`[${step.name}] ${data.toString().trim()}`);
            });

            child.stderr.on('data', (data) => {
                deps.logger.warn(`[${step.name}] ${data.toString().trim()}`);
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

                if (code === 0 || step.continueOnError) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with code ${code}: ${context.command}`));
                }
            });
        });
    }
}
