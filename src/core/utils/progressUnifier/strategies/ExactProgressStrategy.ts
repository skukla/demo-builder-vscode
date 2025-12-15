/**
 * ExactProgressStrategy
 *
 * Progress strategy that parses exact progress percentages from command output.
 * Used for tools like fnm that report download/install progress directly.
 */

import { ProgressHandler, ExecutionContext } from '../types';
import { IProgressStrategy, StrategyDependencies } from './IProgressStrategy';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';

/**
 * Exact progress strategy implementation
 *
 * Parses real progress percentages from command stdout.
 * Supports fnm-specific parsing and generic percentage matching.
 */
export class ExactProgressStrategy implements IProgressStrategy {
    /**
     * Execute a command and parse exact progress from output
     */
    async execute(
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
        deps: StrategyDependencies,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = deps.spawnCommand(context.command);
            let lastDetail = '';
            const isFnmParser = step.progressParser === 'fnm';

            child.stdout.on('data', async (data) => {
                const output = data.toString();

                if (isFnmParser) {
                    await this.parseFnmOutput(
                        output,
                        step,
                        context,
                        onProgress,
                        lastDetail,
                        (detail) => { lastDetail = detail; },
                    );
                } else {
                    await this.parseGenericOutput(
                        output,
                        step,
                        context,
                        onProgress,
                        lastDetail,
                        (detail) => { lastDetail = detail; },
                    );
                }

                deps.logger.info(`[${step.name}] ${output.trim()}`);
            });

            child.stderr.on('data', (data) => {
                deps.logger.warn(`[${step.name}] ${data.toString().trim()}`);
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
     * fnm outputs lines like "Downloading: 75%" or "Installing Node v20.11.0"
     */
    private async parseFnmOutput(
        output: string,
        step: InstallStep,
        context: ExecutionContext,
        onProgress: ProgressHandler,
        lastDetail: string,
        setLastDetail: (detail: string) => void,
    ): Promise<void> {
        const trimmedOutput = output.trim();

        // Skip empty lines
        if (!trimmedOutput) {
            return;
        }

        // Look for percentage progress (e.g., "Downloading: 75%")
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
            // Non-percentage updates (e.g., "Installing Node v20.11.0", "Extracting...")
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
        step: InstallStep,
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
}
