/**
 * Token Expiry Detection Test Suite
 *
 * Tests the token expiry validation that distinguishes between:
 * - "Session expired" (invalid token)
 * - "No organization access" (valid token, 0 orgs)
 *
 * CRITICAL: Token expiry MUST be checked BEFORE fetching organizations
 */

import { handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext, mockOrg } from './testUtils';

describe('Token Expiry Detection - handleAuthenticate()', () => {
    let mockContext: jest.Mocked<HandlerContext>;
    let mockTokenManager: any;

    beforeEach(() => {
        mockContext = createMockHandlerContext();

        // Create mock token manager
        mockTokenManager = {
            inspectToken: jest.fn(),
        };

        // Add getTokenManager method to authManager
        (mockContext.authManager as any).getTokenManager = jest.fn(() => mockTokenManager);

        jest.clearAllMocks();
    });

    describe('token validation order', () => {
        it('should call inspectToken() before getOrganizations()', async () => {
            // Arrange
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
            (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
            mockTokenManager.inspectToken.mockResolvedValue({ valid: true, expiresIn: 120 });
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
            (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

            // Act
            await handleAuthenticate(mockContext);

            // Assert - inspectToken called before getOrganizations
            const inspectCallOrder = mockTokenManager.inspectToken.mock.invocationCallOrder[0];
            const getOrgsCallOrder = (mockContext.authManager!.getOrganizations as jest.Mock).mock.invocationCallOrder[0];

            expect(inspectCallOrder).toBeDefined();
            expect(getOrgsCallOrder).toBeDefined();
            expect(inspectCallOrder).toBeLessThan(getOrgsCallOrder);
        });
    });

    describe('invalid token scenarios', () => {
        it('should send "Session expired" message for invalid token', async () => {
            // Arrange
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
            (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
            mockTokenManager.inspectToken.mockResolvedValue({ valid: false, expiresIn: -30 });

            // Act
            await handleAuthenticate(mockContext);

            // Assert - "Session expired" message sent
            expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                authenticated: false,
                isAuthenticated: false,
                isChecking: false,
                message: 'Session expired',
                subMessage: 'Please sign in again to continue',
                requiresOrgSelection: true,
                orgLacksAccess: false,
            }));

            // getOrganizations should NOT be called for expired token
            expect(mockContext.authManager!.getOrganizations).not.toHaveBeenCalled();
        });

        it('should return failure result for invalid token', async () => {
            // Arrange
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
            (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
            mockTokenManager.inspectToken.mockResolvedValue({ valid: false, expiresIn: -30 });

            // Act
            const result = await handleAuthenticate(mockContext);

            // Assert
            expect(result.success).toBe(false);
            expect(mockContext.sharedState.isAuthenticating).toBe(false);
        });
    });

    describe('valid token with zero orgs', () => {
        it('should send "No organization access" for valid token with 0 orgs', async () => {
            // Arrange
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
            (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
            mockTokenManager.inspectToken.mockResolvedValue({ valid: true, expiresIn: 120 });
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);

            // Act
            await handleAuthenticate(mockContext);

            // Assert - "No organization access" message sent
            expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                authenticated: true,
                isAuthenticated: true,
                isChecking: false,
                message: 'No organizations found',
                subMessage: "Your Adobe account doesn't have access to any organizations with App Builder",
                requiresOrgSelection: true,
                orgLacksAccess: true,
            }));
        });
    });

    describe('valid token with orgs', () => {
        it('should proceed normally for valid token with orgs', async () => {
            // Arrange
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
            (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
            mockTokenManager.inspectToken.mockResolvedValue({ valid: true, expiresIn: 120 });
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
            (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

            // Act
            await handleAuthenticate(mockContext);

            // Assert - normal flow continues
            expect(mockContext.authManager!.selectOrganization).toHaveBeenCalledWith('org123');
            expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', expect.objectContaining({
                authenticated: true,
                isAuthenticated: true,
                message: 'All set!',
            }));
        });
    });

    describe('graceful degradation', () => {
        it('should gracefully degrade if inspectToken() fails', async () => {
            // Arrange
            (mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
            (mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
            mockTokenManager.inspectToken.mockRejectedValue(new Error('CLI timeout'));
            (mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
            (mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
            (mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

            // Act
            await handleAuthenticate(mockContext);

            // Assert - warning logged, flow continues to getOrganizations
            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Token inspection failed'),
                expect.any(Error),
            );
            expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
        });
    });
});
