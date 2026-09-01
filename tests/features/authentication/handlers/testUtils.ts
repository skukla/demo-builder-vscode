/**
 * Shared Test Utilities for Authentication Handlers
 *
 * Common mock factories and test data used across authentication handler tests.
 */

import type { HandlerContext } from '@/types/handlers';
import type { AdobeOrg, AdobeProject } from '@/features/authentication/services/types';
import type { PrerequisitesManager } from '@/features/prerequisites/services/PrerequisitesManager';
import type { ErrorLogger } from '@/core/logging/errorLogger';
import type { ProgressUnifier } from '@/core/utils/progressUnifier/ProgressUnifier';
import type { StepLogger } from '@/core/logging/stepLogger';
import { createMockHandlerContext as createMockHandlerContextBase } from '../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
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
export function createAuthHandlerContext(overrides?: Partial<HandlerContext>): jest.Mocked<HandlerContext> {
    return createMockHandlerContextBase({
        prereqManager: {} as PrerequisitesManager,
        // The FULL interface, mocked. The literal here named fourteen of the
        // service's methods and cast the rest away under a comment saying the full
        // interface was "not needed" — which was true only because the cast meant
        // nothing checked.
        authManager: createMockAuthenticationService(),
        errorLogger: {} as ErrorLogger,
        progressUnifier: {} as ProgressUnifier,
        stepLogger: {} as StepLogger,
        logger: createMockLogger(), // Simplified mock
        debugLogger: createMockLogger(), // Simplified mock
        context: createMockExtensionContext(),
        panel: undefined,
        stateManager: createMockStateManager(),
        communicationManager: undefined,
        sendMessage: jest.fn().mockResolvedValue(undefined),
        sharedState: {
            isAuthenticating: false,
        },
        ...overrides,
    })
}