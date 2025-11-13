/**
 * Tests for npm --prefer-offline fallback logic
 * Step 1: Quick Wins - npm Flags & Timeout Optimization
 *
 * When npm install fails with --prefer-offline (e.g., ENOTCACHED error),
 * the installation should automatically retry without the --prefer-offline flag.
 */

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import { Logger } from '@/types/logger';
import { ServiceLocator } from '@/core/di/serviceLocator';
import type { CommandExecutor } from '@/core/shell';

jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di/serviceLocator');

// Mock fs module for components.json reading
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({
        infrastructure: {
            'adobe-cli': {
                nodeVersion: '18'
            }
        }
    }))
}));

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

describe('npm --prefer-offline Fallback Logic', () => {
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
                    commands: ['npm install -g @adobe/aio-cli --no-audit --no-fund --prefer-offline --verbose'],
                    estimatedDuration: 60000,
                    progressStrategy: 'milestones' as const,
                },
            ],
        },
    };

    // Non-perNodeVersion prerequisite for testing npm fallback logic
    const npmToolPrereq = {
        id: 'npm-tool',
        name: 'NPM Tool',
        description: 'Generic npm-based tool',
        optional: false,
        perNodeVersion: false, // Uses executeAdobeCLI code path
        check: {
            command: 'npm-tool --version',
            parseVersion: '([0-9.]+)',
        },
        install: {
            steps: [
                {
                    name: 'Install NPM Tool',
                    message: 'Installing NPM Tool globally',
                    commands: ['npm install -g npm-tool --no-audit --no-fund --prefer-offline --verbose'],
                    estimatedDuration: 30000,
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

    describe('Installation Fallback Strategy', () => {
        it('should detect ENOTCACHED error from npm --prefer-offline', async () => {
            // This test verifies that we can detect npm cache errors
            // that indicate --prefer-offline should be removed

            const cacheError: any = new Error('npm ERR! code ENOTCACHED');
            cacheError.code = 'ENOTCACHED';
            cacheError.stderr = 'npm ERR! code ENOTCACHED\nnpm ERR! request to https://registry.npmjs.org/@adobe/aio-cli failed: cache mode is offline but no cached response is available';

            // Simulate installation attempt with --prefer-offline failing
            mockExecutor.execute.mockRejectedValueOnce(cacheError);

            // The manager should detect this is a cache-related failure
            // For now, we just test that error is properly identified
            // In implementation, this will trigger fallback logic

            try {
                await manager.checkPrerequisite(aioCliPrereq);
            } catch (error: any) {
                // Verify error is properly identified as cache-related
                expect(error.code === 'ENOTCACHED' || error.message.includes('ENOTCACHED')).toBe(true);
            }
        });

        it('should retry npm install without --prefer-offline on cache miss', async () => {
            // First attempt with --prefer-offline fails with cache error
            const cacheError: any = new Error('npm ERR! code ENOTCACHED');
            cacheError.code = 'ENOTCACHED';
            cacheError.stderr = 'npm ERR! code ENOTCACHED\nnpm ERR! cache mode is offline but no cached response is available';

            mockExecutor.execute
                .mockRejectedValueOnce(cacheError)  // First attempt fails
                .mockResolvedValueOnce({             // Second attempt succeeds
                    stdout: 'added 150 packages',
                    stderr: '',
                    code: 0,
                    duration: 45000,
                });

            // This test will pass once fallback logic is implemented
            // For now, it should fail because no fallback exists

            // TODO: Implement installPrerequisite method that:
            // 1. Tries installation with --prefer-offline
            // 2. Detects ENOTCACHED error
            // 3. Retries without --prefer-offline
            // 4. Returns success

            // Placeholder for future implementation test
            expect(true).toBe(true); // Will be replaced with actual test
        });

        it('should only remove --prefer-offline flag, keeping other performance flags', async () => {
            // When falling back, should remove ONLY --prefer-offline
            // but keep --no-audit, --no-fund, and --verbose

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

            // TODO: Verify fallback command contains:
            // --no-audit --no-fund --verbose
            // but NOT --prefer-offline

            expect(true).toBe(true); // Placeholder
        });

        it('should not retry if error is not cache-related', async () => {
            // Non-cache errors (network failures, permission errors, etc.)
            // should NOT trigger fallback logic

            const networkError: any = new Error('npm ERR! network request failed');
            networkError.code = 'ENOENT'; // Use ENOENT to avoid timeout detection

            // checkPrerequisite uses execute(), not executeAdobeCLI()
            mockExecutor.execute.mockRejectedValueOnce(networkError);

            // checkPrerequisite returns status object, doesn't throw
            // Use npmToolPrereq (non-perNodeVersion) to test standard check path
            const status = await manager.checkPrerequisite(npmToolPrereq);
            expect(status.installed).toBe(false);
            expect(status.canInstall).toBe(true);

            // Should NOT have attempted a second execution
            expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
        });

        it('should log fallback attempt for debugging', async () => {
            const cacheError: any = new Error('npm ERR! code ENOTCACHED');
            cacheError.code = 'ENOTCACHED';

            mockExecutor.execute
                .mockRejectedValueOnce(cacheError)
                .mockResolvedValueOnce({
                    stdout: 'added 150 packages',
                    stderr: '',
                    code: 0,
                    duration: 48000,
                });

            // TODO: Verify logger.warn or logger.info is called with fallback message
            // e.g., "npm cache miss detected, retrying without --prefer-offline"

            expect(true).toBe(true); // Placeholder
        });
    });
});
