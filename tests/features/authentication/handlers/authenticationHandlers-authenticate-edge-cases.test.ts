/**
 * handleAuthenticate Test Suite - Edge Cases
 *
 * Tests for edge case scenarios including:
 * - Multiple organizations handling
 * - Zero organizations handling
 * - Payload parameter handling
 * - orgLacksAccess flag scenarios
 */

import { handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext, mockOrg, mockProject, mockOrgs } from './authenticationHandlers-authenticate.testUtils';

describe('authenticationHandlers - handleAuthenticate - Edge Cases', () => {
	let mockContext: jest.Mocked<HandlerContext>;

	beforeEach(() => {
		mockContext = createMockHandlerContext();
		jest.clearAllMocks();
	});

	describe('multiple organizations', () => {
		it('should detect and log multiple orgs after login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

			await handleAuthenticate(mockContext);

			// Org list is fetched after login
			expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
			expect(mockContext.logger.debug).toHaveBeenCalledWith(
				expect.stringMatching(/\d+ organizations available, user must select/)
			);
		});

		it('should require org selection when multiple orgs available', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

			await handleAuthenticate(mockContext);

			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: true,
				isAuthenticated: true,
				isChecking: false,
				organization: undefined,
				project: undefined,
				message: 'Sign-in complete',
				subMessage: 'Choose your organization to continue',
				requiresOrgSelection: true,
				orgLacksAccess: false,
			});
		});

		it('should handle forced login with multiple orgs but none selected', async () => {
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue(mockOrgs);

			await handleAuthenticate(mockContext, { force: true });

			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: true,
				isAuthenticated: true,
				isChecking: false,
				organization: undefined,
				project: undefined,
				message: 'Sign-in complete',
				subMessage: 'Choose your organization to continue',
				requiresOrgSelection: true,
				orgLacksAccess: false,
			});
		});
	});

	describe('zero organizations', () => {
		it('should detect and log zero orgs after login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);

			await handleAuthenticate(mockContext);

			// Org list is fetched after login
			expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
			expect(mockContext.logger.warn).toHaveBeenCalledWith(
				expect.stringMatching(/No organizations accessible for this user/)
			);
		});

		it('should show orgLacksAccess when zero orgs available', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);

			await handleAuthenticate(mockContext);

			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: true,
				isAuthenticated: true,
				isChecking: false,
				organization: undefined,
				project: undefined,
				message: 'No organizations found',
				subMessage: 'Your Adobe account doesn\'t have access to any organizations with App Builder',
				requiresOrgSelection: true,
				orgLacksAccess: true,
			});
		});

		it('should handle orgLacksAccess flag after forced login', async () => {
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([]);

			await handleAuthenticate(mockContext, { force: true });

			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: true,
				isAuthenticated: true,
				isChecking: false,
				organization: undefined,
				project: undefined,
				message: 'No organizations found',
				subMessage: 'Your Adobe account doesn\'t have access to any organizations with App Builder',
				requiresOrgSelection: true,
				orgLacksAccess: true,
			});
		});
	});

	describe('validation during login', () => {
		it('should NOT validate org during login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// Validation is NOT done during login
			expect(mockContext.authManager!.validateAndClearInvalidOrgContext).not.toHaveBeenCalled();
		});

		it('should NOT check permissions during login (cache unchanged)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);

			await handleAuthenticate(mockContext);

			// Permission check is deferred, so no cache clearing for permission failures
			expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
			// clearCache() is not called (force=false by default)
			expect(mockContext.authManager!.clearCache).not.toHaveBeenCalled();
		});
	});

	describe('payload parameter handling', () => {
		it('should handle payload = undefined (default force = false)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
			(mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

			await handleAuthenticate(mockContext);

			expect(mockContext.authManager!.login).not.toHaveBeenCalled();
		});

		it('should handle payload.force = undefined (default false)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
			(mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

			await handleAuthenticate(mockContext, {});

			expect(mockContext.authManager!.login).not.toHaveBeenCalled();
		});
	});
});
