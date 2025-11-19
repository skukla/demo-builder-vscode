/**
 * Tests for PrerequisitesManager - Prerequisite Checking
 * Tests checkPrerequisite, checkMultipleNodeVersions, checkVersionSatisfaction
 */

// Mock debugLogger FIRST to prevent "Logger not initialized" errors
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('@/core/config/ConfigurationLoader');
jest.mock('@/core/di');

import { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import {
    setupMocks,
    setupConfigLoader,
    createPerNodePrerequisite,
    createStandardPrerequisite,
    mockConfig,
    type TestMocks,
} from './PrerequisitesManager.testUtils';

describe('PrerequisitesManager - Prerequisite Checking', () => {
    let manager: PrerequisitesManager;
    let mocks: TestMocks;

    beforeEach(() => {
        mocks = setupMocks();
        setupConfigLoader();
        manager = new PrerequisitesManager('/mock/extension/path', mocks.logger);
    });

    describe('checkPrerequisite', () => {
        it('should check prerequisite and return installed status', async () => {
            mocks.executor.execute.mockResolvedValue({
                stdout: 'v18.0.0',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // Add parseVersion to extract version from stdout
            const prereq = {
                ...mockConfig.prerequisites[0],
                check: {
                    command: 'node',
                    args: ['--version'],
                    parseVersion: 'v(\\d+\\.\\d+\\.\\d+)',
                },
            };
            const result = await manager.checkPrerequisite(prereq);

            expect(result.installed).toBe(true);
            expect(result.version).toBe('18.0.0');
            expect(mocks.executor.execute).toHaveBeenCalled();
        });

        it('should return not installed when command fails', async () => {
            // When command is not found, execute() throws ENOENT error
            const error: NodeJS.ErrnoException = new Error('Command not found');
            error.code = 'ENOENT';
            mocks.executor.execute.mockRejectedValue(error);

            const prereq = mockConfig.prerequisites[0]; // node
            const result = await manager.checkPrerequisite(prereq);

            expect(result.installed).toBe(false);
        });

        it('should handle timeout errors', async () => {
            mocks.executor.execute.mockRejectedValue(
                Object.assign(new Error('Timeout'), { name: 'TimeoutError' })
            );

            const prereq = mockConfig.prerequisites[0]; // node

            // Error message includes prereq name and timeout duration
            // Step 1: Reduced timeout from 60s to 10s for faster failure feedback
            await expect(manager.checkPrerequisite(prereq)).rejects.toThrow('Node.js check timed out after 10 seconds');
        });

        it('should extract version from stdout', async () => {
            mocks.executor.execute.mockResolvedValue({
                stdout: 'Node.js v20.10.0\n',
                stderr: '',
                code: 0,
                duration: 75,
            });

            // Add parseVersion to extract version from stdout
            const prereq = {
                ...mockConfig.prerequisites[0],
                check: {
                    command: 'node',
                    args: ['--version'],
                    parseVersion: 'v(\\d+\\.\\d+\\.\\d+)',
                },
            };
            const result = await manager.checkPrerequisite(prereq);

            expect(result.installed).toBe(true);
            expect(result.version).toBe('20.10.0');
        });
    });

    describe('checkMultipleNodeVersions', () => {
        it('should execute fnm list with shell option in PrerequisitesManager', async () => {
            // Mock fnm list command to return installed versions
            mocks.executor.execute.mockResolvedValue({
                stdout: 'v18.20.8\nv20.19.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            const mapping = {
                '18': 'react-app',
                '20': 'commerce-paas',
            };

            await manager.checkMultipleNodeVersions(mapping);

            // Verify fnm list was called with shell option
            expect(mocks.executor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({
                shell: expect.any(String), // Expects shell path (e.g., '/bin/bash')
                timeout: expect.any(Number),
            }));
        });

        it('should check multiple Node versions', async () => {
            // Mock fnm list command to return installed versions
            mocks.executor.execute.mockResolvedValue({
                stdout: 'v18.20.8\nv20.19.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            const mapping = {
                '18': 'react-app',
                '20': 'commerce-paas',
            };

            const result = await manager.checkMultipleNodeVersions(mapping);

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({
                version: 'Node 18.20.8',
                component: 'react-app',
                installed: true,
            });
            expect(result[1]).toMatchObject({
                version: 'Node 20.19.5',
                component: 'commerce-paas',
                installed: true,
            });
            expect(mocks.executor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({ shell: expect.any(String) }));
        });

        it('should detect missing Node versions', async () => {
            // Mock fnm list command to return only Node 18
            mocks.executor.execute.mockResolvedValue({
                stdout: 'v18.20.8\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            const mapping = {
                '18': 'react-app',
                '20': 'commerce-paas',
            };

            const result = await manager.checkMultipleNodeVersions(mapping);

            expect(result).toHaveLength(2);
            expect(result[0].installed).toBe(true);
            expect(result[0].version).toBe('Node 18.20.8');
            expect(result[1].installed).toBe(false);
            expect(result[1].version).toBe('Node 20'); // No full version available
            expect(mocks.executor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({ shell: expect.any(String) }));
        });

        it('should handle empty mapping', async () => {
            const result = await manager.checkMultipleNodeVersions({});

            expect(result).toEqual([]);
        });

        it('should handle ENOENT errors in PrerequisitesManager gracefully', async () => {
            const enoentError: NodeJS.ErrnoException = new Error('spawn fnm ENOENT');
            enoentError.code = 'ENOENT';
            mocks.executor.execute.mockRejectedValue(enoentError);

            const mapping = {
                '18': 'react-app',
                '20': 'commerce-paas',
            };

            const result = await manager.checkMultipleNodeVersions(mapping);

            // Should return all as not installed
            expect(result).toHaveLength(2);
            expect(result[0].installed).toBe(false);
            expect(result[1].installed).toBe(false);
            // Verify fnm list was attempted with shell option
            expect(mocks.executor.execute).toHaveBeenCalledWith('fnm list', expect.objectContaining({ shell: expect.any(String) }));
        });
    });

    describe('checkVersionSatisfaction', () => {
        it('should return true when version family is satisfied', async () => {
            // Given: Node 24.0.10 installed, requirement is 24.x
            mocks.executor.execute.mockResolvedValueOnce({
                stdout: 'v24.0.10\nv18.19.0\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: checkVersionSatisfaction('24') called
            const satisfied = await manager.checkVersionSatisfaction('24');

            // Then: Returns true (no installation needed)
            expect(satisfied).toBe(true);
        });

        it('should return false when no version satisfies', async () => {
            // Given: Only Node 18.x installed, requirement is 24.x
            mocks.executor.execute.mockResolvedValueOnce({
                stdout: 'v18.19.0\nv20.10.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: checkVersionSatisfaction('24') called
            const satisfied = await manager.checkVersionSatisfaction('24');

            // Then: Returns false (installation needed)
            expect(satisfied).toBe(false);
        });

        it('should handle multiple versions in same family', async () => {
            // Given: Multiple Node 18.x versions installed
            mocks.executor.execute.mockResolvedValueOnce({
                stdout: 'v18.19.0\nv18.20.8\nv20.10.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: checkVersionSatisfaction('18') called
            const satisfied = await manager.checkVersionSatisfaction('18');

            // Then: Returns true (any 18.x satisfies)
            expect(satisfied).toBe(true);
        });

        it('should return false when fnm list is empty', async () => {
            // Given: No Node versions installed
            mocks.executor.execute.mockResolvedValueOnce({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: checkVersionSatisfaction('24') called
            const satisfied = await manager.checkVersionSatisfaction('24');

            // Then: Returns false
            expect(satisfied).toBe(false);
        });

        it('should handle fnm list failure gracefully', async () => {
            // Given: fnm list command fails
            const enoentError: NodeJS.ErrnoException = new Error('spawn fnm ENOENT');
            enoentError.code = 'ENOENT';
            mocks.executor.execute.mockRejectedValueOnce(enoentError);

            // When: checkVersionSatisfaction('24') called
            const satisfied = await manager.checkVersionSatisfaction('24');

            // Then: Returns false (safe default)
            expect(satisfied).toBe(false);
        });

        it('should reject invalid version family input (security)', async () => {
            // SECURITY TEST: Prevent injection attacks via malicious version family
            // Given: Malicious inputs that could cause injection
            const maliciousInputs = [
                '24; rm -rf /',          // Command injection attempt
                '24 && malicious',       // Command chaining
                '../../../etc/passwd',   // Path traversal
                '24`whoami`',            // Command substitution
                '24$(whoami)',           // Command substitution (alternate)
                '24|cat /etc/passwd',    // Pipe injection
                '24\nrm -rf /',          // Newline injection
            ];

            // When: Each malicious input is tested
            for (const maliciousInput of maliciousInputs) {
                const satisfied = await manager.checkVersionSatisfaction(maliciousInput);

                // Then: Input is rejected (returns false)
                expect(satisfied).toBe(false);

                // And: Warning is logged
                expect(mocks.logger.warn).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid version family rejected')
                );
            }

            // And: No command was executed (security validation happened first)
            expect(mocks.executor.execute).not.toHaveBeenCalled();
        });

        it('should accept valid version family input only', async () => {
            // SECURITY TEST: Ensure only digits are accepted
            // Given: Valid version families
            const validInputs = ['18', '20', '22', '24'];

            mocks.executor.execute.mockResolvedValue({
                stdout: 'v20.19.5\n',
                stderr: '',
                code: 0,
                duration: 100,
            });

            // When: Each valid input is tested
            for (const validInput of validInputs) {
                await manager.checkVersionSatisfaction(validInput);
            }

            // Then: Command was executed for each valid input
            expect(mocks.executor.execute).toHaveBeenCalledTimes(validInputs.length);
        });
    });
});
