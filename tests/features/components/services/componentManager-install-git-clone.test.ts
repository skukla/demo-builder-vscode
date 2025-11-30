/**
 * ComponentManager Installation Tests - Git Clone Operations
 *
 * Tests for Git clone operations:
 * - Basic Git clone
 * - Shallow clone
 * - Tag/branch selection
 * - Recursive clone
 * - Commit hash retrieval
 * - Clone failures and timeouts
 *
 * Part of componentManager installation test suite.
 * See also: componentManager-install-simple.test.ts, componentManager-install-git-dependencies.test.ts
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
    mockFileExists
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

describe('ComponentManager - Installation (Git Clone)', () => {
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

    describe('Git clone operations', () => {
        it('should clone Git repository', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git',
                    branch: 'main'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('git clone'),
                expect.any(Object)
            );
            expect(result.success).toBe(true);
        });

        it('should use shallow clone when configured', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git',
                    gitOptions: {
                        shallow: true
                    }
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('--depth=1'),
                expect.any(Object)
            );
        });

        it('should clone specific tag when specified', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git',
                    gitOptions: {
                        tag: 'v1.0.0'
                    }
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('--branch v1.0.0'),
                expect.any(Object)
            );
        });

        it('should use recursive clone when specified', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git',
                    gitOptions: {
                        recursive: true
                    }
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('--recursive'),
                expect.any(Object)
            );
        });

        it('should get commit hash after clone', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                }
            };

            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git rev-parse HEAD')) {
                    return Promise.resolve({
                        stdout: 'abc123def456',
                        stderr: '',
                        code: 0,
                        duration: 10
                    });
                }
                return Promise.resolve({
                    stdout: '',
                    stderr: '',
                    code: 0,
                    duration: 10
                });
            });

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.component?.version).toBe('abc123de'); // Short hash
        });
    });

    describe('Git clone cleanup', () => {
        it('should clean up existing directory before clone', async () => {
            const fs = require('fs/promises');
            mockFileExists();
            (fs.rm as jest.Mock).mockResolvedValue(undefined);

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

            expect(fs.rm).toHaveBeenCalledWith(
                expect.any(String),
                { recursive: true, force: true }
            );
        });
    });

    describe('Git clone timeouts', () => {
        it('should use custom clone timeout', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git',
                    timeouts: {
                        clone: 60000
                    }
                }
            };

            await componentManager.installComponent(mockProject, componentDef);

            const cloneCall = (mockCommandExecutor.execute as jest.Mock).mock.calls.find(
                call => call[0].includes('git clone')
            );
            expect(cloneCall[1].timeout).toBe(60000);
        });
    });

    describe('Git clone failures', () => {
        it('should handle Git clone failure', async () => {
            (mockCommandExecutor.execute as jest.Mock).mockImplementation((cmd: string) => {
                if (cmd.includes('git clone')) {
                    return Promise.resolve({
                        stdout: '',
                        stderr: 'Repository not found',
                        code: 128,
                        duration: 10
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
                    url: 'https://github.com/test/invalid.git'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Git clone failed');
        });

        it('should throw error if Git URL not provided', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git'
                    // Missing url
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Git source URL not provided');
        });
    });
});
