/**
 * Shared test utilities for ProgressUnifier tests
 *
 * Provides common mocks, factories, and helpers used across all
 * progressUnifier test files.
 */

import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';
import { UnifiedProgress } from '@/core/utils/progressUnifier';

// Mock logger

/**
 * Create a mock InstallStep for testing
 *
 * @param name Step name
 * @param message Progress message
 * @param strategy Progress tracking strategy
 * @param command Optional command to execute
 * @param estimatedDuration Optional estimated duration in ms
 * @returns Mock InstallStep
 */
export const createMockStep = (
    name: string,
    message: string,
    strategy: 'exact' | 'milestones' | 'synthetic' | 'immediate',
    command?: string,
    estimatedDuration?: number
): InstallStep => ({
    name,
    message,
    progressStrategy: strategy,
    commands: command ? [command] : [],
    estimatedDuration,
});

/**
 * Create a progress callback that collects all progress updates
 *
 * CRITICAL: Returns a factory function, not the progressUpdates array directly.
 * This ensures each test gets a fresh, independent array.
 *
 * @returns Factory that returns {onProgress callback, progressUpdates array}
 */
export const createProgressCollector = () => {
    // Return a function that creates fresh state for each test
    return () => {
        const progressUpdates: UnifiedProgress[] = [];
        const onProgress = async (progress: UnifiedProgress) => {
            progressUpdates.push(progress);
        };
        return { onProgress, progressUpdates };
    };
};

/** Canonical logger fake (ADR-016). */
export { createMockLogger } from '../../../helpers/loggerFake';
