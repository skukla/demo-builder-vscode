/**
 * Unit Tests for ProgressUnifier - Node Version Handling
 *
 * Tests Node version substitution in step names and progress messages
 * for multi-version prerequisite scenarios.
 */

import { createTestableProgressUnifier } from '../../helpers/progressUnifierTestHelpers';
import { createMockStep, createProgressCollector, createMockLogger } from './progressUnifier.testUtils';

describe('ProgressUnifier - Node Version Handling', () => {
    const progressCollectorFactory = createProgressCollector();
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
    });

    describe('Node version display during checks', () => {
        it('should include Node version in progress message', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Checking Adobe I/O CLI for Node {version}',
                'Checking Adobe I/O CLI...',
                'immediate',
                'aio --version'
            );

            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress, { nodeVersion: '20' });

            // Let spawn complete before advancing time
            await new Promise(resolve => setImmediate(resolve));

            await advanceTime(2000);
            await executePromise;

            // Verify Node version appears in step name
            const progressWithNodeVersion = progressUpdates.find(
                p => p.overall.stepName.includes('Node 20')
            );

            expect(progressWithNodeVersion).toBeDefined();
            expect(progressWithNodeVersion?.overall.stepName).toContain('Node 20');
        });
    });

    describe('Node version display during installation', () => {
        it('should include Node version in installation progress', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Installing Adobe I/O CLI for Node {version}',
                'Installing Adobe I/O CLI...',
                'synthetic',
                'npm install -g @adobe/aio-cli',
                10000
            );

            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress, { nodeVersion: '18' });

            // Let spawn complete before advancing time
            await new Promise(resolve => setImmediate(resolve));

            await advanceTime(12000);
            await executePromise;

            // Verify Node version appears in step name
            const progressWithNodeVersion = progressUpdates.find(
                p => p.overall.stepName.includes('Node 18')
            );

            expect(progressWithNodeVersion).toBeDefined();
            expect(progressWithNodeVersion?.overall.stepName).toContain('Node 18');
        });
    });

    describe('Multiple Node versions', () => {
        it('should switch between Node version labels', async () => {
            const { progressUnifier, advanceTime } = createTestableProgressUnifier(mockLogger);

            const step = createMockStep(
                'Installing for Node {version}',
                'Installing package...',
                'immediate',
                'npm install'
            );

            // Execute for Node 18
            const { onProgress: onProgress18, progressUpdates: progressUpdates18 } = progressCollectorFactory();
            const execute18 = progressUnifier.executeStep(step, 0, 3, onProgress18, { nodeVersion: '18' });
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await execute18;

            const hasNode18 = progressUpdates18.some(
                p => p.overall.stepName.includes('Node 18')
            );

            // Execute for Node 20
            const { onProgress: onProgress20, progressUpdates: progressUpdates20 } = progressCollectorFactory();
            const execute20 = progressUnifier.executeStep(step, 1, 3, onProgress20, { nodeVersion: '20' });
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await execute20;

            const hasNode20 = progressUpdates20.some(
                p => p.overall.stepName.includes('Node 20')
            );

            // Execute for Node 24
            const { onProgress: onProgress24, progressUpdates: progressUpdates24 } = progressCollectorFactory();
            const execute24 = progressUnifier.executeStep(step, 2, 3, onProgress24, { nodeVersion: '24' });
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await execute24;

            const hasNode24 = progressUpdates24.some(
                p => p.overall.stepName.includes('Node 24')
            );

            expect(hasNode18).toBe(true);
            expect(hasNode20).toBe(true);
            expect(hasNode24).toBe(true);
        });
    });
});
