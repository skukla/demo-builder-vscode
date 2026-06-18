/**
 * AdobeEntitySelector Unit Tests
 *
 * Tests the token-preserving console-context clearing. Org/project/workspace
 * selection was removed in the org-context refactor (dependent ops now target
 * context per-invocation via `withOrgContext`/`ensureOrgContext`), so the
 * selector's only remaining responsibility is `clearConsoleContext`.
 */

import { AdobeEntitySelector } from '@/features/authentication/services/adobeEntitySelector';
import type { CommandExecutor } from '@/core/shell';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

// Mock external dependencies
jest.mock('@/core/logging');

import { getLogger } from '@/core/logging';

describe('AdobeEntitySelector', () => {
    let selector: AdobeEntitySelector;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;

    beforeEach(() => {
        // Setup logger mock
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(),
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        });

        // Create mocks
        mockCommandExecutor = {
            execute: jest.fn(),
        } as unknown as jest.Mocked<CommandExecutor>;

        mockCacheManager = {
            clearConsoleWhereCache: jest.fn(),
        } as unknown as jest.Mocked<AuthCacheManager>;

        selector = new AdobeEntitySelector(
            mockCommandExecutor,
            mockCacheManager,
        );
    });

    describe('clearConsoleContext()', () => {
        it('should clear all console config keys', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
            });

            await selector.clearConsoleContext();

            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.org',
                expect.any(Object),
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.project',
                expect.any(Object),
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.workspace',
                expect.any(Object),
            );
            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalled();
        });

        it('should not throw on CLI failure', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('CLI error'));

            // Should not throw
            await expect(selector.clearConsoleContext()).resolves.not.toThrow();
        });
    });
});
