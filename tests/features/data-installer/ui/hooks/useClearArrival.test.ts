/**
 * useClearArrival — the Command Palette's Clear doors reaching a project's Datapacks (step 06 C5,
 * P6-Q5). The same shape as the projects list's Delete arrival (`useListBatch`): a screen just
 * opened takes the held request once mounted (`takeClearRequest`); one already open is pushed
 * `openClearWindow`. The Datapack Library has no Clear, so it neither asks nor listens.
 */

// FIRST: the shared webview client double; its jest.mock must register before the hook binds.
import { mockRequest, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useClearArrival } from '@/features/data-installer/ui/hooks/useClearArrival';
import type {
    ClearWindowKind,
    OpenClearWindowPayload,
    TakeClearRequestResponse,
} from '@/types/demoDataWipe';

/** The extension's answer to the arrival question: this Clear window, or none. */
function holds(window: ClearWindowKind | null): void {
    const answer: TakeClearRequestResponse = { success: true, data: { window } };
    mockRequest.mockImplementation((type: string) =>
        type === 'takeClearRequest' ? Promise.resolve(answer) : new Promise(() => undefined)
    );
}

beforeEach(() => {
    mockRequest.mockReset();
    webviewClientHandlers.clear();
});

describe('useClearArrival', () => {
    it.each<ClearWindowKind>(['project', 'instance'])(
        'takes the held %s window once mounted',
        async (window) => {
            holds(window);
            const { result } = renderHook(() => useClearArrival(true));

            await waitFor(() => expect(result.current.request).toBe(window));
            expect(
                mockRequest.mock.calls.filter(([type]) => type === 'takeClearRequest')
            ).toHaveLength(1);
        }
    );

    it('holds nothing when nothing was held', async () => {
        holds(null);
        const { result } = renderHook(() => useClearArrival(true));

        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeClearRequest'));
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.request).toBeNull();
    });

    it('takes a window pushed to a screen already open', async () => {
        holds(null);
        const { result } = renderHook(() => useClearArrival(true));
        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeClearRequest'));

        const pushed: OpenClearWindowPayload = { window: 'instance' };
        act(() => webviewClientHandlers.get('openClearWindow')?.(pushed));

        expect(result.current.request).toBe('instance');
    });

    it('forgets the request once it is taken, so it opens once', async () => {
        holds('project');
        const { result } = renderHook(() => useClearArrival(true));
        await waitFor(() => expect(result.current.request).toBe('project'));

        act(() => result.current.taken());

        expect(result.current.request).toBeNull();
    });

    it('neither asks nor listens in the Datapack Library, which has no Clear', async () => {
        holds('project');
        const { result } = renderHook(() => useClearArrival(false));
        await act(async () => {
            await Promise.resolve();
        });

        expect(mockRequest).not.toHaveBeenCalledWith('takeClearRequest');
        expect(webviewClientHandlers.get('openClearWindow')).toBeUndefined();
        expect(result.current.request).toBeNull();
    });

    it.each([
        ['nothing', null],
        ['a refusal with no data', { success: false, error: 'Unknown message' }],
        ['a window it does not know', { success: true, data: { window: 'everything' } }],
    ])('holds nothing, and throws nothing, when the answer is %s', async (_what, answer) => {
        mockRequest.mockImplementation((type: string) =>
            type === 'takeClearRequest' ? Promise.resolve(answer) : new Promise(() => undefined)
        );
        const { result } = renderHook(() => useClearArrival(true));

        await waitFor(() => expect(mockRequest).toHaveBeenCalledWith('takeClearRequest'));
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.request).toBeNull();
    });
});
