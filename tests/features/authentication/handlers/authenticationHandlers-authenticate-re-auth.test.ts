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

describe('authenticationHandlers - handleAuthenticate - Re-authentication', () => {
	let mockContext: jest.Mocked<HandlerContext>;

	beforeEach(() => {
		mockContext = createAuthHandlerContext();
		jest.clearAllMocks();
	});

	describe('already authenticated scenarios', () => {
		it('should skip authentication when already authenticated and force=false', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
			(mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

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
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
			(mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

			await handleAuthenticate(mockContext, { force: false });

			expect(mockContext.authManager!.ensureSDKInitialized).toHaveBeenCalled();
		});

		it('should handle orgLacksAccess when skipping auth (already authenticated but no org)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(true);

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

	describe('forced re-authentication', () => {
		it('should force re-authentication when force=true', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			const result = await handleAuthenticate(mockContext, { force: true });

			expect(result.success).toBe(true);
			expect(mockContext.authManager!.login).toHaveBeenCalledWith(true);
		});

		it('should send "opening browser" message with force flag text', async () => {
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.testDeveloperPermissions as jest.Mock).mockResolvedValue({
				hasPermissions: true,
			});
			(mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);

			await handleAuthenticate(mockContext, { force: true });

			// Updated: Now uses constant message with subMessage for force mode
			expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
				isChecking: true,
				message: 'Signing in...',
				subMessage: 'Starting fresh login...',
				isAuthenticated: false,
			});
		});
	});
	describe('already authenticated — the final status, field by field', () => {
		beforeEach(() => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
		});

		it('with a current org: already signed in, connected to it, no selection needed', async () => {
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);

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
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue({
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
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.wasOrgClearedDueToValidation as jest.Mock).mockReturnValue(false);

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
