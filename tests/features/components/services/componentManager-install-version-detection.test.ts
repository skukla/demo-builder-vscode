/**
 * ComponentManager Installation Tests - Version Detection
 *
 * Tests for the hybrid version detection approach:
 * 1. Git tag detection (git describe --tags --exact-match HEAD)
 * 2. Package.json version fallback
 * 3. Commit hash fallback
 *
 * Part of componentManager installation test suite.
 */

import { ComponentManager } from '@/features/components/services/componentManager';
import { Project } from '@/types';
import { TransformedComponentDefinition } from '@/types/components';
import { Logger } from '@/types/logger';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { CommandExecutor } from '@/core/shell';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockProject,
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

describe('ComponentManager - Version Detection', () => {
    let componentManager: ComponentManager;
    let mockLogger: Logger;
    let mockProject: Project;
    let mockCommandExecutor: CommandExecutor;

    const baseComponentDef: TransformedComponentDefinition = {
        id: 'test-component',
        name: 'Test Component',
        type: 'frontend',
        source: {
            type: 'git',
            url: 'https://github.com/test/repo.git',
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mocks
        mockLogger = createMockLogger();
        mockProject = createMockProject();
        mockCommandExecutor = createMockCommandExecutor();

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Create ComponentManager instance
        componentManager = new ComponentManager(mockLogger);

        // Mock fs/promises
        const fs = require('fs/promises');
        (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.rm as jest.Mock).mockResolvedValue(undefined);
    });

    describe('Strategy 1: Git tag detection', () => {
        it('should detect version from git tag (with v prefix)', async () => {
            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({
                        stdout: 'v1.0.0\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('1.0.0'); // v prefix removed
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('version: 1.0.0')
            );
        });

        it('should detect version from git tag (without v prefix)', async () => {
            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({
                        stdout: '2.5.3\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('2.5.3');
        });

        it('should detect beta/pre-release versions from git tag', async () => {
            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({
                        stdout: 'v1.0.0-beta.2\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('1.0.0-beta.2');
        });
    });

    describe('Strategy 2: Package.json fallback', () => {
        it('should use package.json version when git tag not found', async () => {
            const fs = require('fs/promises');

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    // No tag found
                    return Promise.resolve({
                        stdout: '',
                        stderr: 'fatal: no tag exactly matches',
                        code: 128,
                        duration: 10,
                    });
                }
                if (cmd.includes('git rev-parse HEAD')) {
                    return Promise.resolve({
                        stdout: 'abc123def456\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            (fs.readFile as jest.Mock).mockResolvedValue(
                JSON.stringify({
                    name: 'test-component',
                    version: '3.2.1',
                })
            );

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('3.2.1');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Detected version from package.json: 3.2.1')
            );
        });

        it('should handle package.json with different version formats', async () => {
            const fs = require('fs/promises');

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 128, duration: 10 });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            (fs.readFile as jest.Mock).mockResolvedValue(
                JSON.stringify({
                    name: 'test-component',
                    version: '0.0.1-alpha.5',
                })
            );

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('0.0.1-alpha.5');
        });
    });

    describe('Strategy 3: Commit hash fallback', () => {
        it('should use commit hash when both git tag and package.json fail', async () => {
            const fs = require('fs/promises');

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 128, duration: 10 });
                }
                if (cmd.includes('git rev-parse HEAD')) {
                    return Promise.resolve({
                        stdout: 'abc123def456789\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            // Mock package.json read failure
            (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('abc123de'); // 8-char short hash
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Using commit hash as version: abc123de')
            );
        });

        it('should use commit hash when package.json has no version field', async () => {
            const fs = require('fs/promises');

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 128, duration: 10 });
                }
                if (cmd.includes('git rev-parse HEAD')) {
                    return Promise.resolve({
                        stdout: 'fedcba987654321\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            // Package.json exists but has no version
            (fs.readFile as jest.Mock).mockResolvedValue(
                JSON.stringify({
                    name: 'test-component',
                    // No version field
                })
            );

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('fedcba98'); // 8-char short hash
        });
    });

    describe('Edge cases', () => {
        it('should handle empty git tag output gracefully', async () => {
            const fs = require('fs/promises');

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    // Success code but empty output
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git rev-parse HEAD')) {
                    return Promise.resolve({
                        stdout: 'fallback123\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('fallback'); // Falls back to commit hash (8 chars)
        });

        it('should warn when all version detection strategies fail', async () => {
            const fs = require('fs/promises');

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                // All git commands fail
                return Promise.resolve({
                    stdout: '',
                    stderr: 'error',
                    code: 1,
                    duration: 10,
                });
            });

            (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBeUndefined();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Could not detect version')
            );
        });

        it('should handle malformed package.json gracefully', async () => {
            const fs = require('fs/promises');

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 128, duration: 10 });
                }
                if (cmd.includes('git rev-parse HEAD')) {
                    return Promise.resolve({
                        stdout: 'rescue123\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            // Malformed JSON
            (fs.readFile as jest.Mock).mockResolvedValue('{ invalid json');

            const result = await componentManager.installComponent(mockProject, baseComponentDef);

            expect(result.success).toBe(true);
            expect(result.component?.version).toBe('rescue12'); // Falls back to commit hash
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Could not read package.json version')
            );
        });
    });

    describe('Logging', () => {
        it('should log appropriate messages for successful git tag detection', async () => {
            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({
                        stdout: 'v5.0.0\n',
                        stderr: '',
                        code: 0,
                        duration: 10,
                    });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            await componentManager.installComponent(mockProject, baseComponentDef);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Detected version from git tag: 5.0.0')
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Test Component version: 5.0.0')
            );
        });

        it('should log when falling back from git tag to package.json', async () => {
            const fs = require('fs/promises');

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
                }
                if (cmd.includes('git describe --tags --exact-match HEAD')) {
                    return Promise.resolve({ stdout: '', stderr: '', code: 128, duration: 10 });
                }
                return Promise.resolve({ stdout: '', stderr: '', code: 0, duration: 10 });
            });

            (fs.readFile as jest.Mock).mockResolvedValue(
                JSON.stringify({ version: '6.0.0' })
            );

            await componentManager.installComponent(mockProject, baseComponentDef);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Detected version from package.json: 6.0.0')
            );
        });
    });
});
