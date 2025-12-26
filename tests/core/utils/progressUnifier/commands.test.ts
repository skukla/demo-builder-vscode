/**
 * Unit Tests for ProgressUnifier - Command Resolution
 *
 * Tests the resolveCommands() method for handling command templates,
 * version substitution, and backward compatibility with static commands.
 */

import { createTestableProgressUnifier } from '../../../helpers/progressUnifierTestHelpers';
import { createMockStep, createProgressCollector, createMockLogger } from './testUtils';

describe('ProgressUnifier - Command Resolution', () => {
    const progressCollectorFactory = createProgressCollector();
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger = createMockLogger();
    });

    describe('Pre-substituted template (no placeholder)', () => {
        it('should execute command when commandTemplate has no {version} placeholder', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks } = createTestableProgressUnifier(mockLogger);

            // Given: commandTemplate with pre-substituted version (no {version} placeholder)
            const step = createMockStep(
                'Installing Node.js 18',
                'Installing Node.js 18...',
                'immediate',
                undefined,  // No command
                500
            );
            delete step.commands; // Remove commands array to use commandTemplate
            step.commandTemplate = 'fnm install 18'; // Pre-substituted, no {version}

            // And: nodeVersion is undefined (already baked into template)
            // When: resolveCommands() is called (via executeStep)
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await executePromise;

            // Then: Command should be executed (spawn called with the pre-substituted command)
            expect(mocks.spawn).toHaveBeenCalledWith(
                expect.stringContaining('fnm install 18'),
                [],
                expect.any(Object)
            );
        });
    });

    describe('Template with placeholder + nodeVersion provided', () => {
        it('should substitute {version} when nodeVersion is provided', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks } = createTestableProgressUnifier(mockLogger);

            // Given: commandTemplate with {version} placeholder
            const step = createMockStep(
                'Installing Node.js {version}',
                'Installing Node.js...',
                'immediate',
                undefined,
                500
            );
            delete step.commands; // Remove commands array to use commandTemplate
            step.commandTemplate = 'fnm install {version}';

            // And: nodeVersion = "20"
            // When: resolveCommands() is called with nodeVersion
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress, { nodeVersion: '20' });
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await executePromise;

            // Then: Command should be executed with substituted version
            expect(mocks.spawn).toHaveBeenCalledWith(
                expect.stringContaining('fnm install 20'),
                [],
                expect.any(Object)
            );
        });
    });

    describe('Template with placeholder but nodeVersion missing', () => {
        it('should NOT execute command when {version} placeholder but no nodeVersion', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks } = createTestableProgressUnifier(mockLogger);

            // Given: commandTemplate with {version} placeholder
            const step = createMockStep(
                'Installing Node.js {version}',
                'Installing Node.js...',
                'immediate',
                undefined,
                500
            );
            delete step.commands; // Remove commands array to use commandTemplate
            step.commandTemplate = 'fnm install {version}';

            // And: nodeVersion is undefined
            // When: resolveCommands() is called without nodeVersion
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await executePromise;

            // Then: Command should NOT be executed (empty array returned)
            expect(mocks.spawn).not.toHaveBeenCalled();
        });
    });

    describe('Static commands array (backward compatibility)', () => {
        it('should use static commands array when provided', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks } = createTestableProgressUnifier(mockLogger);

            // Given: step.commands = ["echo test", "npm install"]
            const step = createMockStep(
                'Running commands',
                'Running commands...',
                'immediate',
                'echo test',  // First command
                500
            );
            step.commands = ['echo test', 'npm install'];
            step.commandTemplate = undefined; // No template

            // When: resolveCommands() is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await executePromise;

            // Then: Both commands should be executed
            expect(mocks.spawn).toHaveBeenCalledTimes(2);
            expect(mocks.spawn).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining('echo test'),
                [],
                expect.any(Object)
            );
            expect(mocks.spawn).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining('npm install'),
                [],
                expect.any(Object)
            );
        });
    });

    describe('Empty commandTemplate', () => {
        it('should NOT execute command when commandTemplate is empty', async () => {
            const { onProgress, progressUpdates } = progressCollectorFactory();
            const { progressUnifier, advanceTime, mocks } = createTestableProgressUnifier(mockLogger);

            // Given: commandTemplate = ""
            const step = createMockStep(
                'Empty command',
                'Empty command...',
                'immediate',
                undefined,
                500
            );
            delete step.commands; // Remove commands array to use commandTemplate
            step.commandTemplate = '';

            // And: nodeVersion is undefined
            // When: resolveCommands() is called
            const executePromise = progressUnifier.executeStep(step, 0, 1, onProgress);
            await new Promise(resolve => setImmediate(resolve));
            await advanceTime(2000);
            await executePromise;

            // Then: Command should NOT be executed
            expect(mocks.spawn).not.toHaveBeenCalled();
        });
    });
});
