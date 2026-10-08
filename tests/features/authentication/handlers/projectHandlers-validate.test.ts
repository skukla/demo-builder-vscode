/**
 * Project Handlers - Validation Tests
 *
 * Tests for organization validation and error message formatting:
 * - sendOrgMismatch / resolveOrgContext: the org gate
 * - Error message formatting for various scenarios
 */

import {
    handleGetProjects,
    sendOrgMismatch,
} from '@/features/authentication/handlers/projectHandlers';
import type { EnsureOrgContextResult } from '@/features/authentication/services/ensureOrgContext';
import { ErrorCode } from '@/types/errorCodes';
import { createMockContext, mockOrganization } from './projectHandlers.testUtils';
import { entityServicesOf } from '../../../helpers/authenticationServiceFake';

// Mock dependencies
jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/validation/validators/AdobeResourceValidator');
jest.mock('@/types/typeGuards', () => ({
    toError: jest.fn((error: any) => error instanceof Error ? error : new Error(String(error))),
    parseJSON: jest.fn((str: string) => JSON.parse(str))
}));
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000 // Standard API calls (replaces PROJECT_LIST, WORKSPACE_LIST)
    }
}));
jest.mock('@/core/utils/promiseUtils', () => ({
    withTimeout: jest.fn((promise) => promise)
}));

describe('projectHandlers - Validation', () => {
    let mockContext: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    describe('sendOrgMismatch — one message per non-ok status', () => {
        const TARGET = { id: 'org-target' };

        it.each([
            ['needs_relogin', /Sign in with the correct account/],
            ['access_revoked', /Your access to this organization has changed/],
            ['org_mismatch', /needs a different Adobe organization/],
        ] as Array<[EnsureOrgContextResult['status'], RegExp]>)(
            '%s: pushes the structured message on the channel and returns it as the failure',
            async (status, wording) => {
                const ctxResult: EnsureOrgContextResult = { status, targetOrg: TARGET };

                const result = await sendOrgMismatch(mockContext, 'some-channel', ctxResult);

                expect(mockContext.sendMessage).toHaveBeenCalledWith('some-channel', {
                    error: expect.stringMatching(wording),
                    code: ErrorCode.ORG_MISMATCH,
                    targetOrg: TARGET,
                    status,
                });
                expect(result).toEqual({
                    success: false,
                    error: expect.stringMatching(wording),
                    code: ErrorCode.ORG_MISMATCH,
                });
            },
        );

        it('the three messages are distinct — a status is never answered with another\'s copy', async () => {
            const messages = await Promise.all(
                (['needs_relogin', 'access_revoked', 'org_mismatch'] as const).map(async (status) => {
                    const r = await sendOrgMismatch(mockContext, 'ch', { status, targetOrg: TARGET });
                    return r.error;
                }),
            );

            expect(new Set(messages).size).toBe(3);
        });
    });

    describe('resolveOrgContext without an auth manager', () => {
        it('refuses to list orgs, naming the wiring gap, rather than reporting a confident mismatch', async () => {
            const ctx = { ...mockContext, authManager: undefined };

            await expect(handleGetProjects(ctx, { orgId: 'org-123' })).rejects.toThrow(
                /No authentication service on this handler context/,
            );
        });
    });

    describe('Error Message Formatting', () => {
        it('should format timeout errors correctly', async () => {
            entityServicesOf(mockContext.authManager).resolver.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockRejectedValue(
                new Error('Request timed out. Please check your connection and try again.')
            );

            const result = await handleGetProjects(mockContext);

            // Typed error system converts timeout to user-friendly message
            expect(result.error).toBeDefined();
            expect(mockContext.sendMessage).toHaveBeenCalledWith('get-projects', {
                error: expect.any(String),
                code: 'TIMEOUT', // Typed error includes error code
            });
        });

        it('should provide generic error message for non-timeout errors', async () => {
            entityServicesOf(mockContext.authManager).resolver.getCurrentOrganization.mockResolvedValue(mockOrganization);
            mockContext.authManager.getProjects.mockRejectedValue(new Error('Some other error'));

            const result = await handleGetProjects(mockContext);

            expect(result.error).toBe('Failed to load projects. Please try again.');
        });
    });
});
