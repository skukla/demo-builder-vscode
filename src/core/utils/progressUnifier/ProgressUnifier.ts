/**
 * ProgressUnifier
 *
 * Unified progress tracking for install steps using config-driven approach.
 * Replaces the Strategy pattern with inline configuration-based logic.
 *
 * Progress Types:
 * - exact: Parses percentages from command output (e.g., fnm downloads)
 * - milestones: Matches output patterns to predefined progress milestones
 * - synthetic: Time-based estimated progress for unknown durations
 * - immediate: Fast commands with minimal progress steps (20->50->80->100)
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type {
    IDateProvider,
    ITimerProvider,
    IProcessSpawner,
    ProgressHandler,
    ExecutionContext,
} from './types';
import type { Logger } from '@/types/logger';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * Progress type configuration
 */
type ProgressType = 'exact' | 'milestones' | 'synthetic' | 'immediate';

/**
 * Command resolution options
 */
interface CommandResolveOptions {
    nodeVersion?: string;
}

/**
 * Format elapsed time in human-readable format
 * @param ms Milliseconds elapsed
 * @returns Formatted string like "35s" or "1m 15s"
 */
function formatElapsedTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

/**
 * ProgressUnifier - Unified progress tracking for install step execution
 *
 * Responsibilities:
 * - Step execution orchestration
 * - Config-driven progress tracking (replaces Strategy pattern)
 * - Command spawning with fnm environment
 * - Elapsed time tracking
 */
export class ProgressUnifier {
    private readonly logger: Logger;
    private readonly dateProvider: IDateProvider;
    private readonly timerProvider: ITimerProvider;
    private readonly processSpawner: IProcessSpawner;

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
        this.logger = logger;
        this.dateProvider = dateProvider;
        this.timerProvider = timerProvider;
        this.processSpawner = processSpawner;
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
            const commands = this.resolveCommands(step, options);
            const totalCommands = commands.length;

            for (let cmdIndex = 0; cmdIndex < commands.length; cmdIndex++) {
                const command = commands[cmdIndex];
                const stepName = this.resolveStepName(step, options);

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
                            detail: this.enhanceDetailWithElapsedTime('Starting...'),
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
                    stepName: this.resolveStepName(step, options),
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
     * Replaces the Strategy pattern with inline logic based on progressStrategy string.
     */
    private async executeWithProgress(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
    ): Promise<void> {
        const progressType = this.normalizeProgressType(step.progressStrategy);

        switch (progressType) {
            case 'exact':
                return this.executeExact(step, context, onProgress);
            case 'milestones':
                return this.executeMilestones(step, context, onProgress);
            case 'synthetic':
                return this.executeSynthetic(step, context, onProgress);
            case 'immediate':
                return this.executeImmediate(step, context, onProgress);
            default:
                // Fallback to synthetic (should never reach here due to normalizeProgressType)
                return this.executeSynthetic(step, context, onProgress);
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

    // =========================================================================
    // Progress Type Implementations (inlined from strategy classes)
    // =========================================================================

    /**
     * Exact progress: Parse percentages from command output
     * Used for tools like fnm that report download progress directly.
     */
    private async executeExact(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(context.command);
            let lastDetail = '';
            const isFnmParser = step.progressParser === 'fnm';

            child.stdout.on('data', async (data) => {
                const output = data.toString();

                if (isFnmParser) {
                    await this.parseFnmOutput(output, step, context, onProgress, lastDetail, (detail) => { lastDetail = detail; });
                } else {
                    await this.parseGenericOutput(output, step, context, onProgress, lastDetail, (detail) => { lastDetail = detail; });
                }

                this.logger.trace(`[${context.stepName}] ${output.trim()}`);
            });

            child.stderr.on('data', (data) => {
                this.logger.trace(`[${context.stepName}] ${data.toString().trim()}`);
            });

            child.on('close', (code) => {
                if (code === 0 || step.continueOnError) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with code ${code}: ${context.command}`));
                }
            });
        });
    }

    /**
     * Parse fnm-specific output format
     */
    private async parseFnmOutput(
        output: string,
        _step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
        lastDetail: string,
        setLastDetail: (detail: string) => void,
    ): Promise<void> {
        const trimmedOutput = output.trim();
        if (!trimmedOutput) return;

        const percentMatch = trimmedOutput.match(/(\d+)%/);
        if (percentMatch) {
            const percent = parseInt(percentMatch[1]);
            const detail = trimmedOutput.substring(0, 100);

            if (detail !== lastDetail) {
                setLastDetail(detail);
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
        } else if (trimmedOutput !== lastDetail) {
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
     * Parse generic percentage-based output
     */
    private async parseGenericOutput(
        output: string,
        _step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
        lastDetail: string,
        setLastDetail: (detail: string) => void,
    ): Promise<void> {
        const percentMatch = output.match(/(\d+)%/);
        if (percentMatch) {
            const percent = parseInt(percentMatch[1]);
            const detail = output.trim().substring(0, 100);

            if (detail !== lastDetail) {
                setLastDetail(detail);
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
        }
    }

    /**
     * Milestone progress: Match output patterns to predefined progress milestones
     * Used for tools like brew, npm where progress can be estimated from output patterns.
     */
    private async executeMilestones(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(context.command);
            const milestones = step.milestones || [];
            let currentProgress = 0;
            let currentMilestoneIndex = 0;

            const checkMilestones = async (text: string) => {
                for (let i = 0; i < milestones.length; i++) {
                    const milestone = milestones[i];
                    if (text.includes(milestone.pattern) && milestone.progress > currentProgress) {
                        currentProgress = milestone.progress;
                        currentMilestoneIndex = i + 1;

                        await onProgress({
                            overall: {
                                percent: Math.round(((context.stepIndex + (currentProgress / 100)) / context.totalSteps) * 100),
                                currentStep: context.stepIndex + 1,
                                totalSteps: context.totalSteps,
                                stepName: context.stepName,
                            },
                            command: {
                                type: 'determinate',
                                percent: currentProgress,
                                detail: milestone.message || text.trim().substring(0, 100),
                                confidence: 'estimated',
                                currentMilestoneIndex,
                                totalMilestones: milestones.length,
                            },
                        });
                        break;
                    }
                }
            };

            child.stdout.on('data', async (data) => {
                const output = data.toString();
                await checkMilestones(output);
                this.logger.trace(`[${context.stepName}] ${output.trim()}`);
            });

            child.stderr.on('data', async (data) => {
                const output = data.toString();
                await checkMilestones(output);
                this.logger.trace(`[${context.stepName}] ${output.trim()}`);
            });

            child.on('close', (code) => {
                if (code === 0 || step.continueOnError) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with code ${code}: ${context.command}`));
                }
            });
        });
    }

    /**
     * Synthetic progress: Time-based estimated progress
     * Used when command output doesn't provide progress information.
     * Progress caps at 95% until command completes.
     */
    private async executeSynthetic(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(context.command);
            const startTime = this.dateProvider.now();
            const estimatedDuration = step.estimatedDuration || TIMEOUTS.DEFAULT_STEP_DURATION;

            // Update progress every second
            const progressInterval = this.timerProvider.setInterval(async () => {
                const elapsed = this.dateProvider.now() - startTime;
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
                        detail: this.enhanceDetailWithElapsedTime(baseDetail),
                        confidence: 'synthetic',
                    },
                });
            }, TIMEOUTS.PROGRESS_UPDATE_INTERVAL);

            child.stdout.on('data', (data) => {
                this.logger.trace(`[${context.stepName}] ${data.toString().trim()}`);
            });

            child.stderr.on('data', (data) => {
                this.logger.trace(`[${context.stepName}] ${data.toString().trim()}`);
            });

            child.on('close', async (code) => {
                this.timerProvider.clearInterval(progressInterval);

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
                        detail: this.enhanceDetailWithElapsedTime('Complete'),
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

    /**
     * Immediate progress: Fast commands with smooth progress transitions
     * Provides 20% -> 50% -> 80% -> 100% progress steps.
     */
    private async executeImmediate(
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
            const child = this.spawnCommand(context.command);
            const estimatedDuration = step.estimatedDuration || TIMEOUTS.PROGRESS_ESTIMATED_DEFAULT_SHORT;
            const minDuration = Math.min(estimatedDuration, TIMEOUTS.PROGRESS_MIN_DURATION_CAP);
            const startTime = this.dateProvider.now();
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
                const timeout = this.timerProvider.setTimeout(async () => {
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
                progressTimeouts.forEach(timeout => this.timerProvider.clearTimeout(timeout));

                // Calculate remaining time for smooth transition
                const elapsed = this.dateProvider.now() - startTime;
                const remainingTime = Math.max(0, minDuration - elapsed);

                // Wait for minimum duration to ensure smooth transition
                this.timerProvider.setTimeout(async () => {
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

    // =========================================================================
    // Helper Methods (inlined from CommandResolver and ElapsedTimeTracker)
    // =========================================================================

    /**
     * Resolve commands from an install step
     */
    private resolveCommands(step: InstallStep, options?: CommandResolveOptions): string[] {
        let commands: string[] = [];

        if (step.commands) {
            commands = step.commands;
        } else if (step.commandTemplate) {
            const template = step.commandTemplate;
            const hasPlaceholder = template.includes('{version}');

            if (hasPlaceholder) {
                if (options?.nodeVersion) {
                    commands = [template.replace(/{version}/g, options.nodeVersion)];
                }
            } else {
                commands = [template];
            }
        }

        // Wrap commands with fnm if Node version specified
        if (options?.nodeVersion && commands.length > 0) {
            commands = commands.map(cmd =>
                cmd.startsWith('fnm ') ? cmd : `fnm exec --using ${options.nodeVersion} ${cmd}`,
            );
        }

        return commands;
    }

    /**
     * Resolve step name with Node version substitution
     */
    private resolveStepName(step: InstallStep, options?: CommandResolveOptions): string {
        if (options?.nodeVersion) {
            return step.name.replace(/{version}/g, options.nodeVersion);
        }
        return step.name;
    }

    /**
     * Enhance detail string with elapsed time if operation exceeds threshold (30s)
     */
    private enhanceDetailWithElapsedTime(detail: string): string {
        if (!this.startTime) return detail;

        const elapsed = this.dateProvider.now() - this.startTime;

        // Only show elapsed time for operations exceeding threshold (30s)
        if (elapsed > TIMEOUTS.ELAPSED_TIME_THRESHOLD) {
            const elapsedStr = formatElapsedTime(elapsed);
            return `${detail} (${elapsedStr})`;
        }

        return detail;
    }

    /**
     * Spawn a command with proper shell configuration
     *
     * SECURITY: shell: true usage
     *
     * This method uses shell: true for the following reasons:
     * 1. fnm environment setup requires shell evaluation: eval "$(fnm env)"
     * 2. Command chaining with && for fnm initialization + actual command
     * 3. Commands come from prerequisites.json (controlled configuration file)
     *
     * SAFE because:
     * - All commands originate from prerequisites.json (not user input)
     * - Node versions are validated before reaching this code
     * - File paths would be validated by validateProjectPath() if used
     * - No external API data flows into command strings here
     * - Template variables ({version}) are replaced with validated values
     */
    private spawnCommand(command: string): ChildProcessWithoutNullStreams {
        let actualCommand = command;
        if (command.startsWith('fnm ')) {
            actualCommand = `eval "$(fnm env)" && ${command}`;
        }

        return this.processSpawner(actualCommand, [], {
            shell: true,
            env: {
                ...process.env,
                NO_COLOR: '1',
                FORCE_COLOR: '0',
            },
        });
    }
}

// Re-export formatElapsedTime for backward compatibility with tests
export { formatElapsedTime };
