/**
 * useRenameDialog Hook Tests
 *
 * @jest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { postMessage: jest.fn() },
}));

import { useRenameDialog } from '@/features/dashboard/ui/hooks/useRenameDialog';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

describe('useRenameDialog', () => {
    const mockPostMessage = webviewClient.postMessage as jest.Mock;

    beforeEach(() => jest.clearAllMocks());

    it('should start closed', () => {
        const { result } = renderHook(() => useRenameDialog());

        expect(result.current.showRenameDialog).toBe(false);
    });

    it('should open the dialog', () => {
        const { result } = renderHook(() => useRenameDialog());

        act(() => result.current.openRenameDialog());

        expect(result.current.showRenameDialog).toBe(true);
    });

    it('should close the dialog', () => {
        const { result } = renderHook(() => useRenameDialog());

        act(() => result.current.openRenameDialog());
        act(() => result.current.closeRenameDialog());

        expect(result.current.showRenameDialog).toBe(false);
    });

    it('should post renameProject with the new name and close on confirm', () => {
        const { result } = renderHook(() => useRenameDialog());

        act(() => result.current.openRenameDialog());
        act(() => result.current.confirmRename('renamed'));

        expect(mockPostMessage).toHaveBeenCalledWith('renameProject', { newName: 'renamed' });
        expect(result.current.showRenameDialog).toBe(false);
    });
});
