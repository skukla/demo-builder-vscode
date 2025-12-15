/**
 * MilestoneProgressStrategy
 *
 * Progress strategy that matches command output against predefined milestones.
 * Used for tools like brew, npm where progress can be estimated from output patterns.
 */

import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';
import { ProgressHandler, ExecutionContext } from '../types';
import { IProgressStrategy, StrategyDependencies } from './IProgressStrategy';

/**
 * Milestone progress strategy implementation
 *
 * Matches output text against milestone patterns to estimate progress.
 * Each milestone has a pattern to match and a progress percentage.
 */
export class MilestoneProgressStrategy implements IProgressStrategy {
    /**
     * Execute a command and track progress via milestone matching
     */
    async execute(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
        deps: StrategyDependencies
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = deps.spawnCommand(context.command);
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
                deps.logger.info(`[${step.name}] ${output.trim()}`);
            });

            child.stderr.on('data', async (data) => {
                const output = data.toString();
                await checkMilestones(output);
                deps.logger.warn(`[${step.name}] ${output.trim()}`);
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
}
