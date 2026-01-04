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
jest.mock('@/features/authentication/services/adobeEntityFetcher');
jest.mock('@/features/authentication/services/adobeContextResolver');
jest.mock('@/features/authentication/services/adobeEntitySelector');

import { getLogger } from '@/core/logging';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import { AdobeContextResolver } from '@/features/authentication/services/adobeContextResolver';
import { AdobeEntitySelector } from '@/features/authentication/services/adobeEntitySelector';

describe('AuthenticationService - Entity Retrieval and Selection', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockFetcher: jest.Mocked<AdobeEntityFetcher>;
    let mockResolver: jest.Mocked<AdobeContextResolver>;
    let mockSelector: jest.Mocked<AdobeEntitySelector>;

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

        // Create mock specialized services
        mockFetcher = {
            getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
            getProjects: jest.fn().mockResolvedValue([mockProject]),
            getWorkspaces: jest.fn().mockResolvedValue([mockWorkspace]),
        } as any;

        mockResolver = {
            getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg),
            getCurrentProject: jest.fn().mockResolvedValue(mockProject),
            getCurrentWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
            getCurrentContext: jest.fn().mockResolvedValue({ org: mockOrg, project: mockProject, workspace: mockWorkspace }),
        } as any;

        mockSelector = {
            selectOrganization: jest.fn().mockResolvedValue(true),
            selectProject: jest.fn().mockResolvedValue(true),
            selectWorkspace: jest.fn().mockResolvedValue(true),
            autoSelectOrganizationIfNeeded: jest.fn().mockResolvedValue(undefined),
            clearConsoleContext: jest.fn().mockResolvedValue(undefined),
        } as any;

        // Mock constructors
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => mockSDKClient);
        (AdobeEntityFetcher as jest.MockedClass<typeof AdobeEntityFetcher>).mockImplementation(() => mockFetcher);
        (AdobeContextResolver as jest.MockedClass<typeof AdobeContextResolver>).mockImplementation(() => mockResolver);
        (AdobeEntitySelector as jest.MockedClass<typeof AdobeEntitySelector>).mockImplementation(() => mockSelector);

        authService = new AuthenticationService('/mock/extension/path', mockLogger, mockCommandExecutor);
    });

    describe('entity retrieval methods', () => {
        it('should get organizations', async () => {
            const result = await authService.getOrganizations();

            expect(result).toEqual([mockOrg]);
            expect(mockFetcher.getOrganizations).toHaveBeenCalled();
        });

        it('should get projects', async () => {
            const result = await authService.getProjects();

            expect(result).toEqual([mockProject]);
            expect(mockFetcher.getProjects).toHaveBeenCalled();
        });

        it('should get workspaces', async () => {
            const result = await authService.getWorkspaces();

            expect(result).toEqual([mockWorkspace]);
            expect(mockFetcher.getWorkspaces).toHaveBeenCalled();
        });

        it('should get current organization', async () => {
            const result = await authService.getCurrentOrganization();

            expect(result).toEqual(mockOrg);
            expect(mockResolver.getCurrentOrganization).toHaveBeenCalled();
        });

        it('should get current project', async () => {
            const result = await authService.getCurrentProject();

            expect(result).toEqual(mockProject);
            expect(mockResolver.getCurrentProject).toHaveBeenCalled();
        });

        it('should get current workspace', async () => {
            const result = await authService.getCurrentWorkspace();

            expect(result).toEqual(mockWorkspace);
            expect(mockResolver.getCurrentWorkspace).toHaveBeenCalled();
        });

        it('should get current context', async () => {
            const result = await authService.getCurrentContext();

            expect(result).toEqual({ org: mockOrg, project: mockProject, workspace: mockWorkspace });
            expect(mockResolver.getCurrentContext).toHaveBeenCalled();
        });
    });

    describe('selection methods', () => {
        it('should select organization', async () => {
            const result = await authService.selectOrganization('org123');

            expect(result).toBe(true);
            expect(mockSelector.selectOrganization).toHaveBeenCalledWith('org123');
        });

        it('should select project with org context guard', async () => {
            const result = await authService.selectProject('proj123', 'org123');

            expect(result).toBe(true);
            expect(mockSelector.selectProject).toHaveBeenCalledWith('proj123', 'org123');
        });

        it('should select workspace with project context guard', async () => {
            const result = await authService.selectWorkspace('ws123', 'proj123');

            expect(result).toBe(true);
            expect(mockSelector.selectWorkspace).toHaveBeenCalledWith('ws123', 'proj123');
        });

        it('should auto-select organization if needed', async () => {
            mockSelector.autoSelectOrganizationIfNeeded.mockResolvedValue(mockOrg);

            const result = await authService.autoSelectOrganizationIfNeeded();

            expect(result).toEqual(mockOrg);
            expect(mockSelector.autoSelectOrganizationIfNeeded).toHaveBeenCalledWith(false);
        });
    });
});
