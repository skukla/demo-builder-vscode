import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { InstallStep, ProgressMilestone } from './prerequisitesManager';
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
                    await this.executeWithExactProgress(command, step, stepIndex, totalSteps, onProgress);
                    break;
                case 'milestones':
                    await this.executeWithMilestones(command, step, stepIndex, totalSteps, onProgress);
                    break;
                case 'immediate':
                    await this.executeImmediate(command, step, stepIndex, totalSteps, onProgress);
                    break;
                default:
                    await this.executeWithSyntheticProgress(command, step, stepIndex, totalSteps, onProgress);
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
        if (step.commands) {
            return step.commands;
        }
        
        if (step.commandTemplate && options?.nodeVersion) {
            return [step.commandTemplate.replace(/{version}/g, options.nodeVersion)];
        }
        
        return [];
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
        onProgress: ProgressHandler
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
                                stepName: step.name
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
        onProgress: ProgressHandler
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = this.spawnCommand(command);
            const milestones = step.milestones || [];
            let currentProgress = 0;
            let outputBuffer = '';
            
            const checkMilestones = async (text: string) => {
                for (const milestone of milestones) {
                    if (text.includes(milestone.pattern) && milestone.progress > currentProgress) {
                        currentProgress = milestone.progress;
                        
                        await onProgress({
                            overall: {
                                percent: Math.round(((stepIndex + (currentProgress / 100)) / totalSteps) * 100),
                                currentStep: stepIndex + 1,
                                totalSteps,
                                stepName: step.name
                            },
                            command: {
                                type: 'determinate',
                                percent: currentProgress,
                                detail: milestone.message || text.trim().substring(0, 100),
                                confidence: 'estimated'
                            }
                        });
                        break;
                    }
                }
            };
            
            child.stdout.on('data', async (data) => {
                const output = data.toString();
                outputBuffer += output;
                await checkMilestones(output);
                this.logger.info(`[${step.name}] ${output.trim()}`);
            });
            
            child.stderr.on('data', async (data) => {
                const output = data.toString();
                outputBuffer += output;
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
        onProgress: ProgressHandler
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
        onProgress: ProgressHandler
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
            
            child.on('close', async (code) => {
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
                        confidence: 'exact'
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
     * Spawn a command with proper shell configuration
     */
    private spawnCommand(command: string): ChildProcessWithoutNullStreams {
        // For complex commands, use shell
        return spawn(command, [], {
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