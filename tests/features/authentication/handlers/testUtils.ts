/**
 * Shared Test Utilities for Authentication Handlers
 *
 * Common mock factories and test data used across authentication handler tests.
 */

import type { HandlerContext } from '@/types/handlers';
import type { AdobeOrg, AdobeProject } from '@/features/authentication/services/types';
import type { PrerequisitesManager } from '@/features/prerequisites';
import type { ComponentHandler } from '@/features/components/handlers/componentHandler';
import type { ErrorLogger } from '@/core/logging/errorLogger';
import type { ProgressUnifier } from '@/core/utils/progressUnifier';
import type { StepLogger } from '@/core/logging/stepLogger';
import type { Logger, DebugLogger } from '@/types/logger';
import type { StateManager } from '@/core/state/stateManager';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ExtensionContext } from 'vscode';

// Test data
export const mockOrg: AdobeOrg = {
    id: 'org123',
    code: 'ORGCODE',
    name: 'Test Organization',
};

export const mockProject: AdobeProject = {
    id: 'proj456',
    name: 'Test Project',
};

export const mockOrgs: AdobeOrg[] = [
    { id: 'org1', code: 'ORG1', name: 'Organization One' },
    { id: 'org2', code: 'ORG2', name: 'Organization Two' },
];

/**
 * Creates a mock HandlerContext for testing
 *
 * Note: Some properties use `as any` to simplify mocking.
 * This is acceptable in test utilities to avoid overly complex mock setups.
 *
 * @param overrides - Partial overrides for specific properties
 * @returns A fully mocked HandlerContext
 */
export function createMockHandlerContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return {
        prereqManager: {} as PrerequisitesManager,
        authManager: {
            isAuthenticatedQuick: jest.fn(),
            ensureSDKInitialized: jest.fn(),
            getCurrentOrganization: jest.fn(),
            getCurrentProject: jest.fn(),
            getCachedOrganization: jest.fn(),
            getCachedProject: jest.fn(),
            getValidationCache: jest.fn(),
            wasOrgClearedDueToValidation: jest.fn(),
            login: jest.fn(),
            clearCache: jest.fn(),
            getOrganizations: jest.fn(),
            selectOrganization: jest.fn(),
            setCachedOrganization: jest.fn(),
            autoSelectOrganizationIfNeeded: jest.fn(),
            setOrgRejectedFlag: jest.fn(),
            validateAndClearInvalidOrgContext: jest.fn(),
            testDeveloperPermissions: jest.fn(),
        } as any, // Simplified mock - full AuthenticationService interface not needed for tests
        componentHandler: {} as ComponentHandler,
        errorLogger: {} as ErrorLogger,
        progressUnifier: {} as ProgressUnifier,
        stepLogger: {} as StepLogger,
        logger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any, // Simplified mock
        debugLogger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any, // Simplified mock
        context: {} as ExtensionContext,
        panel: undefined,
        stateManager: {} as StateManager,
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
        },
        ...overrides,
    } as jest.Mocked<HandlerContext>;
}