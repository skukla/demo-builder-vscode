/**
 * handleAuthenticate Test Suite - Error Handling
 *
 * Tests for error scenarios including:
 * - Duplicate authentication requests
 * - Login timeouts
 * - Exception handling
 * - Permission failures (deferred)
 */

import { handleAuthenticate } from '@/features/authentication/handlers/authenticationHandlers';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from './authenticationHandlers-authenticate.testUtils';

describe('authenticationHandlers - handleAuthenticate - Error Handling', () => {
	let mockContext: jest.Mocked<HandlerContext>;

	beforeEach(() => {
		mockContext = createMockHandlerContext();
		jest.clearAllMocks();
	});

	describe('duplicate request prevention', () => {
		it('should reject duplicate authentication requests (isAuthenticating = true)', async () => {
			mockContext.sharedState.isAuthenticating = true;

			const result = await handleAuthenticate(mockContext);

			expect(result.success).toBe(false);
			expect(mockContext.logger.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Authentication already in progress/)
			);
			expect(mockContext.authManager!.login).not.toHaveBeenCalled();
		});
	});

	describe('login failures', () => {
		it('should handle login() failure (timeout scenario)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(false);

			const result = await handleAuthenticate(mockContext);

			expect(result.success).toBe(false);
			expect(mockContext.logger.warn).toHaveBeenCalledWith(
				expect.stringMatching(/Authentication timed out after \d+ms/)
			);
			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('auth-status', {
				authenticated: false,
				isAuthenticated: false,
				isChecking: false,
				error: 'timeout',
				message: 'Sign-in timed out',
				subMessage: 'The browser window may have been closed. Please try again.',
			});
		});
	});

	describe('exception handling', () => {
		it('should handle exception during authentication', async () => {
			const error = new Error('Network error');
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(error);

			const result = await handleAuthenticate(mockContext);

			expect(result.success).toBe(false);
			expect(mockContext.logger.error).toHaveBeenCalledWith(
				expect.stringMatching(/Failed to start authentication after \d+ms:/),
				error
			);
		});

		it('should send error message when exception occurs', async () => {
			const error = new Error('Authentication failed');
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(error);

			await handleAuthenticate(mockContext);

			expect(mockContext.sendMessage).toHaveBeenLastCalledWith('authError', {
				error: 'Authentication failed',
			});
		});

		it('should reset isAuthenticating flag on error', async () => {
			const error = new Error('Test error');
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockRejectedValue(error);

			await handleAuthenticate(mockContext);

			expect(mockContext.sharedState.isAuthenticating).toBe(false);
		});
	});

	describe('deferred permission validation', () => {
		it('should return success even if permission check would fail (deferred)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);

			const result = await handleAuthenticate(mockContext);

			// Permission check is deferred, so login still succeeds
			expect(result.success).toBe(true);
			// Permission check is NOT run during login (deferred)
			expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
			// setOrgRejectedFlag is NOT called (no validation during login)
			expect(mockContext.authManager!.setOrgRejectedFlag).not.toHaveBeenCalled();
		});

		it('should NOT check permissions during login (deferred to next step)', async () => {
			(mockContext.authManager!.isAuthenticated as jest.Mock).mockResolvedValue(false);
			(mockContext.authManager!.login as jest.Mock).mockResolvedValue(true);

			await handleAuthenticate(mockContext);

			// Permission errors won't be logged during login (deferred)
			expect(mockContext.logger.error).not.toHaveBeenCalledWith(
				expect.stringMatching(/User lacks Developer permissions/)
			);
			// Permission check not run at all
			expect(mockContext.authManager!.testDeveloperPermissions).not.toHaveBeenCalled();
		});
	});
});
