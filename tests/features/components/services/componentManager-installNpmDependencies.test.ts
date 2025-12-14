/**
 * ComponentManager installNpmDependencies Tests
 *
 * Tests for the phase-based npm install method:
 * - Installs dependencies for already-cloned component
 * - Runs build script if configured
 * - Handles missing package.json
 * - Uses correct Node version
 *
 * This method supports phase-based project creation where
 * clone and npm install are separate operations.
 */

import { ComponentManager } from '@/features/components/services/componentManager';
import { TransformedComponentDefinition } from '@/types/components';
import { Logger } from '@/types/logger';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { CommandExecutor } from '@/core/shell';
import {
    createMockCommandExecutor,
    createMockLogger,
    mockSuccessfulExecution,
    mockFileNotFound,
    mockFileExists
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

describe('ComponentManager - installNpmDependencies', () => {
    let componentManager: ComponentManager;
    let mockLogger: Logger;
    let mockCommandExecutor: CommandExecutor;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mocks
        mockLogger = createMockLogger();
        mockCommandExecutor = createMockCommandExecutor();

        // Mock ServiceLocator
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Create ComponentManager instance
        componentManager = new ComponentManager(mockLogger);

        // Mock successful command execution by default
        mockSuccessfulExecution(mockCommandExecutor);
    });

    describe('Basic npm install', () => {
        it('should run npm install when package.json exists', async () => {
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

            const result = await componentManager.installNpmDependencies(
                '/test/path',
                componentDef
            );

            expect(result.success).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm install',
                expect.objectContaining({
                    cwd: '/test/path'
                })
            );
        });

        it('should skip installation when no package.json', async () => {
            mockFileNotFound();

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git'
                }
            };

            const result = await componentManager.installNpmDependencies(
                '/test/path',
                componentDef
            );

            expect(result.success).toBe(true);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('No package.json found')
            );
        });
    });

    describe('Node version handling', () => {
        it('should use configured Node version', async () => {
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
                    nodeVersion: '20.11.0'
                }
            };

            await componentManager.installNpmDependencies('/test/path', componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm install',
                expect.objectContaining({
                    useNodeVersion: '20.11.0'
                })
            );
        });

        it('should use default Node version when not configured', async () => {
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

            await componentManager.installNpmDependencies('/test/path', componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm install',
                expect.objectContaining({
                    useNodeVersion: null
                })
            );
        });
    });

    describe('Build script execution', () => {
        it('should run build script when configured', async () => {
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

            await componentManager.installNpmDependencies('/test/path', componentDef);

            // Should have called npm install AND npm run build
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(2);
            expect(mockCommandExecutor.execute).toHaveBeenNthCalledWith(
                1,
                'npm install',
                expect.any(Object)
            );
            expect(mockCommandExecutor.execute).toHaveBeenNthCalledWith(
                2,
                'npm run build',
                expect.any(Object)
            );
        });

        it('should not run build script when not configured', async () => {
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

            await componentManager.installNpmDependencies('/test/path', componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(1);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm install',
                expect.any(Object)
            );
        });
    });

    describe('Custom timeouts', () => {
        it('should use custom timeout when specified', async () => {
            mockFileExists();

            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'git',
                    url: 'https://github.com/test/repo.git',
                    timeouts: {
                        install: 120000
                    }
                }
            };

            await componentManager.installNpmDependencies('/test/path', componentDef);

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'npm install',
                expect.objectContaining({
                    timeout: 120000
                })
            );
        });
    });
});
