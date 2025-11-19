/**
 * HandlerRegistry Execution Tests
 *
 * Tests for handler execution, context passing, and results
 */

import { HandlerRegistry } from '@/commands/handlers/HandlerRegistry';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { createMockContext, setupHandlerMocks } from './HandlerRegistry.testUtils';

// Mock all handler modules
jest.mock('@/features/lifecycle/handlers/lifecycleHandlers');
jest.mock('@/features/prerequisites/handlers');
jest.mock('@/features/components/handlers/componentHandlers');
jest.mock('@/features/authentication/handlers/authenticationHandlers');
jest.mock('@/features/authentication/handlers/projectHandlers');
jest.mock('@/features/authentication/handlers/workspaceHandlers');
jest.mock('@/features/mesh/handlers');
jest.mock('@/features/project-creation/handlers');

describe('HandlerRegistry - Execution', () => {
    let registry: HandlerRegistry;
    let mockContext: jest.Mocked<HandlerContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        setupHandlerMocks();
        registry = new HandlerRegistry();
    });

    describe('handle - Success Cases', () => {
        it('should dispatch to correct handler and return result', async () => {
            // Mock handler will be called by registry
            const mockResult = { success: true, data: 'test' };

            // Get mocked module and configure existing mock (don't replace!)
            const lifecycle = require('../../../src/features/lifecycle/handlers/lifecycleHandlers');
            (lifecycle.handleReady as jest.Mock).mockResolvedValue(mockResult);

            const result = await registry.handle(mockContext, 'ready');

            expect(lifecycle.handleReady).toHaveBeenCalledWith(mockContext, undefined);
            expect(result).toEqual(mockResult);
        });

        it('should pass payload to handler', async () => {
            const payload = { projectId: 'test-123' };
            const mockResult = { success: true };

            const projects = require('../../../src/features/authentication/handlers/projectHandlers');
            (projects.handleSelectProject as jest.Mock).mockResolvedValue(mockResult);

            const result = await registry.handle(mockContext, 'select-project', payload);

            expect(projects.handleSelectProject).toHaveBeenCalledWith(mockContext, payload);
            expect(result).toEqual(mockResult);
        });

        it('should handle async handlers', async () => {
            const mockResult = { success: true, projects: [] };

            const projects = require('../../../src/features/authentication/handlers/projectHandlers');
            (projects.handleGetProjects as jest.Mock).mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return mockResult;
            });

            const result = await registry.handle(mockContext, 'get-projects');

            expect(result).toEqual(mockResult);
        });

        it('should handle handlers that return complex data', async () => {
            const complexData = {
                success: true,
                data: {
                    projects: [
                        { id: '1', name: 'Project 1' },
                        { id: '2', name: 'Project 2' }
                    ],
                    metadata: {
                        total: 2,
                        page: 1
                    }
                }
            };

            const projects = require('../../../src/features/authentication/handlers/projectHandlers');
            (projects.handleGetProjects as jest.Mock).mockResolvedValue(complexData);

            const result = await registry.handle(mockContext, 'get-projects');

            expect(result).toEqual(complexData);
        });

        it('should handle null payload', async () => {
            const lifecycle = require('../../../src/features/lifecycle/handlers/lifecycleHandlers');
            (lifecycle.handleReady as jest.Mock).mockResolvedValue({ success: true });

            await registry.handle(mockContext, 'ready', null);

            expect(lifecycle.handleReady).toHaveBeenCalledWith(mockContext, null);
        });

        it('should handle undefined payload', async () => {
            const lifecycle = require('../../../src/features/lifecycle/handlers/lifecycleHandlers');
            (lifecycle.handleReady as jest.Mock).mockResolvedValue({ success: true });

            await registry.handle(mockContext, 'ready', undefined);

            expect(lifecycle.handleReady).toHaveBeenCalledWith(mockContext, undefined);
        });

        it('should handle complex payload objects', async () => {
            const complexPayload = {
                nested: {
                    deep: {
                        value: 'test'
                    }
                },
                array: [1, 2, 3],
                boolean: true,
                number: 42
            };

            const projects = require('../../../src/features/authentication/handlers/projectHandlers');
            (projects.handleSelectProject as jest.Mock).mockResolvedValue({ success: true });

            await registry.handle(mockContext, 'select-project', complexPayload);

            expect(projects.handleSelectProject).toHaveBeenCalledWith(
                mockContext,
                complexPayload
            );
        });

        it('should handle concurrent handler calls', async () => {
            const auth = require('../../../src/features/authentication/handlers/authenticationHandlers');
            (auth.handleCheckAuth as jest.Mock).mockResolvedValue({ success: true });

            const projects = require('../../../src/features/authentication/handlers/projectHandlers');
            (projects.handleGetProjects as jest.Mock).mockResolvedValue({ success: true });

            // Execute handlers concurrently
            const [authResult, projectResult] = await Promise.all([
                registry.handle(mockContext, 'check-auth'),
                registry.handle(mockContext, 'get-projects')
            ]);

            expect(authResult).toEqual({ success: true });
            expect(projectResult).toEqual({ success: true });
            expect(auth.handleCheckAuth).toHaveBeenCalled();
            expect(projects.handleGetProjects).toHaveBeenCalled();
        });
    });
});
