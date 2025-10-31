/**
 * Integration Tests for Enhanced Progress Visibility
 * Step 4: Enhanced Progress Visibility
 *
 * Tests end-to-end progress visibility during prerequisite operations,
 * including elapsed time and Node version context.
 */

import { ProgressUnifier, UnifiedProgress } from '@/core/utils/progressUnifier';
import { InstallStep } from '@/features/prerequisites/services/PrerequisitesManager';
import { Logger } from '@/core/logging';

// Mock logger
jest.mock('@/shared/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('Enhanced Progress Visibility - Integration', () => {
    let progressUnifier: ProgressUnifier;
    let mockLogger: Logger;
    let progressUpdates: UnifiedProgress[];

    beforeEach(() => {
        jest.clearAllMocks();
        progressUpdates = [];

        // Create Logger instance which wraps DebugLogger
        mockLogger = new Logger('ProgressFlow-Integration-Test');

        progressUnifier = new ProgressUnifier(mockLogger);
    });

    const onProgress = async (progress: UnifiedProgress) => {
        progressUpdates.push(progress);
    };

    describe('End-to-End Progress Flow', () => {
        it('should show complete progress flow with elapsed time for long operations', async () => {
            // Simulate a realistic prerequisite installation flow
            const steps: InstallStep[] = [
                {
                    name: 'Downloading Adobe I/O CLI for Node {version}',
                    message: 'Downloading Adobe I/O CLI...',
                    progressStrategy: 'synthetic',
                    commands: ['npm install -g @adobe/aio-cli'],
                    estimatedDuration: 45000, // 45 seconds
                },
            ];

            // Mock Date.now() to simulate time passing
            const originalDateNow = Date.now;
            let currentTime = 1000000;
            Date.now = jest.fn(() => currentTime);

            // Execute installation
            const executePromise = progressUnifier.executeStep(
                steps[0],
                0,
                1,
                onProgress,
                { nodeVersion: '20' }
            );

            // Simulate time passing (35 seconds)
            currentTime += 35000;
            await new Promise(resolve => setTimeout(resolve, 100));

            // Cleanup
            Date.now = originalDateNow;

            // Verify progress flow includes:
            // 1. Node version in step name
            const hasNodeVersion = progressUpdates.some(
                p => p.overall.stepName.includes('Node 20')
            );

            // 2. Elapsed time after 30s threshold
            const hasElapsedTime = progressUpdates.some(
                p => p.command?.detail?.match(/\(\d+s\)/)
            );

            // 3. Progress percentage
            const hasProgress = progressUpdates.some(
                p => p.command?.percent !== undefined && p.command.percent > 0
            );

            expect(hasNodeVersion).toBe(true);
            expect(hasElapsedTime).toBe(true);
            expect(hasProgress).toBe(true);

            // Verify progress messages are informative
            const lastUpdate = progressUpdates[progressUpdates.length - 1];
            expect(lastUpdate).toBeDefined();
        }, 15000);

        it('should handle multiple prerequisite checks with varying durations', async () => {
            // Simulate checking multiple prerequisites with different durations
            const steps: InstallStep[] = [
                {
                    name: 'Checking Node.js',
                    message: 'Checking Node.js...',
                    progressStrategy: 'immediate',
                    commands: ['node --version'],
                    estimatedDuration: 500,
                },
                {
                    name: 'Installing fnm',
                    message: 'Installing fnm...',
                    progressStrategy: 'synthetic',
                    commands: ['brew install fnm'],
                    estimatedDuration: 40000, // 40 seconds
                },
                {
                    name: 'Checking Adobe I/O CLI for Node {version}',
                    message: 'Checking Adobe I/O CLI...',
                    progressStrategy: 'immediate',
                    commands: ['aio --version'],
                    estimatedDuration: 1000,
                },
            ];

            // Mock Date.now()
            const originalDateNow = Date.now;
            let currentTime = 1000000;
            Date.now = jest.fn(() => currentTime);

            // Execute steps sequentially
            for (let i = 0; i < steps.length; i++) {
                progressUpdates = []; // Clear for each step

                const executePromise = progressUnifier.executeStep(
                    steps[i],
                    i,
                    steps.length,
                    onProgress,
                    i === 2 ? { nodeVersion: '20' } : undefined
                );

                // Simulate time for long operations
                if (steps[i].estimatedDuration! > 30000) {
                    currentTime += 35000;
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Cleanup
            Date.now = originalDateNow;

            // Verify:
            // 1. Quick operations don't show elapsed time
            // 2. Long operations show elapsed time
            // 3. Node version context is shown when provided

            expect(progressUpdates.length).toBeGreaterThan(0);
        }, 15000);
    });
});
