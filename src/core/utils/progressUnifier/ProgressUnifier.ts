/**
 * ProgressUnifier
 *
 * Runs an install step's commands one after another and reports one unified
 * progress stream for the step. Which reporter runs is decided by the step's
 * `progressStrategy`:
 *
 * - exact:      percentages parsed from the tool's output   (exactProgress.ts)
 * - milestones: output patterns mapped to progress points   (milestoneProgress.ts)
 * - synthetic:  a time-based curve for unknown durations    (timedProgress.ts)
 * - immediate:  fast commands, stepped 20->50->80->100      (timedProgress.ts)
 *
 * The command line itself (resolution, fnm wrapping, spawning) is fnmCommands.ts.
 * This file keeps the orchestration and the elapsed-time clock, which the
 * reporters reach through `ProgressReporterDeps`.
 */

import { spawn } from 'child_process';
import { executeExact } from './exactProgress';
import { resolveCommands, resolveStepName, spawnCommand } from './fnmCommands';
import { executeMilestones } from './milestoneProgress';
import { executeSynthetic, executeImmediate } from './timedProgress';
import type {
    IDateProvider,
    ITimerProvider,
    IProcessSpawner,
    ProgressHandler,
    ProgressReporterDeps,
    ExecutionContext,
} from './types';
import { formatElapsed } from '@/core/utils/timeFormatting';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';
import type { InstallStep } from '@/types/prerequisites';

/**
 * Progress type configuration
 */
type ProgressType = 'exact' | 'milestones' | 'synthetic' | 'immediate';

/**
 * ProgressUnifier - Unified progress tracking for install step execution
 *
 * Responsibilities:
 * - Step execution orchestration
 * - Config-driven choice of progress reporter
 * - Elapsed time tracking
 */
export class ProgressUnifier {
    private readonly dateProvider: IDateProvider;
    private readonly reporterDeps: ProgressReporterDeps;

    // Elapsed time tracking
    private startTime: number | undefined;

    constructor(
        logger: Logger,
        dateProvider: IDateProvider = Date,
        timerProvider: ITimerProvider = {
            setInterval: setInterval.bind(global),
            clearInterval: clearInterval.bind(global),
            setTimeout: setTimeout.bind(global),
            clearTimeout: clearTimeout.bind(global),
        },
        processSpawner: IProcessSpawner = spawn,
    ) {
        this.dateProvider = dateProvider;
        this.reporterDeps = {
            logger,
            dateProvider,
            timerProvider,
            spawnCommand: (command) => spawnCommand(processSpawner, command),
            enhanceDetailWithElapsedTime: (detail) => this.enhanceDetailWithElapsedTime(detail),
        };
    }

    /**
     * Execute a step with unified progress reporting
     */
    async executeStep(
        step: InstallStep,
        stepIndex: number,
        totalSteps: number,
        onProgress: ProgressHandler,
        options?: { nodeVersion?: string },
    ): Promise<void> {
        // Start elapsed time tracking
        this.startTime = this.dateProvider.now();

        try {
            const commands = resolveCommands(step, options);
            const totalCommands = commands.length;

            for (let cmdIndex = 0; cmdIndex < commands.length; cmdIndex++) {
                const command = commands[cmdIndex];
                const stepName = resolveStepName(step, options);

                // Calculate overall progress
                const stepProgress = ((stepIndex + (cmdIndex / totalCommands)) / totalSteps) * 100;

                // Initial progress update (skip for exact progress - tool provides immediate feedback)
                if (step.progressStrategy !== 'exact') {
                    await onProgress({
                        overall: {
                            percent: Math.round(stepProgress),
                            currentStep: stepIndex + 1,
                            totalSteps,
                            stepName,
                        },
                        command: {
                            type: 'indeterminate',
                            detail: this.enhanceDetailWithElapsedTime('Starting'),
                            confidence: 'synthetic',
                        },
                    });
                }

                // Create execution context
                const context: ExecutionContext = {
                    command,
                    stepIndex,
                    totalSteps,
                    stepName,
                    options,
                };

                // Execute with config-driven progress tracking
                await this.executeWithProgress(step, context, onProgress);
            }

            // Final progress update
            await onProgress({
                overall: {
                    percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                    currentStep: stepIndex + 1,
                    totalSteps,
                    stepName: resolveStepName(step, options),
                },
            });
        } finally {
            // Always stop the timer when execution completes
            this.startTime = undefined;
        }
    }

    /**
     * Execute command with config-driven progress tracking
     *
     * Dispatches on the progressStrategy string to the reporter that owns it.
     */
    private async executeWithProgress(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
    ): Promise<void> {
        const progressType = this.normalizeProgressType(step.progressStrategy);

        switch (progressType) {
            case 'exact':
                return executeExact(this.reporterDeps, step, context, onProgress);
            case 'milestones':
                return executeMilestones(this.reporterDeps, step, context, onProgress);
            case 'synthetic':
                return executeSynthetic(this.reporterDeps, step, context, onProgress);
            case 'immediate':
                return executeImmediate(this.reporterDeps, step, context, onProgress);
            default:
                // Fallback to synthetic (should never reach here due to normalizeProgressType)
                return executeSynthetic(this.reporterDeps, step, context, onProgress);
        }
    }

    /**
     * Normalize progress type string to valid enum value
     */
    private normalizeProgressType(strategyType: string | undefined): ProgressType {
        if (!strategyType) return 'synthetic';
        if (['exact', 'milestones', 'synthetic', 'immediate'].includes(strategyType)) {
            return strategyType as ProgressType;
        }
        return 'synthetic';
    }

    /**
     * Enhance detail string with elapsed time if operation exceeds threshold (30s)
     */
    private enhanceDetailWithElapsedTime(detail: string): string {
        if (!this.startTime) return detail;

        const elapsed = this.dateProvider.now() - this.startTime;

        // Only show elapsed time for operations exceeding threshold (30s)
        if (elapsed > TIMEOUTS.ELAPSED_TIME_THRESHOLD) {
            const elapsedStr = formatElapsed(elapsed);
            return `${detail} (${elapsedStr})`;
        }

        return detail;
    }
}
