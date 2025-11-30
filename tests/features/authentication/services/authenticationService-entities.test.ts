import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell';
import type { Logger, StepLogger } from '@/core/logging';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockStepLogger,
    mockOrg,
    mockProject,
    mockWorkspace,
} from './authenticationService.testUtils';

/**
 * AuthenticationService - Entity Retrieval and Selection Test Suite
 *
 * Tests entity management methods:
 * - getOrganizations/getProjects/getWorkspaces
 * - getCurrentOrganization/getCurrentProject/getCurrentWorkspace/getCurrentContext
 * - selectOrganization/selectProject/selectWorkspace
 * - autoSelectOrganizationIfNeeded
 *
 * Total tests: 11
 */

// Only mock external dependencies
jest.mock('@/core/logging');
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');

import { getLogger } from '@/core/logging';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AdobeEntityService } from '@/features/authentication/services/adobeEntityService';

describe('AuthenticationService - Entity Retrieval and Selection', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockEntityService: jest.Mocked<AdobeEntityService>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = createMockCommandExecutor();
        mockLogger = createMockLogger();
        mockStepLogger = createMockStepLogger();

        // Mock getLogger
        (getLogger as jest.Mock).mockReturnValue(mockLogger);

        // Mock StepLogger.create
        const StepLoggerMock = require('@/core/logging').StepLogger;
        StepLoggerMock.create = jest.fn().mockResolvedValue(mockStepLogger);

        // Setup mock SDK client
        mockSDKClient = {
            initialize: jest.fn().mockResolvedValue(undefined),
            ensureInitialized: jest.fn().mockResolvedValue(true),
            clear: jest.fn(),
        } as any;

        // Create mock entity service with full functionality
        mockEntityService = {
            getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
            getProjects: jest.fn().mockResolvedValue([mockProject]),
            getWorkspaces: jest.fn().mockResolvedValue([mockWorkspace]),
            getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg),
            getCurrentProject: jest.fn().mockResolvedValue(mockProject),
            getCurrentWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
            getCurrentContext: jest.fn().mockResolvedValue({ org: mockOrg, project: mockProject, workspace: mockWorkspace }),
            selectOrganization: jest.fn().mockResolvedValue(true),
            selectProject: jest.fn().mockResolvedValue(true),
            selectWorkspace: jest.fn().mockResolvedValue(true),
            autoSelectOrganizationIfNeeded: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock constructors
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => mockSDKClient);
        (AdobeEntityService as jest.MockedClass<typeof AdobeEntityService>).mockImplementation(() => mockEntityService);

        authService = new AuthenticationService('/mock/extension/path', mockLogger, mockCommandExecutor);
    });

    describe('entity retrieval methods', () => {
        it('should get organizations', async () => {
            const result = await authService.getOrganizations();

            expect(result).toEqual([mockOrg]);
            expect(mockEntityService.getOrganizations).toHaveBeenCalled();
        });

        it('should get projects', async () => {
            const result = await authService.getProjects();

            expect(result).toEqual([mockProject]);
            expect(mockEntityService.getProjects).toHaveBeenCalled();
        });

        it('should get workspaces', async () => {
            const result = await authService.getWorkspaces();

            expect(result).toEqual([mockWorkspace]);
            expect(mockEntityService.getWorkspaces).toHaveBeenCalled();
        });

        it('should get current organization', async () => {
            const result = await authService.getCurrentOrganization();

            expect(result).toEqual(mockOrg);
            expect(mockEntityService.getCurrentOrganization).toHaveBeenCalled();
        });

        it('should get current project', async () => {
            const result = await authService.getCurrentProject();

            expect(result).toEqual(mockProject);
            expect(mockEntityService.getCurrentProject).toHaveBeenCalled();
        });

        it('should get current workspace', async () => {
            const result = await authService.getCurrentWorkspace();

            expect(result).toEqual(mockWorkspace);
            expect(mockEntityService.getCurrentWorkspace).toHaveBeenCalled();
        });

        it('should get current context', async () => {
            const result = await authService.getCurrentContext();

            expect(result).toEqual({ org: mockOrg, project: mockProject, workspace: mockWorkspace });
            expect(mockEntityService.getCurrentContext).toHaveBeenCalled();
        });
    });

    describe('selection methods', () => {
        it('should select organization', async () => {
            const result = await authService.selectOrganization('org123');

            expect(result).toBe(true);
            expect(mockEntityService.selectOrganization).toHaveBeenCalledWith('org123');
        });

        it('should select project with org context guard', async () => {
            const result = await authService.selectProject('proj123', 'org123');

            expect(result).toBe(true);
            expect(mockEntityService.selectProject).toHaveBeenCalledWith('proj123', 'org123');
        });

        it('should select workspace with project context guard', async () => {
            const result = await authService.selectWorkspace('ws123', 'proj123');

            expect(result).toBe(true);
            expect(mockEntityService.selectWorkspace).toHaveBeenCalledWith('ws123', 'proj123');
        });

        it('should auto-select organization if needed', async () => {
            mockEntityService.autoSelectOrganizationIfNeeded.mockResolvedValue(mockOrg);

            const result = await authService.autoSelectOrganizationIfNeeded();

            expect(result).toEqual(mockOrg);
            expect(mockEntityService.autoSelectOrganizationIfNeeded).toHaveBeenCalledWith(false);
        });
    });
});
