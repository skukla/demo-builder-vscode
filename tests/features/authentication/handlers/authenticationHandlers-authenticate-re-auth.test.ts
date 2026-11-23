/**
 * handleAuthenticate Test Suite - Re-authentication Flows
 *
 * Tests for re-authentication scenarios including:
 * - Skip authentication when already authenticated
 * - Force re-authentication with force flag
 * - SDK initialization when already authenticated
 */

import { handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createAuthHandlerContext, mockOrg, mockProject } from './testUtils';
import { entityServicesOf } from '../../../helpers/authenticationServiceFake';

describe('authenticationHandlers - handleAuthenticate - Re-authentication', () => {
	let mockContext: jest.Mocked<HandlerContext>;

	beforeEach(() => {
		mockContext = createAuthHandlerContext();
		jest.clearAllMocks();
	});

	describe('already authenticated scenarios', () => {
		it('should skip authentication when already authenticated and force=false', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getSdkClient().ensureInitialized as jest.Mock).mockResolvedValue(undefined);
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
			(mockContext.authManager!.getCacheManager().wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

			const result = await handleAuthenticate(mockContext, { force: false });

			expect(result.success).toBe(true);
			expect(mockContext.authManager!.login).not.toHaveBeenCalled();
			expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
				'auth-status',
				expect.objectContaining({
					message: 'Already signed in',
				})
			);
		});

		it('should initialize SDK when skipping authentication (already authenticated)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getSdkClient().ensureInitialized as jest.Mock).mockResolvedValue(undefined);
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
			(mockContext.authManager!.getCacheManager().wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

			await handleAuthenticate(mockContext, { force: false });

			expect(mockContext.authManager!.getSdkClient().ensureInitialized).toHaveBeenCalled();
		});

		it('should handle orgLacksAccess when skipping auth (already authenticated but no org)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getSdkClient().ensureInitialized as jest.Mock).mockResolvedValue(undefined);
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentOrganization as jest.Mock).mockResolvedValue(undefined);
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentProject as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getCacheManager().wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(true);

			await handleAuthenticate(mockContext, { force: false });

			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: true,
				isAuthenticated: true,
				isChecking: false,
				organization: undefined,
				message: 'Organization selection required',
				subMessage: 'Organization no longer accessible or lacks App Builder access',
				requiresOrgSelection: true,
				orgLacksAccess: true,
			});
		});
	});

	// The wizard's force is its Switch IMS Org (on the org screen and the no-App-Builder screen):
	// the account chooser, which is the org switch's sign-in (2026-11-18). A normal
	// press runs the one Sign In, never forced.
	describe('forced re-authentication', () => {
		it('routes force=true to the org switch sign-in, not a forced login of its own', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.loginAndRestoreProjectContext as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getSdkClient().ensureInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.getCacheManager().setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			const result = await handleAuthenticate(mockContext, { force: true });

			expect(result.success).toBe(true);
			expect(mockContext.authManager!.loginAndRestoreProjectContext).toHaveBeenCalledWith({}, true);
			expect(mockContext.authManager!.login).not.toHaveBeenCalled();
		});

		// Re-Authenticate Now renews the same account: forced, over a session that is
		// still good, but through the one Sign In, not the org switch (owner, 2026-11-18).
		it('routes fresh=true to a forced one Sign In, even over a good session', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);

			const result = await handleAuthenticate(mockContext, { fresh: true });

			expect(result.success).toBe(true);
			expect(mockContext.authManager!.login).toHaveBeenCalledWith(true);
			expect(mockContext.authManager!.loginAndRestoreProjectContext).not.toHaveBeenCalled();
			expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
				isChecking: true,
				message: 'Signing in',
				subMessage: 'Starting fresh login',
				isAuthenticated: false,
			});
		});

		it('runs the one Sign In, un-forced, when force is not set', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);

			const result = await handleAuthenticate(mockContext, { force: false });

			expect(result.success).toBe(true);
			expect(mockContext.authManager!.login).toHaveBeenCalledWith();
			expect(mockContext.authManager!.loginAndRestoreProjectContext).not.toHaveBeenCalled();
		});

		it('should send "opening browser" message with force flag text', async () => {
			(mockContext.authManager!.loginAndRestoreProjectContext as jest.Mock).mockResolvedValue(true);
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.testDeveloperPermissions as jest.Mock).mockResolvedValue({
				hasPermissions: true,
			});
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);

			await handleAuthenticate(mockContext, { force: true });

			// Updated: Now uses constant message with subMessage for force mode
			expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
				isChecking: true,
				message: 'Signing in',
				subMessage: 'Starting fresh login',
				isAuthenticated: false,
			});
		});
	});
	describe('already authenticated — the final status, field by field', () => {
		beforeEach(() => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getSdkClient().ensureInitialized as jest.Mock).mockResolvedValue(undefined);
		});

		it('with a current org: already signed in, connected to it, no selection needed', async () => {
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);

			const result = await handleAuthenticate(mockContext);

			expect(result).toEqual({ success: true });
			expect(mockContext.sharedState.isAuthenticating).toBe(false);
			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: true,
				isAuthenticated: true,
				isChecking: false,
				organization: mockOrg,
				message: 'Already signed in',
				subMessage: 'Connected to Test Organization',
				requiresOrgSelection: false,
				orgLacksAccess: false,
			});
		});

		it('with an org that has no name: connected to "your organization"', async () => {
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentOrganization as jest.Mock).mockResolvedValue({
				...mockOrg,
				name: '',
			});

			await handleAuthenticate(mockContext);

			expect(mockContext.sendMessage).toHaveBeenLastCalledWith(
				'auth-status',
				expect.objectContaining({ subMessage: 'Connected to your organization' }),
			);
		});

		it('with no org and no validation clearing: already signed in, selection needed', async () => {
			(entityServicesOf(mockContext.authManager!).resolver.getCurrentOrganization as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getCacheManager().wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

			await handleAuthenticate(mockContext);

			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: true,
				isAuthenticated: true,
				isChecking: false,
				organization: undefined,
				message: 'Already signed in',
				subMessage: 'Please complete authentication to continue',
				requiresOrgSelection: true,
				orgLacksAccess: false,
			});
		});
	});
});
