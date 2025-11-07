/**
 * ComponentManager Installation Tests
 *
 * Tests for component installation across different source types:
 * - Configuration-only components
 * - Git-based components (clone, dependencies, build)
 * - npm-based components
 * - Local components
 * - Error handling
 *
 * Target Coverage: 75%+
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

describe('ComponentManager - Installation', () => {
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

    describe('configuration-only components', () => {
        it('should handle components with no source', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'backend-selector',
                name: 'Backend Selector',
                type: 'backend',
                description: 'Select backend type'
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(true);
            expect(result.component?.status).toBe('ready');
        });

        it('should create component instance with correct metadata', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'config-component',
                name: 'Config Component',
                type: 'dependency',
                subType: 'utility',
                icon: 'gear'
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.component).toMatchObject({
                id: 'config-component',
                name: 'Config Component',
                type: 'dependency',
                subType: 'utility',
                icon: 'gear',
                status: 'ready'
            });
        });
    });

    describe('Git-based components', () => {
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

    describe('npm-based components', () => {
        it('should install npm package', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-package',
                name: 'Test Package',
                type: 'dependency',
                source: {
                    type: 'npm',
                    package: '@test/package',
                    version: '1.0.0'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(true);
            expect(result.component?.status).toBe('ready');
            expect(result.component?.version).toBe('1.0.0');
        });

        it('should use latest version if not specified', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-package',
                name: 'Test Package',
                type: 'dependency',
                source: {
                    type: 'npm',
                    package: '@test/package'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.component?.version).toBe('latest');
        });

        it('should use version from options', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-package',
                name: 'Test Package',
                type: 'dependency',
                source: {
                    type: 'npm',
                    package: '@test/package'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef, {
                version: '2.0.0'
            });

            expect(result.component?.version).toBe('2.0.0');
        });

        it('should store package metadata', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-package',
                name: 'Test Package',
                type: 'dependency',
                source: {
                    type: 'npm',
                    package: '@test/package'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.component?.metadata).toMatchObject({
                packageName: '@test/package',
                installTarget: 'frontend'
            });
        });

        it('should throw error if package name not provided', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-package',
                name: 'Test Package',
                type: 'dependency',
                source: {
                    type: 'npm'
                    // Missing package
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(false);
            expect(result.error).toContain('NPM package name not provided');
        });
    });

    describe('local components', () => {
        it('should link local component', async () => {
            const fs = require('fs/promises');
            mockFileExists();

            const componentDef: TransformedComponentDefinition = {
                id: 'local-component',
                name: 'Local Component',
                type: 'frontend',
                source: {
                    type: 'local',
                    url: '/local/path/to/component'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(true);
            expect(result.component?.path).toBe('/local/path/to/component');
            expect(result.component?.metadata?.isLocal).toBe(true);
        });

        it('should verify local path exists', async () => {
            const fs = require('fs/promises');
            mockFileNotFound();

            const componentDef: TransformedComponentDefinition = {
                id: 'local-component',
                name: 'Local Component',
                type: 'frontend',
                source: {
                    type: 'local',
                    url: '/nonexistent/path'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Local path does not exist');
        });

        it('should throw error if local path not provided', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'local-component',
                name: 'Local Component',
                type: 'frontend',
                source: {
                    type: 'local'
                    // Missing url
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Local path not provided');
        });
    });

    describe('unsupported source types', () => {
        it('should throw error for unsupported source type', async () => {
            const componentDef: TransformedComponentDefinition = {
                id: 'test-component',
                name: 'Test Component',
                type: 'frontend',
                source: {
                    type: 'unsupported' as 'git' | 'npm' | 'local'
                }
            };

            const result = await componentManager.installComponent(mockProject, componentDef);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Unsupported source type');
        });
    });

    describe('error handling', () => {
        it('should catch and log errors', async () => {
            (mockCommandExecutor.execute as jest.Mock).mockRejectedValue(
                new Error('Command failed')
            );

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

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
