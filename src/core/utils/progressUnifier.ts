import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { Logger } from '@/core/logging';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * Date provider interface for dependency injection
 * Allows tests to control time for testing elapsed time display
 */
export interface IDateProvider {
    now(): number;
}

/**
 * Timer provider interface for dependency injection
 * Allows tests to control timers and time advancement
 */
export interface ITimerProvider {
    setInterval(callback: () => void, ms: number): NodeJS.Timeout;
    clearInterval(timeout: NodeJS.Timeout): void;
    setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
    clearTimeout(timeout: NodeJS.Timeout): void;
}

/**
 * Process spawner interface for dependency injection
 * Allows tests to mock child process creation
 */
export type IProcessSpawner = typeof spawn;

export interface UnifiedProgress {
    overall: {
        percent: number;
        currentStep: number;
        totalSteps: number;
        stepName: string;
    };
    command?: {
        type: 'determinate' | 'indeterminate';
        percent?: number;
        detail?: string;
        confidence: 'exact' | 'estimated' | 'synthetic';
        currentMilestoneIndex?: number;
        totalMilestones?: number;
    };
}

type ProgressHandler = (progress: UnifiedProgress) => Promise<void>;

/**
 * Threshold in milliseconds for showing elapsed time in progress messages
 * Only operations exceeding this duration will display elapsed time
 */
const ELAPSED_TIME_THRESHOLD_MS = 30000; // 30 seconds

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

export class ProgressUnifier {
    private logger: Logger;
    private startTime: number | undefined;
    private timer: NodeJS.Timeout | undefined;

    // Injected dependencies (private for encapsulation)
    private readonly dateProvider: IDateProvider;
    private readonly timerProvider: ITimerProvider;
    private readonly processSpawner: IProcessSpawner;

    constructor(
        logger: Logger,
        // Optional dependencies with production defaults
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
     * Enhance progress detail with elapsed time if operation exceeds threshold
     */
    private enhanceDetailWithElapsedTime(detail: string): string {
        if (!this.startTime) {
            return detail;
        }

        const elapsed = this.dateProvider.now() - this.startTime;

        // Only show elapsed time for operations exceeding threshold (30s)
        if (elapsed > ELAPSED_TIME_THRESHOLD_MS) {
            const elapsedStr = formatElapsedTime(elapsed);
            return `${detail} (${elapsedStr})`;
        }

        return detail;
    }

    /**
     * Start elapsed time timer
     */
    private startElapsedTimer() {
        this.startTime = this.dateProvider.now();
        this.timer = undefined; // Will be set by individual progress strategies
    }

    /**
     * Stop elapsed time timer and cleanup
     */
    private stopElapsedTimer() {
        if (this.timer) {
            this.timerProvider.clearInterval(this.timer);
            this.timer = undefined;
        }
        this.startTime = undefined;
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
        this.startElapsedTimer();

        try {
            const commands = this.resolveCommands(step, options);
            const totalCommands = commands.length;

            for (let cmdIndex = 0; cmdIndex < commands.length; cmdIndex++) {
                const command = commands[cmdIndex];

                // Calculate overall progress
                const stepProgress = ((stepIndex + (cmdIndex / totalCommands)) / totalSteps) * 100;

                // Initial progress update
                await onProgress({
                    overall: {
                        percent: Math.round(stepProgress),
                        currentStep: stepIndex + 1,
                        totalSteps,
                        stepName: this.resolveStepName(step, options),
                    },
                    command: {
                        type: 'indeterminate',
                        detail: this.enhanceDetailWithElapsedTime('Starting...'),
                        confidence: 'synthetic',
                    },
                });

                // Execute based on strategy
                switch (step.progressStrategy) {
                    case 'exact':
                        await this.executeWithExactProgress(command, step, stepIndex, totalSteps, onProgress, options);
                        break;
                    case 'milestones':
                        await this.executeWithMilestones(command, step, stepIndex, totalSteps, onProgress, options);
                        break;
                    case 'immediate':
                        await this.executeImmediate(command, step, stepIndex, totalSteps, onProgress, options);
                        break;
                    default:
                        await this.executeWithSyntheticProgress(command, step, stepIndex, totalSteps, onProgress, options);
                }
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
            // Always stop the timer when execution completes (success or failure)
            this.stopElapsedTimer();
        }
    }
    
    private resolveCommands(step: InstallStep, options?: { nodeVersion?: string }): string[] {
        let commands: string[] = [];
        if (step.commands) {
            commands = step.commands;
        } else if (step.commandTemplate && options?.nodeVersion) {
            commands = [step.commandTemplate.replace(/{version}/g, options.nodeVersion)];
        }

        // If a specific Node version is requested and the command isn't already using fnm,
        // run the command under that version using `fnm exec --using <version>`.
        if (options?.nodeVersion && commands.length > 0) {
            commands = commands.map(cmd => {
                if (cmd.startsWith('fnm ')) return cmd;
                return `fnm exec --using ${options.nodeVersion} ${cmd}`;
            });
        }

        return commands;
    }
    
    private resolveStepName(step: InstallStep, options?: { nodeVersion?: string }): string {
        if (options?.nodeVersion) {
            return step.name.replace(/{version}/g, options.nodeVersion);
        }
        return step.name;
    }
    
    /**
     * Execute with exact progress parsing (e.g., fnm)
     */
    private async executeWithExactProgress(
        command: string,
        step: InstallStep,
        stepIndex: number,
        totalSteps: number,
        onProgress: ProgressHandler,
        options?: { nodeVersion?: string },
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(command);
            let lastProgress = 0;
            
            child.stdout.on('data', async (data) => {
                const output = data.toString();
                
                // Parse fnm-style progress: "Downloading: 75%"
                const percentMatch = output.match(/(\d+)%/);
                if (percentMatch) {
                    const percent = parseInt(percentMatch[1]);
                    if (percent !== lastProgress) {
                        lastProgress = percent;
                        
                        await onProgress({
                            overall: {
                                percent: Math.round(((stepIndex + (percent / 100)) / totalSteps) * 100),
                                currentStep: stepIndex + 1,
                                totalSteps,
                                stepName: this.resolveStepName(step, options),
                            },
                            command: {
                                type: 'determinate',
                                percent,
                                detail: output.trim(),
                                confidence: 'exact',
                            },
                        });
                    }
                }
                
                this.logger.info(`[${step.name}] ${output.trim()}`);
            });
            
            child.stderr.on('data', (data) => {
                this.logger.warn(`[${step.name}] ${data.toString().trim()}`);
            });
            
            child.on('close', (code) => {
                if (code === 0 || step.continueOnError) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with code ${code}: ${command}`));
                }
            });
        });
    }
    
    /**
     * Execute with milestone-based progress (e.g., brew, npm)
     */
    private async executeWithMilestones(
        command: string,
        step: InstallStep,
        stepIndex: number,
        totalSteps: number,
        onProgress: ProgressHandler,
        options?: { nodeVersion?: string },
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(command);
            const milestones = step.milestones || [];
            let currentProgress = 0;
            let currentMilestoneIndex = 0;
            
            const checkMilestones = async (text: string) => {
                for (let i = 0; i < milestones.length; i++) {
                    const milestone = milestones[i];
                    if (text.includes(milestone.pattern) && milestone.progress > currentProgress) {
                        currentProgress = milestone.progress;
                        currentMilestoneIndex = i + 1; // 1-based for display
                        
                        await onProgress({
                            overall: {
                                percent: Math.round(((stepIndex + (currentProgress / 100)) / totalSteps) * 100),
                                currentStep: stepIndex + 1,
                                totalSteps,
                                stepName: this.resolveStepName(step, options),
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
                this.logger.info(`[${step.name}] ${output.trim()}`);
            });
            
            child.stderr.on('data', async (data) => {
                const output = data.toString();
                await checkMilestones(output);
                this.logger.warn(`[${step.name}] ${output.trim()}`);
            });
            
            child.on('close', (code) => {
                if (code === 0 || step.continueOnError) {
                    resolve();
                } else {
                    reject(new Error(`Command failed with code ${code}: ${command}`));
                }
            });
        });
    }
    
    /**
     * Execute with synthetic time-based progress
     */
    private async executeWithSyntheticProgress(
        command: string,
        step: InstallStep,
        stepIndex: number,
        totalSteps: number,
        onProgress: ProgressHandler,
        options?: { nodeVersion?: string },
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(command);
            const startTime = this.dateProvider.now();
            const estimatedDuration = step.estimatedDuration || 10000;

            // Update progress every second
            const progressInterval = this.timerProvider.setInterval(async () => {
                const elapsed = this.dateProvider.now() - startTime;
                const progress = Math.min(95, (elapsed / estimatedDuration) * 100);

                const baseDetail = `Processing... (${Math.round(progress)}% estimated)`;

                await onProgress({
                    overall: {
                        percent: Math.round(((stepIndex + (progress / 100)) / totalSteps) * 100),
                        currentStep: stepIndex + 1,
                        totalSteps,
                        stepName: this.resolveStepName(step, options),
                    },
                    command: {
                        type: 'indeterminate',
                        percent: Math.round(progress),
                        detail: this.enhanceDetailWithElapsedTime(baseDetail),
                        confidence: 'synthetic',
                    },
                });
            }, 1000);

            child.stdout.on('data', (data) => {
                this.logger.info(`[${step.name}] ${data.toString().trim()}`);
            });

            child.stderr.on('data', (data) => {
                this.logger.warn(`[${step.name}] ${data.toString().trim()}`);
            });

            child.on('close', async (code) => {
                this.timerProvider.clearInterval(progressInterval);

                // Final update
                await onProgress({
                    overall: {
                        percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                        currentStep: stepIndex + 1,
                        totalSteps,
                        stepName: this.resolveStepName(step, options),
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
                    reject(new Error(`Command failed with code ${code}: ${command}`));
                }
            });
        });
    }
    
    /**
     * Execute immediate commands (very fast operations)
     */
    private async executeImmediate(
        command: string,
        step: InstallStep,
        stepIndex: number,
        totalSteps: number,
        onProgress: ProgressHandler,
        options?: { nodeVersion?: string },
    ): Promise<void> {
        // Special handling for internal commands
        if (command === 'configureFnmShell') {
            // This would be handled by the main process
            await onProgress({
                overall: {
                    percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                    currentStep: stepIndex + 1,
                    totalSteps,
                    stepName: step.name,
                },
                command: {
                    type: 'determinate',
                    percent: 100,
                    detail: 'Configuring shell...',
                    confidence: 'exact',
                },
            });
            return;
        }
        
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(command);
            const estimatedDuration = step.estimatedDuration || 500;
            const minDuration = Math.min(estimatedDuration, 1000); // Cap at 1 second for immediate operations
            const startTime = this.dateProvider.now();
            let commandCompleted = false;
            let commandExitCode: number | null = null;

            // Create smooth progress updates (skip initial 0% to avoid blip)
            const progressSteps = [
                { time: minDuration * 0.2, percent: 20, detail: 'Processing...' },
                { time: minDuration * 0.5, percent: 50, detail: 'Configuring...' },
                { time: minDuration * 0.8, percent: 80, detail: 'Finishing...' },
            ];

            const progressTimeouts: NodeJS.Timeout[] = [];

            // Schedule progress updates
            progressSteps.forEach(({ time, percent, detail }) => {
                const timeout = this.timerProvider.setTimeout(async () => {
                    if (!commandCompleted) {
                        await onProgress({
                            overall: {
                                percent: Math.round(((stepIndex + (percent / 100)) / totalSteps) * 100),
                                currentStep: stepIndex + 1,
                                totalSteps,
                                stepName: this.resolveStepName(step, options),
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

                // Calculate how long we should wait before showing completion
                const elapsed = this.dateProvider.now() - startTime;
                const remainingTime = Math.max(0, minDuration - elapsed);

                // Wait for minimum duration to ensure smooth transition
                this.timerProvider.setTimeout(async () => {
                    await onProgress({
                        overall: {
                            percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                            currentStep: stepIndex + 1,
                            totalSteps,
                            stepName: this.resolveStepName(step, options),
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
                        reject(new Error(`Command failed with code ${commandExitCode}: ${command}`));
                    }
                }, remainingTime);
            });
        });
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
     *
     * VALIDATION APPLIED:
     * - Node versions: Checked to be valid fnm versions before use
     * - Commands: Hardcoded in prerequisites.json configuration
     * - Paths: Would be validated by prerequisitesManager if present
     *
     * EXAMPLES of commands processed:
     * - "fnm install 20.11.0" (version from validated input)
     * - "fnm exec --using 20.11.0 npm install" (version validated)
     * - "brew install git" (command from config)
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