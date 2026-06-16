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
 * AuthenticationService - Entity Retrieval Test Suite
 *
 * Tests entity management methods:
 * - getOrganizations/getProjects/getWorkspaces
 * - getCurrentOrganization/getCurrentProject/getCurrentWorkspace/getCurrentContext
 *
 * Note: org/project/workspace *selection* wrappers were removed in the
 * org-context refactor (dependent ops now target context per-invocation via
 * `withOrgContext`). `loginAndRestoreProjectContext` is verified to never call
 * the (now removed) global-mutating selectors.
 */

// Only mock external dependencies
jest.mock('@/core/logging');
jest.mock('@/features/authentication/services/adobeSDKClient');
jest.mock('@/features/authentication/services/adobeEntityService');

import { getLogger } from '@/core/logging';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { createEntityServices } from '@/features/authentication/services/adobeEntityService';

describe('AuthenticationService - Entity Retrieval and Selection', () => {
    let authService: AuthenticationService;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockLogger: jest.Mocked<Logger>;
    let mockStepLogger: jest.Mocked<StepLogger>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockFetcher: any;
    let mockResolver: any;
    let mockSelector: any;

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

        // Create mock entity sub-services
        mockFetcher = {
            getOrganizations: jest.fn().mockResolvedValue([mockOrg]),
            getProjects: jest.fn().mockResolvedValue([mockProject]),
            getWorkspaces: jest.fn().mockResolvedValue([mockWorkspace]),
        };
        mockResolver = {
            getCurrentOrganization: jest.fn().mockResolvedValue(mockOrg),
            getCurrentProject: jest.fn().mockResolvedValue(mockProject),
            getCurrentWorkspace: jest.fn().mockResolvedValue(mockWorkspace),
            getCurrentContext: jest.fn().mockResolvedValue({ org: mockOrg, project: mockProject, workspace: mockWorkspace }),
        };
        mockSelector = {
            selectOrganization: jest.fn().mockResolvedValue(true),
            selectProject: jest.fn().mockResolvedValue(true),
            selectWorkspace: jest.fn().mockResolvedValue(true),
            autoSelectOrganizationIfNeeded: jest.fn().mockResolvedValue(undefined),
        };

        // Mock constructors
        (AdobeSDKClient as jest.MockedClass<typeof AdobeSDKClient>).mockImplementation(() => mockSDKClient);
        (createEntityServices as jest.Mock).mockReturnValue({
            fetcher: mockFetcher,
            resolver: mockResolver,
            selector: mockSelector,
        });

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

    describe('loginAndRestoreProjectContext (Phase 4a)', () => {
        beforeEach(() => {
            // login() succeeds: aio auth login returns a valid token in stdout.
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'x'.repeat(150),
                stderr: '',
                duration: 0,
            } as any);
        });

        it('should NOT re-pin org/project/workspace via select* after login', async () => {
            const result = await authService.loginAndRestoreProjectContext({
                organization: 'org123',
                projectId: 'proj123',
                workspace: 'ws123',
            });

            expect(result).toBe(true);
            // Phase 4a: per-op env targeting handles context; no global mutation.
            expect(mockSelector.selectOrganization).not.toHaveBeenCalled();
            expect(mockSelector.selectProject).not.toHaveBeenCalled();
            expect(mockSelector.selectWorkspace).not.toHaveBeenCalled();
        });

        it('should return false when login fails (no select* attempted)', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                code: 1, stdout: '', stderr: 'login failed', duration: 0,
            } as any);

            const result = await authService.loginAndRestoreProjectContext({
                organization: 'org123',
            });

            expect(result).toBe(false);
            expect(mockSelector.selectOrganization).not.toHaveBeenCalled();
        });
    });
});
