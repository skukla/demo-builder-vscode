/**
 * Shared test utilities for AdobeEntityService tests
 */

import { AdobeEntityService } from '@/features/authentication/services/adobeEntityService';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type { Logger, StepLogger } from '@/core/logging';
import type { AdobeOrg, AdobeProject, AdobeWorkspace } from '@/features/authentication/services/types';

export const mockOrgs: AdobeOrg[] = [
    { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' },
    { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Organization 2' },
];

export const mockProjects: AdobeProject[] = [
    {
        id: 'proj1',
        name: 'Project 1',
        title: 'Project 1 Title',
        description: 'Test project',
        org_id: '123456', // String ID as per AdobeProject interface
    },
];

export const mockWorkspaces: AdobeWorkspace[] = [
    { id: 'ws1', name: 'Production', title: 'Production' },
    { id: 'ws2', name: 'Stage', title: 'Stage' },
];

export interface TestMocks {
    service: AdobeEntityService;
    mockCommandExecutor: jest.Mocked<CommandExecutor>;
    mockSDKClient: jest.Mocked<AdobeSDKClient>;
    mockCacheManager: jest.Mocked<AuthCacheManager>;
    mockOrgValidator: jest.Mocked<OrganizationValidator>;
    mockLogger: jest.Mocked<Logger>;
    mockStepLogger: jest.Mocked<StepLogger>;
}

export function setupMocks(): TestMocks {
    jest.clearAllMocks();

    // Mock external dependencies only
    const mockCommandExecutor: jest.Mocked<CommandExecutor> = {
        execute: jest.fn(),
    } as unknown as jest.Mocked<CommandExecutor>;

    const mockSDKClient: jest.Mocked<AdobeSDKClient> = {
        isInitialized: jest.fn().mockReturnValue(false),
        getClient: jest.fn(),
        ensureInitialized: jest.fn(),
    } as unknown as jest.Mocked<AdobeSDKClient>;

    // These are internal but part of constructor, mock minimally
    const mockCacheManager: jest.Mocked<AuthCacheManager> = {
        getCachedOrgList: jest.fn().mockReturnValue(undefined),
        setCachedOrgList: jest.fn(),
        getCachedOrganization: jest.fn().mockReturnValue(undefined),
        setCachedOrganization: jest.fn(),
        setCachedProject: jest.fn(),
        setCachedWorkspace: jest.fn(),
        getCachedProject: jest.fn().mockReturnValue(undefined),
        getCachedWorkspace: jest.fn().mockReturnValue(undefined),
        getCachedConsoleWhere: jest.fn().mockReturnValue(undefined),
        setCachedConsoleWhere: jest.fn(),
        clearConsoleWhereCache: jest.fn(),
        setOrgClearedDueToValidation: jest.fn(),
    } as unknown as jest.Mocked<AuthCacheManager>;

    const mockOrgValidator: jest.Mocked<OrganizationValidator> = {
        testDeveloperPermissions: jest.fn().mockResolvedValue({
            hasPermissions: true,
            message: 'Has Developer role'
        })
    } as unknown as jest.Mocked<OrganizationValidator>;

    const mockLogger: jest.Mocked<Logger> = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    const mockStepLogger: jest.Mocked<StepLogger> = {
        logTemplate: jest.fn(),
    } as unknown as jest.Mocked<StepLogger>;

    const service = new AdobeEntityService(
        mockCommandExecutor,
        mockSDKClient,
        mockCacheManager,
        mockOrgValidator,
        mockLogger,
        mockStepLogger
    );

    return {
        service,
        mockCommandExecutor,
        mockSDKClient,
        mockCacheManager,
        mockOrgValidator,
        mockLogger,
        mockStepLogger
    };
}