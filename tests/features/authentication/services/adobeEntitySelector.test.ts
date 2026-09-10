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

// The node version is asserted as an ARGUMENT below, so it is pinned to a value the
// real resolver never returns: a selector that hardcoded a version instead of asking
// `getMeshNodeVersion` would otherwise pass. The literal is inline because a mock
// factory is hoisted above every const in this file.
jest.mock('@/core/utils/meshConfig', () => ({
    getMeshNodeVersion: jest.fn(() => '99'),
}));

/** Exactly the options every `aio config delete` call must carry. */
const EXPECTED_OPTIONS = { encoding: 'utf8', useNodeVersion: '99' };

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

        selector = new AdobeEntitySelector(mockCommandExecutor, mockCacheManager);
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

            // The OPTIONS are asserted exactly, not as `any(Object)`: the encoding and
            // the resolved node version are what the CLI actually runs under, and an
            // empty options object satisfies `any(Object)` while running the command
            // on whatever node happens to be first on PATH.
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.org',
                EXPECTED_OPTIONS
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.project',
                EXPECTED_OPTIONS
            );
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio config delete console.workspace',
                EXPECTED_OPTIONS
            );
            expect(mockCacheManager.clearConsoleWhereCache).toHaveBeenCalled();
        });

        it('should issue exactly the three console keys and nothing else', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: '',
                code: 0,
                duration: 0,
            });

            await selector.clearConsoleContext();

            expect(
                mockCommandExecutor.execute.mock.calls.map(([command]) => command)
            ).toStrictEqual([
                'aio config delete console.org',
                'aio config delete console.project',
                'aio config delete console.workspace',
            ]);
        });

        it('should not throw on CLI failure', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('CLI error'));

            // Should not throw
            await expect(selector.clearConsoleContext()).resolves.not.toThrow();
        });

        it('should leave the console.where cache alone when the CLI fails', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('CLI error'));

            await selector.clearConsoleContext();

            // Nothing was cleared, so a cached console.where still describes reality.
            expect(mockCacheManager.clearConsoleWhereCache).not.toHaveBeenCalled();
        });
    });
});
