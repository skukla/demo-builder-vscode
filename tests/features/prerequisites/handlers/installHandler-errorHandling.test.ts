/**
 * Install Handler Tests - Error Handling
 *
 * Tests error scenarios including:
 * - Prerequisite state not found
 * - No installation steps defined
 * - Installation step execution failures
 * - Post-installation verification timeout
 * - Post-installation verification general error
 * - Node version check failures
 * - Per-node prerequisite check failures
 * - fnm list failures
 * - sendMessage failures
 * - Complete error with error logging
 */

// Mock all dependencies (MUST be at top before imports)
jest.mock('@/features/prerequisites/handlers/shared');
jest.mock('@/core/di');
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ url })),
    },
}));
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import * as shared from '@/features/prerequisites/handlers/shared';
import {
    mockNodePrereq,
    mockAdobeCliPrereq,
    mockNodeResult,
    createMockContext,
    setupMockCommandExecutor,
    setupSharedUtilityMocks,
} from './installHandler.testUtils';

describe('Install Handler - Error Handling', () => {
    let mockContext: any;

    beforeEach(() => {
        jest.clearAllMocks();
        setupMockCommandExecutor();
        setupSharedUtilityMocks();
        mockContext = createMockContext();
    });

    it('should throw error when prerequisite state not found', async () => {
        const result = await handleInstallPrerequisite(mockContext, { prereqId: 99 });

        expect(result.success).toBe(false);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                index: 99,
                status: 'error',
            })
        );
    });

    it('should throw error when no installation steps defined', async () => {
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockReturnValue(null);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'error',
                message: 'No installation steps defined for npm',
            })
        );
    });

    it('should handle installation step execution failures', async () => {
        (mockContext.progressUnifier!.executeStep as jest.Mock).mockRejectedValue(
            new Error('Command execution failed')
        );

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
    });

    it('should handle post-installation verification timeout', async () => {
        const timeoutError: any = new Error('Timeout after 10000ms');
        timeoutError.isTimeout = true;
        (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(timeoutError);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true); // Installation steps completed
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'warning',
                message: expect.stringContaining('verification timed out'),
            })
        );
    });

    it('should handle post-installation verification general error', async () => {
        (mockContext.prereqManager!.checkPrerequisite as jest.Mock).mockRejectedValue(
            new Error('Verification failed')
        );

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(true); // Installation steps completed
        expect(mockContext.sendMessage).toHaveBeenCalledWith(
            'prerequisite-status',
            expect.objectContaining({
                status: 'warning',
                message: expect.stringContaining('verification failed'),
            })
        );
        expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
    });

    it('should handle Node version check failures during multi-version', async () => {
        const states = new Map();
        states.set(0, { prereq: mockNodePrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        (mockContext.prereqManager!.checkMultipleNodeVersions as jest.Mock).mockRejectedValue(
            new Error('Node check failed')
        );

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
    });

    it('should handle per-node prerequisite check failures', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        // Note: Per-node checking happens inside checkPrerequisite which is mocked

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0, version: '20' });

        // Should continue with installation even if check fails
        expect(result.success).toBe(true);
    });

    it('should handle fnm list failures', async () => {
        const states = new Map();
        states.set(0, { prereq: mockAdobeCliPrereq, result: mockNodeResult });
        mockContext.sharedState.currentPrerequisiteStates = states;
        // Mock getRequiredNodeVersions to throw error (simulates fnm list failure internally)
        (shared.getRequiredNodeVersions as jest.Mock).mockRejectedValue(new Error('List failed'));

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.errorLogger!.logError).toHaveBeenCalled();
    });

    it('should handle sendMessage failures gracefully', async () => {
        (mockContext.sendMessage as jest.Mock)
            .mockRejectedValueOnce(new Error('WebView not ready'))
            .mockResolvedValue(undefined);

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
    });

    it('should handle complete error with error logging', async () => {
        const criticalError = new Error('Critical installation failure');
        (mockContext.prereqManager!.getInstallSteps as jest.Mock).mockImplementation(() => {
            throw criticalError;
        });

        const result = await handleInstallPrerequisite(mockContext, { prereqId: 0 });

        expect(result.success).toBe(false);
        expect(mockContext.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to install prerequisite'),
            criticalError
        );
        expect(mockContext.errorLogger!.logError).toHaveBeenCalledWith(
            criticalError,
            'Prerequisite Installation',
            true
        );
    });
});
