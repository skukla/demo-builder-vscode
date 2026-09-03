/**
 * useInlineRename Hook Tests
 *
 * The dashboard's inline-title rename commit: requests `renameProject` with
 * just the new name (the backend resolves the current project and re-sends
 * init so the title refreshes) and maps the response to the InlineRenameField
 * contract — null on success, an error message string otherwise.
 *
 */

import { renderHook } from '@testing-library/react';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        request: (...args: unknown[]) => mockRequest(...args),
    },
}));

import { useInlineRename } from '@/features/dashboard/ui/hooks/useInlineRename';

describe('useInlineRename', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('requests renameProject with just the new name and resolves null on success', async () => {
        mockRequest.mockResolvedValue({ success: true });
        const { result } = renderHook(() => useInlineRename());

        await expect(result.current('new-name')).resolves.toBeNull();
        expect(mockRequest).toHaveBeenCalledWith('renameProject', { newName: 'new-name' });
    });

    it('resolves the backend error message on failure', async () => {
        mockRequest.mockResolvedValue({
            success: false,
            error: 'A project folder named "new-name" already exists',
        });
        const { result } = renderHook(() => useInlineRename());

        await expect(result.current('new-name')).resolves.toBe(
            'A project folder named "new-name" already exists'
        );
    });

    it('resolves a fallback message when the failure carries no error text', async () => {
        mockRequest.mockResolvedValue({ success: false });
        const { result } = renderHook(() => useInlineRename());

        await expect(result.current('x')).resolves.toBe('Rename failed');
    });

    it('maps a transport rejection to its message', async () => {
        mockRequest.mockRejectedValue(new Error('socket closed'));
        const { result } = renderHook(() => useInlineRename());

        await expect(result.current('x')).resolves.toBe('socket closed');
    });
});
