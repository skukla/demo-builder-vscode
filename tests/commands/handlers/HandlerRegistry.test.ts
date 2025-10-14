/**
 * HandlerRegistry Tests
 *
 * Tests for handler registration, message dispatching, and error handling
 */

import { HandlerRegistry } from '../../../src/commands/handlers/HandlerRegistry';
import { HandlerContext } from '../../../src/commands/handlers/HandlerContext';

// Mock all handler modules
jest.mock('../../../src/commands/handlers/lifecycleHandlers');
jest.mock('../../../src/commands/handlers/prerequisites');
jest.mock('../../../src/commands/handlers/componentHandlers');
jest.mock('../../../src/commands/handlers/authenticationHandlers');
jest.mock('../../../src/commands/handlers/projectHandlers');
jest.mock('../../../src/commands/handlers/workspaceHandlers');
jest.mock('../../../src/commands/handlers/mesh');
jest.mock('../../../src/commands/handlers/projectCreation');

describe('HandlerRegistry', () => {
    let registry: HandlerRegistry;
    let mockContext: jest.Mocked<HandlerContext>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock context
        mockContext = {
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn()
            },
            debugLogger: {
                debug: jest.fn(),
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn()
            },
            sendMessage: jest.fn(),
            sharedState: {
                isAuthenticating: false
            }
        } as any;

        // Create new registry instance
        registry = new HandlerRegistry();
    });

    describe('Constructor & Initialization', () => {
        it('should create registry instance', () => {
            expect(registry).toBeDefined();
            expect(registry).toBeInstanceOf(HandlerRegistry);
        });

        it('should register all handler types during construction', () => {
            const registeredTypes = registry.getRegisteredTypes();

            // Should have all expected handlers registered
            expect(registeredTypes).toContain('ready');
            expect(registeredTypes).toContain('cancel');
            expect(registeredTypes).toContain('check-prerequisites');
            expect(registeredTypes).toContain('check-auth');
            expect(registeredTypes).toContain('authenticate');
            expect(registeredTypes).toContain('get-projects');
            expect(registeredTypes).toContain('select-project');
            expect(registeredTypes).toContain('get-workspaces');
            expect(registeredTypes).toContain('select-workspace');
            expect(registeredTypes).toContain('create-project');
        });

        it('should register lifecycle handlers', () => {
            const lifecycleHandlers = [
                'ready',
                'cancel',
                'openProject',
                'browseFiles',
                'log',
                'cancel-project-creation',
                'cancel-mesh-creation',
                'cancel-auth-polling',
                'open-adobe-console'
            ];

            lifecycleHandlers.forEach(type => {
                expect(registry.hasHandler(type)).toBe(true);
            });
        });

        it('should register prerequisite handlers', () => {
            const prereqHandlers = [
                'check-prerequisites',
                'continue-prerequisites',
                'install-prerequisite'
            ];

            prereqHandlers.forEach(type => {
                expect(registry.hasHandler(type)).toBe(true);
            });
        });

        it('should register component handlers', () => {
            const componentHandlers = [
                'update-component-selection',
                'update-components-data',
                'loadComponents',
                'get-components-data',
                'checkCompatibility',
                'loadDependencies',
                'loadPreset',
                'validateSelection'
            ];

            componentHandlers.forEach(type => {
                expect(registry.hasHandler(type)).toBe(true);
            });
        });

        it('should register authentication handlers', () => {
            const authHandlers = ['check-auth', 'authenticate'];

            authHandlers.forEach(type => {
                expect(registry.hasHandler(type)).toBe(true);
            });
        });

        it('should register project handlers', () => {
            const projectHandlers = [
                'ensure-org-selected',
                'get-projects',
                'select-project',
                'check-project-apis'
            ];

            projectHandlers.forEach(type => {
                expect(registry.hasHandler(type)).toBe(true);
            });
        });

        it('should register workspace handlers', () => {
            const workspaceHandlers = ['get-workspaces', 'select-workspace'];

            workspaceHandlers.forEach(type => {
                expect(registry.hasHandler(type)).toBe(true);
            });
        });

        it('should register mesh handlers', () => {
            const meshHandlers = [
                'check-api-mesh',
                'create-api-mesh',
                'delete-api-mesh'
            ];

            meshHandlers.forEach(type => {
                expect(registry.hasHandler(type)).toBe(true);
            });
        });

        it('should register project creation handlers', () => {
            const creationHandlers = ['validate', 'create-project'];

            creationHandlers.forEach(type => {
                expect(registry.hasHandler(type)).toBe(true);
            });
        });
    });

    describe('hasHandler', () => {
        it('should return true for registered handlers', () => {
            expect(registry.hasHandler('check-auth')).toBe(true);
            expect(registry.hasHandler('get-projects')).toBe(true);
            expect(registry.hasHandler('create-project')).toBe(true);
        });

        it('should return false for unregistered handlers', () => {
            expect(registry.hasHandler('unknown-handler')).toBe(false);
            expect(registry.hasHandler('non-existent')).toBe(false);
            expect(registry.hasHandler('')).toBe(false);
        });

        it('should be case-sensitive', () => {
            expect(registry.hasHandler('check-auth')).toBe(true);
            expect(registry.hasHandler('CHECK-AUTH')).toBe(false);
            expect(registry.hasHandler('Check-Auth')).toBe(false);
        });
    });

    describe('getRegisteredTypes', () => {
        it('should return array of all registered types', () => {
            const types = registry.getRegisteredTypes();

            expect(Array.isArray(types)).toBe(true);
            expect(types.length).toBeGreaterThan(0);
        });

        it('should include all major handler categories', () => {
            const types = registry.getRegisteredTypes();

            // Check for representatives from each category
            expect(types).toContain('ready'); // lifecycle
            expect(types).toContain('check-prerequisites'); // prerequisites
            expect(types).toContain('loadComponents'); // components
            expect(types).toContain('check-auth'); // authentication
            expect(types).toContain('get-projects'); // projects
            expect(types).toContain('get-workspaces'); // workspaces
            expect(types).toContain('check-api-mesh'); // mesh
            expect(types).toContain('create-project'); // creation
        });

        it('should not contain duplicates', () => {
            const types = registry.getRegisteredTypes();
            const uniqueTypes = [...new Set(types)];

            expect(types.length).toBe(uniqueTypes.length);
        });
    });

    describe('handle - Success Cases', () => {
        it('should dispatch to correct handler and return result', async () => {
            // Mock handler will be called by registry
            const mockResult = { success: true, data: 'test' };

            // Import mocked modules to set up return values
            const lifecycle = require('../../../src/commands/handlers/lifecycleHandlers');
            lifecycle.handleReady = jest.fn().mockResolvedValue(mockResult);

            const result = await registry.handle(mockContext, 'ready');

            expect(lifecycle.handleReady).toHaveBeenCalledWith(mockContext, undefined);
            expect(result).toEqual(mockResult);
        });

        it('should pass payload to handler', async () => {
            const payload = { projectId: 'test-123' };
            const mockResult = { success: true };

            const projects = require('../../../src/commands/handlers/projectHandlers');
            projects.handleSelectProject = jest.fn().mockResolvedValue(mockResult);

            const result = await registry.handle(mockContext, 'select-project', payload);

            expect(projects.handleSelectProject).toHaveBeenCalledWith(mockContext, payload);
            expect(result).toEqual(mockResult);
        });

        it('should handle async handlers', async () => {
            const mockResult = { success: true, projects: [] };

            const projects = require('../../../src/commands/handlers/projectHandlers');
            projects.handleGetProjects = jest.fn().mockImplementation(async () => {
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

            const projects = require('../../../src/commands/handlers/projectHandlers');
            projects.handleGetProjects = jest.fn().mockResolvedValue(complexData);

            const result = await registry.handle(mockContext, 'get-projects');

            expect(result).toEqual(complexData);
        });
    });

    describe('handle - Error Cases', () => {
        it('should return handlerNotFound for unknown message type', async () => {
            const result = await registry.handle(mockContext, 'unknown-message');

            expect(result).toEqual({ success: false, handlerNotFound: true });
        });

        it('should return handlerNotFound for empty message type', async () => {
            const result = await registry.handle(mockContext, '');

            expect(result).toEqual({ success: false, handlerNotFound: true });
        });

        it('should log error when handler throws', async () => {
            const error = new Error('Handler failed');

            const lifecycle = require('../../../src/commands/handlers/lifecycleHandlers');
            lifecycle.handleReady = jest.fn().mockRejectedValue(error);

            await expect(registry.handle(mockContext, 'ready')).rejects.toThrow('Handler failed');

            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[HandlerRegistry] Handler \'ready\' failed:',
                error
            );
        });

        it('should re-throw errors from handlers', async () => {
            const error = new Error('Authentication failed');

            const auth = require('../../../src/commands/handlers/authenticationHandlers');
            auth.handleCheckAuth = jest.fn().mockRejectedValue(error);

            await expect(registry.handle(mockContext, 'check-auth')).rejects.toThrow(
                'Authentication failed'
            );
        });

        it('should handle handler that throws non-Error object', async () => {
            const errorString = 'Something went wrong';

            const lifecycle = require('../../../src/commands/handlers/lifecycleHandlers');
            lifecycle.handleCancel = jest.fn().mockRejectedValue(errorString);

            await expect(registry.handle(mockContext, 'cancel')).rejects.toBe(errorString);
        });
    });

    describe('needsProgressCallback', () => {
        it('should return true for create-api-mesh', () => {
            expect(registry.needsProgressCallback('create-api-mesh')).toBe(true);
        });

        it('should return false for other handlers', () => {
            expect(registry.needsProgressCallback('check-auth')).toBe(false);
            expect(registry.needsProgressCallback('get-projects')).toBe(false);
            expect(registry.needsProgressCallback('ready')).toBe(false);
            expect(registry.needsProgressCallback('create-project')).toBe(false);
        });

        it('should return false for unknown handlers', () => {
            expect(registry.needsProgressCallback('unknown-handler')).toBe(false);
            expect(registry.needsProgressCallback('')).toBe(false);
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle sequence of authentication flow', async () => {
            const auth = require('../../../src/commands/handlers/authenticationHandlers');
            auth.handleCheckAuth = jest.fn().mockResolvedValue({
                success: true,
                authenticated: false
            });
            auth.handleAuthenticate = jest.fn().mockResolvedValue({
                success: true,
                authenticated: true
            });

            // Check auth - not authenticated
            const checkResult = await registry.handle(mockContext, 'check-auth');
            expect(checkResult).toEqual({ success: true, authenticated: false });

            // Authenticate
            const authResult = await registry.handle(mockContext, 'authenticate');
            expect(authResult).toEqual({ success: true, authenticated: true });

            // Verify both handlers were called
            expect(auth.handleCheckAuth).toHaveBeenCalled();
            expect(auth.handleAuthenticate).toHaveBeenCalled();
        });

        it('should handle project selection flow', async () => {
            const projects = require('../../../src/commands/handlers/projectHandlers');

            projects.handleEnsureOrgSelected = jest.fn().mockResolvedValue({
                success: true,
                hasOrg: true
            });
            projects.handleGetProjects = jest.fn().mockResolvedValue({
                success: true,
                projects: [{ id: 'proj-1' }]
            });
            projects.handleSelectProject = jest.fn().mockResolvedValue({
                success: true
            });

            // Ensure org selected
            await registry.handle(mockContext, 'ensure-org-selected');

            // Get projects
            await registry.handle(mockContext, 'get-projects');

            // Select project
            await registry.handle(mockContext, 'select-project', { projectId: 'proj-1' });

            expect(projects.handleEnsureOrgSelected).toHaveBeenCalled();
            expect(projects.handleGetProjects).toHaveBeenCalled();
            expect(projects.handleSelectProject).toHaveBeenCalledWith(
                mockContext,
                { projectId: 'proj-1' }
            );
        });

        it('should handle workspace selection flow', async () => {
            const workspaces = require('../../../src/commands/handlers/workspaceHandlers');

            workspaces.handleGetWorkspaces = jest.fn().mockResolvedValue({
                success: true,
                workspaces: [{ id: 'ws-1' }]
            });
            workspaces.handleSelectWorkspace = jest.fn().mockResolvedValue({
                success: true
            });

            // Get workspaces
            await registry.handle(mockContext, 'get-workspaces');

            // Select workspace
            await registry.handle(mockContext, 'select-workspace', { workspaceId: 'ws-1' });

            expect(workspaces.handleGetWorkspaces).toHaveBeenCalled();
            expect(workspaces.handleSelectWorkspace).toHaveBeenCalledWith(
                mockContext,
                { workspaceId: 'ws-1' }
            );
        });

        it('should handle prerequisite checking flow', async () => {
            const prerequisites = require('../../../src/commands/handlers/prerequisites');

            prerequisites.handleCheckPrerequisites = jest.fn().mockResolvedValue({
                success: true,
                allMet: false
            });
            prerequisites.handleInstallPrerequisite = jest.fn().mockResolvedValue({
                success: true
            });
            prerequisites.handleContinuePrerequisites = jest.fn().mockResolvedValue({
                success: true
            });

            // Check prerequisites
            await registry.handle(mockContext, 'check-prerequisites');

            // Install missing prerequisite
            await registry.handle(mockContext, 'install-prerequisite', { prereqId: 'node' });

            // Continue with prerequisites met
            await registry.handle(mockContext, 'continue-prerequisites');

            expect(prerequisites.handleCheckPrerequisites).toHaveBeenCalled();
            expect(prerequisites.handleInstallPrerequisite).toHaveBeenCalled();
            expect(prerequisites.handleContinuePrerequisites).toHaveBeenCalled();
        });
    });

    describe('Error Recovery', () => {
        it('should not affect registry state after handler error', async () => {
            const lifecycle = require('../../../src/commands/handlers/lifecycleHandlers');
            lifecycle.handleReady = jest.fn().mockRejectedValue(new Error('Failed'));
            lifecycle.handleCancel = jest.fn().mockResolvedValue({ success: true });

            // First handler fails
            await expect(registry.handle(mockContext, 'ready')).rejects.toThrow();

            // Second handler should still work
            const result = await registry.handle(mockContext, 'cancel');
            expect(result).toEqual({ success: true });
        });

        it('should handle concurrent handler calls', async () => {
            const auth = require('../../../src/commands/handlers/authenticationHandlers');
            auth.handleCheckAuth = jest.fn().mockResolvedValue({ success: true });

            const projects = require('../../../src/commands/handlers/projectHandlers');
            projects.handleGetProjects = jest.fn().mockResolvedValue({ success: true });

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

    describe('Edge Cases', () => {
        it('should handle null payload', async () => {
            const lifecycle = require('../../../src/commands/handlers/lifecycleHandlers');
            lifecycle.handleReady = jest.fn().mockResolvedValue({ success: true });

            await registry.handle(mockContext, 'ready', null);

            expect(lifecycle.handleReady).toHaveBeenCalledWith(mockContext, null);
        });

        it('should handle undefined payload', async () => {
            const lifecycle = require('../../../src/commands/handlers/lifecycleHandlers');
            lifecycle.handleReady = jest.fn().mockResolvedValue({ success: true });

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

            const projects = require('../../../src/commands/handlers/projectHandlers');
            projects.handleSelectProject = jest.fn().mockResolvedValue({ success: true });

            await registry.handle(mockContext, 'select-project', complexPayload);

            expect(projects.handleSelectProject).toHaveBeenCalledWith(
                mockContext,
                complexPayload
            );
        });
    });
});
