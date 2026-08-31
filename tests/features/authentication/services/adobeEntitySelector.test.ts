/**
 * AdobeEntitySelector Unit Tests
 *
 * Tests the token-preserving console-context clearing. Org/project/workspace
 * selection was removed in the org-context refactor (dependent ops now target
 * context per-invocation via `withOrgContext`/`ensureOrgContext`), so the
 * selector's only remaining responsibility is `clearConsoleContext`.
 */

import { AdobeEntitySelector } from '@/features/authentication/services/adobeEntitySelector';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

// Mock external dependencies

import { getLogger } from '@/core/logging/debugLogger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

describe('AdobeEntitySelector', () => {
    let selector: AdobeEntitySelector;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;

    beforeEach(() => {
        // Setup logger mock
        (getLogger as jest.Mock).mockReturnValue(createMockLogger());

        // Create mocks
        mockCommandExecutor = createMockCommandExecutor({ execute: jest.fn() });

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
                duration: 0,
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
