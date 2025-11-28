/**
 * handleAuthenticate Test Suite - New Authentication Flows
 *
 * Tests for fresh authentication scenarios including:
 * - Browser-based login
 * - Single organization auto-selection
 * - Post-login setup and organization handling
 */

import { handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext, mockOrg, mockProject } from './authenticationHandlers-authenticate.testUtils';

describe('authenticationHandlers - handleAuthenticate - New Authentication', () => {
	let mockContext: jest.Mocked<HandlerContext>;

	beforeEach(() => {
		mockContext = createMockHandlerContext();
		jest.clearAllMocks();
	});

	describe('initial login flow', () => {
		it('should authenticate successfully when not authenticated (normal flow)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
			(mockContext.authManager!.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.testDeveloperPermissions as jest.Mock).mockResolvedValue({
				hasPermissions: true,
			});

			const result = await handleAuthenticate(mockContext);

			expect(result.success).toBe(true);
			expect(mockContext.authManager!.login).toHaveBeenCalledWith(false);
			expect(mockContext.sharedState.isAuthenticating).toBe(false);
		});

		it('should send "opening browser" message before login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg);
			(mockContext.authManager!.getCurrentProject as jest.Mock).mockResolvedValue(mockProject);
			(mockContext.authManager!.validateAndClearInvalidOrgContext as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.testDeveloperPermissions as jest.Mock).mockResolvedValue({
				hasPermissions: true,
			});

			await handleAuthenticate(mockContext);

			// Updated: Now uses constant message with subMessage indicating browser opening
			expect(mockContext.sendMessage).toHaveBeenCalledWith('auth-status', {
				isChecking: true,
				message: 'Signing in...',
				subMessage: 'Opening browser...',
				isAuthenticated: false,
			});
		});

		it('should NOT validate org during login (no validation calls)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			const result = await handleAuthenticate(mockContext);

			expect(result.success).toBe(true);
			// No validation calls during login
			expect(mockContext.authManager!.validateAndClearInvalidOrgContext).not.toHaveBeenCalled();
		});

		it('should NOT test developer permissions during login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			const result = await handleAuthenticate(mockContext);

			expect(result.success).toBe(true);
			// No permission checks during login
			expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
		});

		it('should NOT clear cache after normal login (only on force)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// clearCache() only called with force=true
			expect(mockContext.authManager!.clearCache).not.toHaveBeenCalled();
		});

		it('should log performance metrics for login flow', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// Auth completed metric (milestone - stays as info)
			expect(mockContext.logger.info).toHaveBeenCalledWith(
				expect.stringMatching(/Authentication completed successfully after \d+ms/)
			);
			// Post-login setup metric (technical - changed to debug)
			expect(mockContext.logger.debug).toHaveBeenCalledWith(
				expect.stringMatching(/Post-login setup completed in \d+ms/)
			);
		});
	});

	describe('post-login organization handling', () => {
		it('should initialize SDK after successful login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// SDK is initialized after login
			expect(mockContext.authManager!.ensureSDKInitialized).toHaveBeenCalled();
		});

		it('should fetch organization list after login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// Org list is fetched after login
			expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
		});

		it('should fetch and auto-select single org after login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			const result = await handleAuthenticate(mockContext);

			expect(result.success).toBe(true);
			expect(mockContext.authManager!.getOrganizations).toHaveBeenCalled();
			expect(mockContext.authManager!.selectOrganization).toHaveBeenCalledWith(mockOrg.id);
		});

		it('should auto-select when single organization available', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// Single org is auto-selected
			expect(mockContext.authManager!.selectOrganization).toHaveBeenCalledWith(mockOrg.id);
			expect(mockContext.authManager!.setCachedOrganization).toHaveBeenCalledWith(mockOrg);
		});

		it('should return success with "All set!" when single org auto-selected', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			const result = await handleAuthenticate(mockContext);

			expect(result.success).toBe(true);
			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: true,
				isAuthenticated: true,
				isChecking: false,
				organization: mockOrg,
				project: undefined,
				message: 'All set!',
				subMessage: `Connected to ${mockOrg.name}`,
				requiresOrgSelection: false,
				orgLacksAccess: false,
			});
		});

		it('should NOT validate organization access during login', async () => {
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

		it('should NOT check developer permissions during login', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// Permission check is NOT done during login
			expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
		});

		it('should NOT set orgRejectedFlag when single org auto-selected', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// No rejection flag when org is selected
			expect(mockContext.authManager!.setOrgRejectedFlag).not.toHaveBeenCalled();
		});

		it('should log post-login setup completion', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.ensureSDKInitialized as jest.Mock).mockResolvedValue(undefined);
			(mockContext.authManager!.getOrganizations as jest.Mock).mockResolvedValue([mockOrg]);
			(mockContext.authManager!.selectOrganization as jest.Mock).mockResolvedValue(true);
			(mockContext.authManager!.setCachedOrganization as jest.Mock).mockReturnValue(undefined);

			await handleAuthenticate(mockContext);

			// Log should show post-login setup (technical - changed to debug)
			expect(mockContext.logger.debug).toHaveBeenCalledWith(
				expect.stringMatching(/Post-login setup completed in \d+ms/)
			);
		});
	});
});
