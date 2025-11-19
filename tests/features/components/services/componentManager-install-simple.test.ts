/**
 * ComponentManager Installation Tests - Simple Components
 *
 * Tests for simple installation flows:
 * - Configuration-only components (no source)
 * - npm-based components
 * - Local components
 * - Unsupported source types
 * - Error handling
 *
 * Part of componentManager installation test suite.
 * See also: componentManager-install-git-clone.test.ts, componentManager-install-git-dependencies.test.ts
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

describe('ComponentManager - Installation (Simple Components)', () => {
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
