/**
 * HandlerRegistry Registration Tests
 *
 * Tests for handler registration, validation, and metadata
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

describe('HandlerRegistry - Registration', () => {
    let registry: HandlerRegistry;
    let mockContext: jest.Mocked<HandlerContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        setupHandlerMocks();
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
});
