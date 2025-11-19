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
import { createMockHandlerContext, mockOrg, mockProject } from './authenticationHandlers-authenticate.testUtils';

describe('authenticationHandlers - handleAuthenticate - Re-authentication', () => {
	let mockContext: jest.Mocked<HandlerContext>;

	beforeEach(() => {
		mockContext = createMockHandlerContext();
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
				project: undefined,
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
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			const result = await handleAuthenticate(mockContext, { force: true });

			expect(result.success).toBe(true);
			expect(mockContext.authManager!.login).toHaveBeenCalledWith(true);
		});

		it('should send "opening browser" message with force flag text', async () => {
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
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
});
