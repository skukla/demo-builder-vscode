/**
 * ComponentManager Installation Tests - Git Dependencies & Build
 *
 * Tests for Git component post-clone operations:
 * - .node-version file creation
 * - npm install execution
 * - Build script execution
 * - Node version handling
 * - Dependency install failures
 * - Custom timeouts
 *
 * Part of componentManager installation test suite.
 * See also: componentManager-install-simple.test.ts, componentManager-install-git-clone.test.ts
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
    mockSuccessfulExecution,
    mockFileNotFound,
    mockFileExists
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

describe('ComponentManager - Installation (Git Dependencies)', () => {
    let componentManager: ComponentManager;
    let mockLogger: Logger;
    let mockProject: Project;
    let mockCommandExecutor: CommandExecutor;

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

        // Mock successful command execution by default
        mockSuccessfulExecution(mockCommandExecutor);
    });

    describe('Node version management', () => {
        it('should create .node-version file when configured', async () => {
            const fs = require('fs/promises');
            mockFileNotFound();
            (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                },
                configuration: {
                    nodeVersion: '20.11.0'
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining('.node-version'),
                '20.11.0\n',
                'utf-8'
            );
        });

        it('should skip creating .node-version if already exists', async () => {
            const fs = require('fs/promises');
            mockFileExists();
            (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                },
                configuration: {
                    nodeVersion: '20.11.0'
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            // writeFile should not be called for .node-version
            const writeFileCalls = (fs.writeFile as jest.Mock).mock.calls;
            const nodeVersionCall = writeFileCalls.find(call =>
                call[0].includes('.node-version')
            );
            expect(nodeVersionCall).toBeUndefined();
        });

        it('should use correct Node version for npm install', async () => {
            const fs = require('fs/promises');
            mockFileExists();

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                },
                configuration: {
                    nodeVersion: '18.19.0'
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            // Should use useNodeVersion option
            const npmInstallCall = (mockCommandExecutor.execute as jest.Mock).mock.calls.find(
                call => call[0].includes('npm install')
            );
            expect(npmInstallCall[1]).toMatchObject({
                useNodeVersion: '18.19.0'
            });
        });
    });

    describe('npm dependency installation', () => {
        it('should install npm dependencies if package.json exists', async () => {
            const fs = require('fs/promises');
            mockFileExists();

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm install',
                expect.objectContaining({
                    cwd: expect.any(String)
                })
            );
        });

        it('should skip dependencies if skipDependencies is true', async () => {
            const fs = require('fs/promises');
            mockFileExists();

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                }
            };

            await componentManager.installComponent(mockProject, componentDef, {
                skipDependencies: true
            });

            // npm install should not be called
            const npmInstallCall = (mockCommandExecutor.execute as jest.Mock).mock.calls.find(
                call => call[0].includes('npm install')
            );
            expect(npmInstallCall).toBeUndefined();
        });

        it('should use custom install timeout', async () => {
            const fs = require('fs/promises');
            mockFileExists();

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git',
                    timeouts: {
                        install: 180000
                    }
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            const installCall = (mockCommandExecutor.execute as jest.Mock).mock.calls.find(
                call => call[0].includes('npm install')
            );
            expect(installCall[1].timeout).toBe(180000);
        });

        it('should handle npm install failure gracefully', async () => {
            const fs = require('fs/promises');
            mockFileExists();

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('npm install')) {
                    return Promise.resolve({
                        stdout: '',
                        stderr: 'Some warnings',
                        code: 1,
                        duration: 100
                    });
                }
                return Promise.resolve({
                    stdout: '',
                    stderr: '',
                    code: 0,
                    duration: 10
                });
            });

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            // Should still succeed (warnings are acceptable)
            expect(result.success).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });

    describe('build script execution', () => {
        it('should run build script if configured', async () => {
            const fs = require('fs/promises');
            mockFileExists();

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                },
                configuration: {
                    buildScript: 'build'
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm run build',
                expect.objectContaining({
                    cwd: expect.any(String)
                })
            );
        });

        it('should handle build failure gracefully', async () => {
            const fs = require('fs/promises');
            mockFileExists();

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('npm run build')) {
                    return Promise.resolve({
                        stdout: '',
                        stderr: 'Build failed',
                        code: 1,
                        duration: 100
                    });
                }
                return Promise.resolve({
                    stdout: '',
                    stderr: '',
                    code: 0,
                    duration: 10
                });
            });

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                },
                configuration: {
                    buildScript: 'build'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(true);
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });
});
