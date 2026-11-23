/**
 * useFixWithAi (step-07 P5, S8): Fix with AI with nothing to fix says so where the button is. The
 * extension answers a refusal ("This datapack has no failed install to fix."); the hook keeps it as
 * the problem line, as Clear's Open Commerce Admin keeps its own.
 */

import '../../../../helpers/webviewClientMock';
import { act, renderHook, waitFor } from '@testing-library/react';

// Below the mock on purpose: `jest.mock` is hoisted above the imports of THIS module only.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { useFixWithAi } from '@/features/data-installer/ui/hooks/useFixWithAi';

const mockRequest = webviewClient.request as jest.Mock;
const REFUSAL = 'This datapack has no failed install to fix.';

beforeEach(() => {
    mockRequest.mockReset();
});

describe('useFixWithAi', () => {
    it('asks from where it was given, and keeps a refusal as the problem line', async () => {
        mockRequest.mockResolvedValue({ success: false, error: REFUSAL });
        const { result } = renderHook(() => useFixWithAi('install-failed'));

        act(() => result.current.fixWithAi());

        expect(mockRequest).toHaveBeenCalledWith('fix-datapack-import-with-ai', {
            from: 'install-failed',
        });
        await waitFor(() => expect(result.current.problem).toBe(REFUSAL));
    });

    it('sends no `from` for the last install', () => {
        mockRequest.mockResolvedValue({ success: true });
        const { result } = renderHook(() => useFixWithAi());

        act(() => result.current.fixWithAi());

        expect(mockRequest).toHaveBeenCalledWith('fix-datapack-import-with-ai', {});
    });

    it('says nothing when the AI opened, and clears an earlier refusal on the next press', async () => {
        mockRequest.mockResolvedValueOnce({ success: false, error: REFUSAL });
        const { result } = renderHook(() => useFixWithAi('dry-run'));
        act(() => result.current.fixWithAi());
        await waitFor(() => expect(result.current.problem).toBe(REFUSAL));

        mockRequest.mockResolvedValueOnce({ success: true });
        act(() => result.current.fixWithAi());

        await waitFor(() => expect(result.current.problem).toBeUndefined());
    });
});
