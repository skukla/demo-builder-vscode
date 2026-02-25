/**
 * Shared test utilities for Adobe entity service tests
 */

import { createEntityServices, type EntityServices } from '@/features/authentication/services/adobeEntityService';
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
        org_id: '123456',
    },
];

export const mockWorkspaces: AdobeWorkspace[] = [
    { id: 'ws1', name: 'Production', title: 'Production' },
    { id: 'ws2', name: 'Stage', title: 'Stage' },
];

/**
 * Convenience facade that delegates to entity sub-services.
 * Preserves the test API so existing test files need no changes.
 */
export interface EntityServiceFacade {
    getOrganizations: EntityServices['fetcher']['getOrganizations'];
    getProjects: EntityServices['fetcher']['getProjects'];
    getWorkspaces: EntityServices['fetcher']['getWorkspaces'];
    getCurrentOrganization: EntityServices['resolver']['getCurrentOrganization'];
    getCurrentProject: EntityServices['resolver']['getCurrentProject'];
    getCurrentWorkspace: EntityServices['resolver']['getCurrentWorkspace'];
    getCurrentContext: EntityServices['resolver']['getCurrentContext'];
    selectOrganization: EntityServices['selector']['selectOrganization'];
    selectProject: EntityServices['selector']['selectProject'];
    selectWorkspace: EntityServices['selector']['selectWorkspace'];
    autoSelectOrganizationIfNeeded: EntityServices['selector']['autoSelectOrganizationIfNeeded'];
}

export interface TestMocks {
    service: EntityServiceFacade;
    entities: EntityServices;
    mockCommandExecutor: jest.Mocked<CommandExecutor>;
    mockSDKClient: jest.Mocked<AdobeSDKClient>;
    mockCacheManager: jest.Mocked<AuthCacheManager>;
    mockOrgValidator: jest.Mocked<OrganizationValidator>;
    mockLogger: jest.Mocked<Logger>;
    mockStepLogger: jest.Mocked<StepLogger>;
}

export function setupMocks(): TestMocks {
    jest.clearAllMocks();

    const mockCommandExecutor: jest.Mocked<CommandExecutor> = {
        execute: jest.fn(),
    } as unknown as jest.Mocked<CommandExecutor>;

    const mockSDKClient: jest.Mocked<AdobeSDKClient> = {
        isInitialized: jest.fn().mockReturnValue(false),
        getClient: jest.fn(),
        ensureInitialized: jest.fn(),
    } as unknown as jest.Mocked<AdobeSDKClient>;

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
            message: 'Has Developer role',
        }),
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

    const entities = createEntityServices(
        mockCommandExecutor,
        mockSDKClient,
        mockCacheManager,
        mockOrgValidator,
        mockLogger,
        mockStepLogger,
    );

    // Build a convenience facade so tests can call service.getOrganizations() etc.
    const service: EntityServiceFacade = {
        getOrganizations: (...args) => entities.fetcher.getOrganizations(...args),
        getProjects: (...args) => entities.fetcher.getProjects(...args),
        getWorkspaces: (...args) => entities.fetcher.getWorkspaces(...args),
        getCurrentOrganization: (...args) => entities.resolver.getCurrentOrganization(...args),
        getCurrentProject: (...args) => entities.resolver.getCurrentProject(...args),
        getCurrentWorkspace: (...args) => entities.resolver.getCurrentWorkspace(...args),
        getCurrentContext: (...args) => entities.resolver.getCurrentContext(...args),
        selectOrganization: (...args) => entities.selector.selectOrganization(...args),
        selectProject: (...args) => entities.selector.selectProject(...args),
        selectWorkspace: (...args) => entities.selector.selectWorkspace(...args),
        autoSelectOrganizationIfNeeded: (...args) => entities.selector.autoSelectOrganizationIfNeeded(...args),
    };

    return {
        service,
        entities,
        mockCommandExecutor,
        mockSDKClient,
        mockCacheManager,
        mockOrgValidator,
        mockLogger,
        mockStepLogger,
    };
}
