/**
 * Lifecycle Handlers Tests - Utilities
 *
 * Tests for utility handlers:
 * - handleLog: Handles logging from webview
 * - handleOpenAdobeConsole: Opens Adobe Developer Console
 */

import {
    handleLog,
    handleOpenAdobeConsole
} from '@/features/lifecycle/handlers/lifecycleHandlers';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import * as securityValidation from '@/core/validation/securityValidation';
import { createMockContext, mockVSCode } from './lifecycleHandlers.testUtils';

jest.mock('vscode', () => mockVSCode, { virtual: true });
jest.mock('@/core/validation/securityValidation');

describe('lifecycleHandlers - Utilities', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createMockContext();
    });

    describe('handleLog', () => {
        it('should log error messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'error',
                message: 'Test error message'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith('[Webview] Test error message');
        });

        it('should log warning messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'warn',
                message: 'Test warning'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.warn).toHaveBeenCalledWith('[Webview] Test warning');
        });

        it('should log debug messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'debug',
                message: 'Test debug info'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith('[Webview] Test debug info');
        });

        it('should log info messages by default', async () => {
            const result = await handleLog(mockContext, {
                level: 'info',
                message: 'Test info message'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.info).toHaveBeenCalledWith('[Webview] Test info message');
        });

        it('should handle unknown log levels as info', async () => {
            const result = await handleLog(mockContext, {
                level: 'unknown' as any,
                message: 'Unknown level message'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.info).toHaveBeenCalledWith('[Webview] Unknown level message');
        });
    });

    describe('handleOpenAdobeConsole', () => {
        beforeEach(() => {
            (securityValidation.validateURL as jest.Mock).mockImplementation(() => {
                // Valid by default
            });
        });

        it('should open generic Adobe Console URL', async () => {
            mockVSCode.env.openExternal.mockResolvedValue(true);

            const result = await handleOpenAdobeConsole(mockContext);

            expect(result.success).toBe(true);
            expect(securityValidation.validateURL).toHaveBeenCalledWith(
                'https://developer.adobe.com/console'
            );
            // Just verify it was called with something
            expect(mockVSCode.env.openExternal).toHaveBeenCalled();
        });

        it('should open workspace-specific URL', async () => {
            const payload = {
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789'
            };

            const result = await handleOpenAdobeConsole(mockContext, payload);

            expect(result.success).toBe(true);
            expect(securityValidation.validateURL).toHaveBeenCalledWith(
                'https://developer.adobe.com/console/projects/org-123/proj-456/workspaces/ws-789/details'
            );
        });

        it('should open project-specific URL', async () => {
            const payload = {
                orgId: 'org-123',
                projectId: 'proj-456'
            };

            const result = await handleOpenAdobeConsole(mockContext, payload);

            expect(result.success).toBe(true);
            expect(securityValidation.validateURL).toHaveBeenCalledWith(
                'https://developer.adobe.com/console/projects/org-123/proj-456/overview'
            );
        });

        it('should log URL construction details', async () => {
            const payload = {
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789'
            };

            await handleOpenAdobeConsole(mockContext, payload);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Console] Opening workspace-specific URL'),
                expect.objectContaining({
                    url: expect.stringContaining('org-123/proj-456/workspaces/ws-789')
                })
            );
        });

        it('should reject invalid URLs', async () => {
            const validationError = new Error('Invalid URL');
            (securityValidation.validateURL as jest.Mock).mockImplementation(() => {
                throw validationError;
            });

            const result = await handleOpenAdobeConsole(mockContext);

            expect(result.success).toBe(false);
            expect(mockVSCode.env.openExternal).not.toHaveBeenCalled();
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Adobe Console] URL validation failed',
                validationError
            );
        });

        it('should handle browser open error', async () => {
            mockVSCode.env.openExternal.mockRejectedValue(new Error('Browser failed'));

            const result = await handleOpenAdobeConsole(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Adobe Console] Failed to open URL',
                expect.any(Error)
            );
        });

        it('should handle partial payload (only orgId)', async () => {
            const payload = {
                orgId: 'org-123'
            };

            await handleOpenAdobeConsole(mockContext, payload);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Console] Opening generic console URL (missing IDs)'),
                expect.objectContaining({ data: payload })
            );
        });
    });
});
