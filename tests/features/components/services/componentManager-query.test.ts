/**
 * ComponentManager Query Tests
 *
 * Tests for component querying and utility methods:
 * - getComponent (retrieve by ID)
 * - getComponentsByType (filter by type)
 * - Static utility methods (paths)
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

describe('ComponentManager - Query', () => {
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

    describe('getComponent', () => {
        beforeEach(() => {
            mockProject.componentInstances = {
                'test-component': {
                    id: 'test-component',
                    name: 'Test Component',
                    type: 'frontend',
                    status: 'ready'
                }
            };
        });

        it('should return component by ID', () => {
            const component = componentManager.getComponent(mockProject, 'test-component');

            expect(component).toBeDefined();
            expect(component?.id).toBe('test-component');
        });

        it('should return undefined for non-existent component', () => {
            const component = componentManager.getComponent(mockProject, 'nonexistent');

            expect(component).toBeUndefined();
        });

        it('should return undefined if componentInstances is undefined', () => {
            mockProject.componentInstances = undefined;

            const component = componentManager.getComponent(mockProject, 'test-component');

            expect(component).toBeUndefined();
        });
    });

    describe('getComponentsByType', () => {
        beforeEach(() => {
            mockProject.componentInstances = {
                'frontend-1': {
                    id: 'frontend-1',
                    name: 'Frontend 1',
                    type: 'frontend',
                    status: 'ready'
                },
                'frontend-2': {
                    id: 'frontend-2',
                    name: 'Frontend 2',
                    type: 'frontend',
                    status: 'ready'
                },
                'backend-1': {
                    id: 'backend-1',
                    name: 'Backend 1',
                    type: 'backend',
                    status: 'ready'
                }
            };
        });

        it('should return components by type', () => {
            const components = componentManager.getComponentsByType(mockProject, 'frontend');

            expect(components).toHaveLength(2);
            expect(components.every(c => c.type === 'frontend')).toBe(true);
        });

        it('should return empty array for non-matching type', () => {
            const components = componentManager.getComponentsByType(mockProject, 'dependency');

            expect(components).toEqual([]);
        });

        it('should return empty array if componentInstances is undefined', () => {
            mockProject.componentInstances = undefined;

            const components = componentManager.getComponentsByType(mockProject, 'frontend');

            expect(components).toEqual([]);
        });
    });

    describe('static utility methods', () => {
        describe('getComponentsDirectory', () => {
            it('should return components directory path', () => {
                const path = ComponentManager.getComponentsDirectory(mockProject);

                expect(path).toBe('/test/project/components');
            });
        });

        describe('getComponentPath', () => {
            it('should return component path', () => {
                const path = ComponentManager.getComponentPath(mockProject, 'test-component');

                expect(path).toBe('/test/project/components/test-component');
            });
        });
    });
});
