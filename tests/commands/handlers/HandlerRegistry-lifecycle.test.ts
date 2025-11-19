/**
 * HandlerRegistry Lifecycle Tests
 *
 * Tests for handler lifecycle, integration scenarios, and workflow orchestration
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

describe('HandlerRegistry - Lifecycle', () => {
    let registry: HandlerRegistry;
    let mockContext: jest.Mocked<HandlerContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
        setupHandlerMocks();
        registry = new HandlerRegistry();
    });

    describe('Integration Scenarios', () => {
        it('should handle sequence of authentication flow', async () => {
            const auth = require('../../../src/features/authentication/handlers/authenticationHandlers');
            (auth.handleCheckAuth as jest.Mock).mockResolvedValue({
                success: true,
                authenticated: false
            });
            (auth.handleAuthenticate as jest.Mock).mockResolvedValue({
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
            const projects = require('../../../src/features/authentication/handlers/projectHandlers');

            (projects.handleEnsureOrgSelected as jest.Mock).mockResolvedValue({
                success: true,
                hasOrg: true
            });
            (projects.handleGetProjects as jest.Mock).mockResolvedValue({
                success: true,
                projects: [{ id: 'proj-1' }]
            });
            (projects.handleSelectProject as jest.Mock).mockResolvedValue({
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
            const workspaces = require('../../../src/features/authentication/handlers/workspaceHandlers');

            (workspaces.handleGetWorkspaces as jest.Mock).mockResolvedValue({
                success: true,
                workspaces: [{ id: 'ws-1' }]
            });
            (workspaces.handleSelectWorkspace as jest.Mock).mockResolvedValue({
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
            const prerequisites = require('../../../src/features/prerequisites/handlers');

            (prerequisites.handleCheckPrerequisites as jest.Mock).mockResolvedValue({
                success: true,
                allMet: false
            });
            (prerequisites.handleInstallPrerequisite as jest.Mock).mockResolvedValue({
                success: true
            });
            (prerequisites.handleContinuePrerequisites as jest.Mock).mockResolvedValue({
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
});
