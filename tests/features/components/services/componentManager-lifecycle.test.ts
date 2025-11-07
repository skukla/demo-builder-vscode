/**
 * ComponentManager Lifecycle Tests
 *
 * Tests for component lifecycle management:
 * - Status updates
 * - Metadata management
 * - Component removal
 * - File deletion
 *
 * Target Coverage: 75%+
 */

import { ComponentManager } from '@/features/components/services/componentManager';
import { Project } from '@/types';
import { Logger } from '@/types/logger';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { CommandExecutor } from '@/core/shell';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockProject,
    mockSuccessfulExecution
} from './testHelpers';

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator');

// Mock fs/promises
jest.mock('fs/promises');

describe('ComponentManager - Lifecycle', () => {
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

    describe('updateComponentStatus', () => {
        beforeEach(() => {
            mockProject.componentInstances = {
                'test-component': {
                    id: 'test-component',
                    name: 'Test Component',
                    type: 'frontend',
                    status: 'ready',
                    lastUpdated: new Date()
                }
            };
        });

        it('should update component status', async () => {
            await componentManager.updateComponentStatus(
                mockProject,
                'test-component',
                'running'
            );

            expect(mockProject.componentInstances!['test-component'].status).toBe('running');
        });

        it('should update lastUpdated timestamp', async () => {
            const beforeUpdate = new Date();

            await componentManager.updateComponentStatus(
                mockProject,
                'test-component',
                'running'
            );

            const lastUpdated = mockProject.componentInstances!['test-component'].lastUpdated!;
            expect(lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
        });

        it('should update metadata', async () => {
            await componentManager.updateComponentStatus(
                mockProject,
                'test-component',
                'running',
                { port: 3000, pid: 12345 }
            );

            expect(mockProject.componentInstances!['test-component'].metadata).toMatchObject({
                port: 3000,
                pid: 12345
            });
        });

        it('should merge metadata with existing', async () => {
            mockProject.componentInstances!['test-component'].metadata = {
                existing: 'data'
            };

            await componentManager.updateComponentStatus(
                mockProject,
                'test-component',
                'running',
                { port: 3000 }
            );

            expect(mockProject.componentInstances!['test-component'].metadata).toMatchObject({
                existing: 'data',
                port: 3000
            });
        });

        it('should throw error for non-existent component', async () => {
            await expect(
                componentManager.updateComponentStatus(mockProject, 'nonexistent', 'running')
            ).rejects.toThrow('Component nonexistent not found in project');
        });

        it('should initialize componentInstances if undefined', async () => {
            mockProject.componentInstances = undefined;

            await expect(
                componentManager.updateComponentStatus(mockProject, 'test-component', 'running')
            ).rejects.toThrow();

            // componentInstances should be initialized
            expect(mockProject.componentInstances).toBeDefined();
        });
    });

    describe('removeComponent', () => {
        beforeEach(() => {
            mockProject.componentInstances = {
                'test-component': {
                    id: 'test-component',
                    name: 'Test Component',
                    type: 'frontend',
                    status: 'ready',
                    path: '/test/project/components/test-component'
                }
            };
        });

        it('should remove component from project', async () => {
            await componentManager.removeComponent(mockProject, 'test-component');

            expect(mockProject.componentInstances!['test-component']).toBeUndefined();
        });

        it('should delete files if deleteFiles is true', async () => {
            const fs = require('fs/promises');
            (fs.rm as jest.Mock).mockResolvedValue(undefined);

            await componentManager.removeComponent(mockProject, 'test-component', true);

            expect(fs.rm).toHaveBeenCalledWith(
                '/test/project/components/test-component',
                { recursive: true, force: true }
            );
        });

        it('should not delete files if deleteFiles is false', async () => {
            const fs = require('fs/promises');
            (fs.rm as jest.Mock).mockResolvedValue(undefined);

            await componentManager.removeComponent(mockProject, 'test-component', false);

            expect(fs.rm).not.toHaveBeenCalled();
        });

        it('should handle file deletion errors gracefully', async () => {
            const fs = require('fs/promises');
            (fs.rm as jest.Mock).mockRejectedValue(new Error('Permission denied'));

            await componentManager.removeComponent(mockProject, 'test-component', true);

            expect(mockLogger.error).toHaveBeenCalled();
            // Component should still be removed from project
            expect(mockProject.componentInstances!['test-component']).toBeUndefined();
        });

        it('should throw error for non-existent component', async () => {
            await expect(
                componentManager.removeComponent(mockProject, 'nonexistent')
            ).rejects.toThrow('Component nonexistent not found');
        });
    });
});
