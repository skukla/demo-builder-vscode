/**
 * Milestone progress: output patterns mapped to predefined progress points.
 *
 * Used for tools like brew and npm, whose output has recognisable phases but no
 * percentage. Moved out of ProgressUnifier.ts by EDS-8 (2026-10-08); unchanged.
 */

import type { ExecutionContext, ProgressHandler, ProgressReporterDeps } from './types';
import type { InstallStep } from '@/types/prerequisites';

/**
 * Milestone progress: Match output patterns to predefined progress milestones
 * Used for tools like brew, npm where progress can be estimated from output patterns.
 */
export async function executeMilestones(
    deps: ProgressReporterDeps,
    step: InstallStep,
    context: ExecutionContext,
    onProgress: ProgressHandler,
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
            deps.logger.trace(`[${context.stepName}] ${output.trim()}`);
        });

        child.stderr.on('data', async (data) => {
            const output = data.toString();
            await checkMilestones(output);
            deps.logger.trace(`[${context.stepName}] ${output.trim()}`);
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
