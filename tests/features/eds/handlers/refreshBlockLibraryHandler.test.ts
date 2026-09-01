/**
 * handleRefreshBlockLibraryHeadless — the headless block-library rebuild behind
 * the refresh_block_library MCP tool. Resolves the current project, gates on EDS,
 * runs the shared refreshBlockLibraryHeadless core with no UI callbacks, and
 * returns the real result.
 */

const mockRefresh = jest.fn();
jest.mock('@/features/eds/services/refreshBlockLibraryHeadless', () => ({
    refreshBlockLibraryHeadless: (...args: unknown[]) => mockRefresh(...args),
}));

const mockIsEds = jest.fn();
jest.mock('@/types/typeGuards', () => ({
    isEdsProject: (project: unknown) => mockIsEds(project),
}));

import { handleRefreshBlockLibraryHeadless } from '@/features/eds/handlers/refreshBlockLibraryHandler';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

function ctx(project: unknown): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
        }),
        logger: createMockLogger(),
        context: createMockExtensionContext({ extensionPath: '/ext' }),
    });
}

describe('handleRefreshBlockLibraryHeadless', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsEds.mockReturnValue(true);
    });

    it('errors with PROJECT_NOT_FOUND when no project is loaded', async () => {
        const result = await handleRefreshBlockLibraryHeadless(ctx(undefined));
        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('errors with INVALID_OPERATION for non-EDS projects', async () => {
        mockIsEds.mockReturnValue(false);
        const result = await handleRefreshBlockLibraryHeadless(ctx({ name: 'p', path: '/p' }));
        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.INVALID_OPERATION);
        expect(result.error).toMatch(/EDS/i);
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('runs the core headlessly (no UI callbacks) and returns libraryPaths', async () => {
        mockRefresh.mockResolvedValue({
            success: true,
            libraryPaths: ['/.da/library/blocks/hero'],
        });

        const result = await handleRefreshBlockLibraryHeadless(ctx({ name: 'p', path: '/p' }));

        const call = mockRefresh.mock.calls[0][0];
        expect(call.onProgress).toBeUndefined();
        // Asserts the FIELD, not the whole object. It read
        // `toEqual({ extensionPath: '/ext' })`, which also asserted that nothing
        // else was on the context — a claim about the FAKE's shape rather than
        // about the handler, and one that broke the moment the context became a
        // real `createMockExtensionContext`. What this test means is that the
        // extension context is threaded through with the right path.
        expect(call.context.extensionPath).toBe('/ext');
        expect(result).toEqual({
            success: true,
            data: { libraryPaths: ['/.da/library/blocks/hero'] },
        });
    });

    it('surfaces a refresh failure error', async () => {
        mockRefresh.mockResolvedValue({ success: false, error: 'publish failed' });
        const result = await handleRefreshBlockLibraryHeadless(ctx({ name: 'p', path: '/p' }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('publish failed');
    });
});
