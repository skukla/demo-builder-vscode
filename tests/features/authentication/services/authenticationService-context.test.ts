import { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { CommandExecutor } from '@/core/shell';
import type { Logger, StepLogger } from '@/core/logging';
import {
    createMockCommandExecutor,
    createMockLogger,
    createMockStepLogger,
    createSuccessResult,
    createFailureResult,
    createOrgContextResult,
    createValidTokenResult,
    createProjectListResult,
    mockOrg,
} from './authenticationService.testUtils';

/**
 * AuthenticationService - Context Validation and SDK Test Suite
 *
 * Tests SDK management and context validation:
 * - SDK initialization (ensureSDKInitialized)
 * - Org context validation (validateAndClearInvalidOrgContext)
 * - Developer permissions testing (testDeveloperPermissions)
 * - Integration scenarios with caching
 *
 * Total tests: 5
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

describe('AuthenticationService - Context Validation and SDK', () => {
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
            getProjects: jest.fn().mockResolvedValue([]),
            getWorkspaces: jest.fn().mockResolvedValue([]),
        } as any;

        mockResolver = {
            getCurrentOrganization: jest.fn().mockResolvedValue(undefined),
            getCurrentProject: jest.fn().mockResolvedValue(undefined),
            getCurrentWorkspace: jest.fn().mockResolvedValue(undefined),
            getCurrentContext: jest.fn().mockResolvedValue({}),
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

    describe('SDK management', () => {
        it('should ensure SDK is initialized', async () => {
            // Given: SDK client is configured
            mockSDKClient.ensureInitialized.mockResolvedValue(true);

            // When: ensuring SDK initialization
            const result = await authService.ensureSDKInitialized();

            // Then: should return success
            expect(result).toBe(true);
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
        });
    });

    describe('org context validation', () => {
        it('should validate and clear invalid org when app list fails', async () => {
            // Given: Valid context but app list will fail
            mockCommandExecutor.execute
                .mockResolvedValueOnce(createOrgContextResult())
                .mockResolvedValueOnce(createFailureResult('Error: Cannot list apps'));

            // When: validating org context
            await authService.validateAndClearInvalidOrgContext();

            // Then: should have attempted validation
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console where --json',
                expect.any(Object)
            );
        });

        it('should test developer permissions via app list', async () => {
            // Given: Valid org with apps
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult(JSON.stringify([{ name: 'App 1', app_id: 'app1' }]))
            );

            // When: testing developer permissions
            const result = await authService.testDeveloperPermissions();

            // Then: should return permission status
            expect(result).toHaveProperty('hasPermissions');
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio app list --json',
                expect.any(Object)
            );
        });
    });

    describe('integration scenarios', () => {
        it('should handle full authentication flow with caching', async () => {
            // Given: First authentication check with valid token
            const futureExpiry = Date.now() + 3600000;
            mockCommandExecutor.execute
                .mockResolvedValueOnce(createValidTokenResult(futureExpiry))
                .mockResolvedValueOnce(createOrgContextResult())
                .mockResolvedValueOnce(createProjectListResult());

            // When: Multiple authentication checks
            const result1 = await authService.isAuthenticated();

            // Reset mock to return cached result
            mockCommandExecutor.execute.mockResolvedValue(createValidTokenResult(futureExpiry));

            const result2 = await authService.isAuthenticated();

            // Then: Both should succeed
            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });
    });
});
