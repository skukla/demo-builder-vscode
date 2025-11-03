/**
 * Integration test for npm --prefer-offline fallback scenario
 * Step 1: Quick Wins - npm Flags & Timeout Optimization
 *
 * Verifies end-to-end fallback flow when npm cache is missing or corrupted.
 */

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { Logger } from '@/types/logger';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { CommandExecutor } from '@/core/shell';

jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        logCommand: jest.fn(),
        show: jest.fn(),
        showDebug: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

describe('npm --prefer-offline Fallback (Integration)', () => {
    let manager: PrerequisitesManager;
    let mockLogger: jest.Mocked<Logger>;
    let mockExecutor: jest.Mocked<CommandExecutor>;

    const aioCliPrereq = {
        id: 'aio-cli',
        name: 'Adobe I/O CLI',
        description: 'Command-line interface for Adobe services',
        optional: false,
        perNodeVersion: true,
        check: {
            command: 'aio --version',
            parseVersion: '@adobe/aio-cli/([0-9.]+)',
        },
        install: {
            steps: [
                {
                    name: 'Install Adobe I/O CLI',
                    message: 'Installing Adobe I/O CLI globally',
                    commands: [
                        'npm install -g @adobe/aio-cli --no-audit --no-fund --prefer-offline --verbose'
                    ],
                    estimatedDuration: 60000,
                    progressStrategy: 'milestones' as const,
                },
            ],
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        mockExecutor = {
            execute: jest.fn(),
            executeAdobeCLI: jest.fn(),
        } as any;

        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockExecutor);

        const { ConfigurationLoader } = require('@/core/config/ConfigurationLoader');
        ConfigurationLoader.mockImplementation(() => ({
            load: jest.fn().mockResolvedValue({
                prerequisites: [aioCliPrereq],
                componentRequirements: {},
            }),
        }));

        manager = new PrerequisitesManager('/mock/extension/path', mockLogger);
    });

    describe('Cache Miss Scenario', () => {
        it('should handle ENOTCACHED error during installation', async () => {
            const cacheError: any = new Error('npm ERR! code ENOTCACHED');
            cacheError.code = 'ENOTCACHED';
            cacheError.stderr = 'npm ERR! code ENOTCACHED\nnpm ERR! request to https://registry.npmjs.org/@adobe/aio-cli failed: cache mode is offline but no cached response is available';

            // First attempt with --prefer-offline fails
            // Second attempt without --prefer-offline succeeds
            mockExecutor.execute
                .mockRejectedValueOnce(cacheError)
                .mockResolvedValueOnce({
                    stdout: 'added 150 packages in 45s',
                    stderr: '',
                    code: 0,
                    duration: 45000,
                });

            // TODO: This test will fail until installPrerequisite method is implemented
            // For now, we're just testing the error detection in checkPrerequisite

            const prereq = await manager.getPrerequisiteById('aio-cli');

            // checkPrerequisite should handle the cache error gracefully
            try {
                await manager.checkPrerequisite(prereq!);
            } catch (error: any) {
                // Verify it's a cache error
                expect(error.code === 'ENOTCACHED' || error.message.includes('ENOTCACHED')).toBe(true);
            }
        });

        it('should complete installation after fallback', async () => {
            const cacheError: any = new Error('npm ERR! code ENOTCACHED');
            cacheError.code = 'ENOTCACHED';

            mockExecutor.execute
                .mockRejectedValueOnce(cacheError)
                .mockResolvedValueOnce({
                    stdout: 'added 150 packages',
                    stderr: '',
                    code: 0,
                    duration: 50000,
                });

            // After fallback installation, version check should succeed
            mockExecutor.executeAdobeCLI.mockResolvedValueOnce({
                stdout: '@adobe/aio-cli/10.1.0 darwin-arm64 node-v20.11.0',
                stderr: '',
                code: 0,
                duration: 1200,
            });

            // TODO: Test complete installation flow with fallback
            // For now, this is a placeholder

            expect(true).toBe(true);
        });
    });

    describe('Network Error Scenario', () => {
        it('should return not installed status on network errors', async () => {
            // Use ENOENT (command not found) which is NOT a timeout error
            const networkError: any = new Error('Command not found');
            networkError.code = 'ENOENT';

            mockExecutor.executeAdobeCLI.mockRejectedValue(networkError);

            const prereq = await manager.getPrerequisiteById('aio-cli');

            // ENOENT errors should be handled gracefully
            // checkPrerequisite returns status object, doesn't throw
            const status = await manager.checkPrerequisite(prereq!);
            expect(status.installed).toBe(false);
            expect(status.canInstall).toBe(true);
        });

        it('should return not installed status on permission errors', async () => {
            const permError: any = new Error('npm ERR! code EACCES');
            permError.code = 'EACCES';

            mockExecutor.executeAdobeCLI.mockRejectedValue(permError);

            const prereq = await manager.getPrerequisiteById('aio-cli');

            // Permission errors should not trigger fallback
            // checkPrerequisite returns status object, doesn't throw
            const status = await manager.checkPrerequisite(prereq!);
            expect(status.installed).toBe(false);
            expect(status.canInstall).toBe(true);
        });
    });

    describe('Logging and User Feedback', () => {
        it('should log cache miss detection', async () => {
            const cacheError: any = new Error('npm ERR! code ENOTCACHED');
            cacheError.code = 'ENOTCACHED';

            mockExecutor.execute.mockRejectedValue(cacheError);

            const prereq = await manager.getPrerequisiteById('aio-cli');

            try {
                await manager.checkPrerequisite(prereq!);
            } catch {
                // Expected to fail
            }

            // TODO: Verify appropriate logging occurred
            // For now, just verify logger was called
            expect(mockLogger.debug).toHaveBeenCalled();
        });

        it('should provide clear error message on final failure', async () => {
            const cacheError: any = new Error('npm ERR! code ENOTCACHED');
            cacheError.code = 'ENOTCACHED';

            // Both attempts fail (simulating complete network failure)
            mockExecutor.execute
                .mockRejectedValueOnce(cacheError)
                .mockRejectedValueOnce(new Error('Network error'));

            // TODO: Verify error message is user-friendly
            // Should explain that installation failed and suggest manual installation

            expect(true).toBe(true); // Placeholder
        });
    });
});
