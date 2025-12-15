/**
 * ProgressUnifier
 *
 * Orchestrates progress tracking for install steps using strategy pattern.
 * Delegates to specific strategy implementations based on step configuration.
 */

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { Logger } from '@/core/logging';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';
import {
    IDateProvider,
    ITimerProvider,
    IProcessSpawner,
    UnifiedProgress,
    ProgressHandler,
    ExecutionContext,
} from './types';
import {
    IProgressStrategy,
    StrategyDependencies,
    ExactProgressStrategy,
    MilestoneProgressStrategy,
    SyntheticProgressStrategy,
    ImmediateProgressStrategy,
} from './strategies';
import { ElapsedTimeTracker } from './ElapsedTimeTracker';
import { CommandResolver } from './CommandResolver';

/**
 * ProgressUnifier - Main orchestrator for progress tracking
 *
 * Responsibilities:
 * - Step execution orchestration
 * - Strategy selection and delegation
 * - Command spawning with fnm environment
 * - Elapsed time tracking coordination
 */
export class ProgressUnifier {
    private readonly logger: Logger;
    private readonly dateProvider: IDateProvider;
    private readonly timerProvider: ITimerProvider;
    private readonly processSpawner: IProcessSpawner;

    // Extracted components
    private readonly elapsedTimeTracker: ElapsedTimeTracker;
    private readonly commandResolver: CommandResolver;

    // Strategy instances (stateless, reusable)
    private readonly strategies: Record<string, IProgressStrategy>;

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

        // Initialize extracted components
        this.elapsedTimeTracker = new ElapsedTimeTracker(dateProvider, timerProvider);
        this.commandResolver = new CommandResolver();

        // Initialize strategies
        this.strategies = {
            exact: new ExactProgressStrategy(),
            milestones: new MilestoneProgressStrategy(),
            synthetic: new SyntheticProgressStrategy(),
            immediate: new ImmediateProgressStrategy(),
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
        this.elapsedTimeTracker.start();

        try {
            const commands = this.commandResolver.resolveCommands(step, options);
            const totalCommands = commands.length;

            for (let cmdIndex = 0; cmdIndex < commands.length; cmdIndex++) {
                const command = commands[cmdIndex];
                const stepName = this.commandResolver.resolveStepName(step, options);

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
                            detail: this.elapsedTimeTracker.enhanceDetailWithElapsedTime('Starting...'),
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

                // Create strategy dependencies
                const deps: StrategyDependencies = {
                    timerProvider: this.timerProvider,
                    dateProvider: this.dateProvider,
                    logger: this.logger,
                    spawnCommand: (cmd) => this.spawnCommand(cmd),
                    enhanceDetailWithElapsedTime: (detail) =>
                        this.elapsedTimeTracker.enhanceDetailWithElapsedTime(detail),
                };

                // Select and execute strategy
                const strategy = this.getStrategy(step.progressStrategy);
                await strategy.execute(step, context, onProgress, deps);
            }

            // Final progress update
            await onProgress({
                overall: {
                    percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                    currentStep: stepIndex + 1,
                    totalSteps,
                    stepName: this.commandResolver.resolveStepName(step, options),
                },
            });
        } finally {
            // Always stop the timer when execution completes (success or failure)
            this.elapsedTimeTracker.stop();
        }
    }

    /**
     * Get strategy instance for the given strategy type
     */
    private getStrategy(strategyType: string | undefined): IProgressStrategy {
        const strategy = this.strategies[strategyType || 'synthetic'];
        return strategy || this.strategies.synthetic;
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
     * ✅ All commands originate from prerequisites.json (not user input)
     * ✅ Node versions are validated before reaching this code
     * ✅ File paths would be validated by validateProjectPath() if used
     * ✅ No external API data flows into command strings here
     * ✅ Template variables ({version}) are replaced with validated values
     */
    private spawnCommand(command: string): ChildProcessWithoutNullStreams {
        // Wrap fnm commands with environment initialization
        let actualCommand = command;
        if (command.startsWith('fnm ')) {
            actualCommand = `eval "$(fnm env)" && ${command}`;
        }

        // For complex commands, use shell
        return this.processSpawner(actualCommand, [], {
            shell: true,
            env: {
                ...process.env,
                // Ensure colors are disabled for cleaner parsing
                NO_COLOR: '1',
                FORCE_COLOR: '0',
            },
        });
    }
}
