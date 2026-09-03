/**
 * Lifecycle Handlers Tests - Utilities
 *
 * Tests for utility handlers:
 * - handleLog: Handles logging from webview
 * - handleOpenAdobeConsole: Opens Adobe Developer Console
 */

import { handleLog } from '@/features/project-creation/handlers/wizardLifecycleHandlers';
import { HandlerContext as _HandlerContext } from '@/types/handlers';
import { createWizardLifecycleContext } from './wizardLifecycleHandlers.testUtils';

describe('lifecycleHandlers - Utilities', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createWizardLifecycleContext();
    });

    describe('handleLog', () => {
        it('should log error messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'error',
                message: 'Test error message',
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith('[Webview] Test error message');
        });

        it('should log warning messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'warn',
                message: 'Test warning',
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.warn).toHaveBeenCalledWith('[Webview] Test warning');
        });

        it('should log debug messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'debug',
                message: 'Test debug info',
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith('[Webview] Test debug info');
        });

        it('should log info messages by default', async () => {
            const result = await handleLog(mockContext, {
                level: 'info',
                message: 'Test info message',
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith('[Webview] Test info message');
        });

        it('should handle unknown log levels as info', async () => {
            const result = await handleLog(mockContext, {
                level: 'unknown',
                message: 'Unknown level message',
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith(
                '[Webview] Unknown level message'
            );
        });
    });
});
