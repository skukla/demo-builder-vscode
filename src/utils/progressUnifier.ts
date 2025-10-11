import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { InstallStep } from './prerequisitesManager';
import { Logger } from './logger';

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

interface ProgressHandler {
    (progress: UnifiedProgress): Promise<void>;
}

export class ProgressUnifier {
    private logger: Logger;
    
    constructor(logger: Logger) {
        this.logger = logger;
    }
    
    /**
     * Execute a step with unified progress reporting
     */
    async executeStep(
        step: InstallStep,
        stepIndex: number,
        totalSteps: number,
        onProgress: ProgressHandler,
        options?: { nodeVersion?: string }
    ): Promise<void> {
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
                    stepName: this.resolveStepName(step, options)
                },
                command: {
                    type: 'indeterminate',
                    detail: 'Starting...',
                    confidence: 'synthetic'
                }
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
                stepName: this.resolveStepName(step, options)
            }
        });
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
        options?: { nodeVersion?: string }
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
                                stepName: this.resolveStepName(step, options)
                            },
                            command: {
                                type: 'determinate',
                                percent,
                                detail: output.trim(),
                                confidence: 'exact'
                            }
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
        options?: { nodeVersion?: string }
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
                                stepName: this.resolveStepName(step, options)
                            },
                            command: {
                                type: 'determinate',
                                percent: currentProgress,
                                detail: milestone.message || text.trim().substring(0, 100),
                                confidence: 'estimated',
                                currentMilestoneIndex,
                                totalMilestones: milestones.length
                            }
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
        _options?: { nodeVersion?: string }
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(command);
            const startTime = Date.now();
            const estimatedDuration = step.estimatedDuration || 10000;
            
            // Update progress every second
            const progressInterval = setInterval(async () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(95, (elapsed / estimatedDuration) * 100);
                
                await onProgress({
                    overall: {
                        percent: Math.round(((stepIndex + (progress / 100)) / totalSteps) * 100),
                        currentStep: stepIndex + 1,
                        totalSteps,
                        stepName: step.name
                    },
                    command: {
                        type: 'indeterminate',
                        percent: Math.round(progress),
                        detail: `Processing... (${Math.round(progress)}% estimated)`,
                        confidence: 'synthetic'
                    }
                });
            }, 1000);
            
            child.stdout.on('data', (data) => {
                this.logger.info(`[${step.name}] ${data.toString().trim()}`);
            });
            
            child.stderr.on('data', (data) => {
                this.logger.warn(`[${step.name}] ${data.toString().trim()}`);
            });
            
            child.on('close', async (code) => {
                clearInterval(progressInterval);
                
                // Final update
                await onProgress({
                    overall: {
                        percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                        currentStep: stepIndex + 1,
                        totalSteps,
                        stepName: step.name
                    },
                    command: {
                        type: 'determinate',
                        percent: 100,
                        detail: 'Complete',
                        confidence: 'synthetic'
                    }
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
        options?: { nodeVersion?: string }
    ): Promise<void> {
        // Special handling for internal commands
        if (command === 'configureFnmShell') {
            // This would be handled by the main process
            await onProgress({
                overall: {
                    percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                    currentStep: stepIndex + 1,
                    totalSteps,
                    stepName: step.name
                },
                command: {
                    type: 'determinate',
                    percent: 100,
                    detail: 'Configuring shell...',
                    confidence: 'exact'
                }
            });
            return;
        }
        
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(command);
            const estimatedDuration = step.estimatedDuration || 500;
            const minDuration = Math.min(estimatedDuration, 1000); // Cap at 1 second for immediate operations
            const startTime = Date.now();
            let commandCompleted = false;
            let commandExitCode: number | null = null;
            
            // Create smooth progress updates (skip initial 0% to avoid blip)
            const progressSteps = [
                { time: minDuration * 0.2, percent: 20, detail: 'Processing...' },
                { time: minDuration * 0.5, percent: 50, detail: 'Configuring...' },
                { time: minDuration * 0.8, percent: 80, detail: 'Finishing...' }
            ];
            
            const progressTimeouts: NodeJS.Timeout[] = [];
            
            // Schedule progress updates
            progressSteps.forEach(({ time, percent, detail }) => {
                const timeout = setTimeout(async () => {
                    if (!commandCompleted) {
                        await onProgress({
                            overall: {
                                percent: Math.round(((stepIndex + (percent / 100)) / totalSteps) * 100),
                                currentStep: stepIndex + 1,
                                totalSteps,
                                stepName: this.resolveStepName(step, options)
                            },
                            command: {
                                type: 'determinate',
                                percent,
                                detail,
                                confidence: 'exact'
                            }
                        });
                    }
                }, time);
                progressTimeouts.push(timeout);
            });
            
            child.on('close', async (code) => {
                commandCompleted = true;
                commandExitCode = code;
                
                // Clear any pending progress updates
                progressTimeouts.forEach(timeout => clearTimeout(timeout));
                
                // Calculate how long we should wait before showing completion
                const elapsed = Date.now() - startTime;
                const remainingTime = Math.max(0, minDuration - elapsed);
                
                // Wait for minimum duration to ensure smooth transition
                setTimeout(async () => {
                    await onProgress({
                        overall: {
                            percent: Math.round(((stepIndex + 1) / totalSteps) * 100),
                            currentStep: stepIndex + 1,
                            totalSteps,
                            stepName: this.resolveStepName(step, options)
                        },
                        command: {
                            type: 'determinate',
                            percent: 100,
                            detail: 'Complete',
                            confidence: 'exact'
                        }
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
     */
    private spawnCommand(command: string): ChildProcessWithoutNullStreams {
        // Wrap fnm commands with environment initialization
        let actualCommand = command;
        if (command.startsWith('fnm ')) {
            actualCommand = `eval "$(fnm env)" && ${command}`;
        }
        
        // For complex commands, use shell
        return spawn(actualCommand, [], {
            shell: true,
            env: {
                ...process.env,
                // Ensure colors are disabled for cleaner parsing
                NO_COLOR: '1',
                FORCE_COLOR: '0'
            }
        });
    }
}