/**
 * useRepoReadiness — what the selected repository contains, asked once per
 * selection. Undefined while the answer is out, so the step does not flicker to
 * invalid; `undetermined` when the extension cannot say, so a GitHub blip never
 * leaves it looking like a request still in flight.
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import { act, renderHook } from '@testing-library/react';
import type { RepoReadinessState } from '@/features/eds/ui/steps/repoSelectionInline.helpers';
import { useRepoReadiness } from '@/features/eds/ui/hooks/useRepoReadiness';
import type { GitHubRepoItem } from '@/types/webview';

function repo(fullName: string): GitHubRepoItem {
    const [, name = fullName] = fullName.split('/');
    return { id: fullName, name, fullName, htmlUrl: `https://github.com/${fullName}` };
}

const STORE = repo('skukla/my-store');
const OTHER = repo('skukla/other-store');

/** A request the test answers by hand, so ordering is under its control. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
    let resolve!: (v: T) => void;
    let reject!: (e: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** Let the request's then/catch run inside act. */
async function flush(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

describe('useRepoReadiness', () => {
    beforeEach(() => {
        mockRequest.mockReset();
    });

    it('asks the extension about the selected repository, by owner and name', async () => {
        mockRequest.mockResolvedValue({ success: true, readiness: { kind: 'storefront' } });

        const { result } = renderHook(() => useRepoReadiness('existing', STORE));
        expect(result.current).toBeUndefined();
        await flush();

        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith('check-repo-readiness', {
            owner: 'skukla',
            repo: 'my-store',
        });
        expect(result.current).toStrictEqual({ kind: 'storefront' });
    });

    it('passes a not-a-storefront verdict through whole', async () => {
        const verdict: RepoReadinessState = { kind: 'not-a-storefront', missing: ['head.html'] };
        mockRequest.mockResolvedValue({ success: true, readiness: verdict });

        const { result } = renderHook(() => useRepoReadiness('existing', STORE));
        await flush();

        expect(result.current).toStrictEqual(verdict);
    });

    it('reads an answer with no verdict as undetermined, not as still checking', async () => {
        mockRequest.mockResolvedValue({ success: false });

        const { result } = renderHook(() => useRepoReadiness('existing', STORE));
        await flush();

        expect(result.current).toStrictEqual({ kind: 'undetermined' });
    });

    it('reads a failed request as undetermined', async () => {
        mockRequest.mockRejectedValue(new Error('webview disconnected'));

        const { result } = renderHook(() => useRepoReadiness('existing', STORE));
        await flush();

        expect(result.current).toStrictEqual({ kind: 'undetermined' });
    });

    it('asks nothing in new-repository mode', async () => {
        const { result } = renderHook(() => useRepoReadiness('new', STORE));
        await flush();

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current).toBeUndefined();
    });

    it('asks nothing with no selection', async () => {
        const { result } = renderHook(() => useRepoReadiness('existing', undefined));
        await flush();

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current).toBeUndefined();
    });

    it('asks nothing for a full name it cannot split into owner and name', async () => {
        const { result } = renderHook(() => useRepoReadiness('existing', repo('no-owner')));
        await flush();

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current).toBeUndefined();
    });

    it('clears the verdict when the selection goes away', async () => {
        mockRequest.mockResolvedValue({ success: true, readiness: { kind: 'empty' } });
        const initialProps: { selected?: GitHubRepoItem } = { selected: STORE };
        const { result, rerender } = renderHook(
            ({ selected }: { selected?: GitHubRepoItem }) => useRepoReadiness('existing', selected),
            { initialProps },
        );
        await flush();
        expect(result.current).toStrictEqual({ kind: 'empty' });

        rerender({ selected: undefined });

        expect(result.current).toBeUndefined();
    });

    it('forgets the previous verdict while the next selection is checked', async () => {
        const second = deferred<{ success: boolean; readiness?: RepoReadinessState }>();
        mockRequest
            .mockResolvedValueOnce({ success: true, readiness: { kind: 'empty' } })
            .mockReturnValueOnce(second.promise);
        const { result, rerender } = renderHook(
            ({ selected }: { selected: GitHubRepoItem }) => useRepoReadiness('existing', selected),
            { initialProps: { selected: STORE } },
        );
        await flush();
        expect(result.current).toStrictEqual({ kind: 'empty' });

        rerender({ selected: OTHER });

        expect(result.current).toBeUndefined();
        second.resolve({ success: true, readiness: { kind: 'storefront' } });
        await flush();
        expect(result.current).toStrictEqual({ kind: 'storefront' });
    });

    it('ignores a late answer for a selection that has since changed', async () => {
        const first = deferred<{ success: boolean; readiness?: RepoReadinessState }>();
        const second = deferred<{ success: boolean; readiness?: RepoReadinessState }>();
        mockRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const { result, rerender } = renderHook(
            ({ selected }: { selected: GitHubRepoItem }) => useRepoReadiness('existing', selected),
            { initialProps: { selected: STORE } },
        );

        rerender({ selected: OTHER });
        second.resolve({ success: true, readiness: { kind: 'storefront' } });
        await flush();
        first.resolve({ success: true, readiness: { kind: 'empty' } });
        await flush();

        expect(result.current).toStrictEqual({ kind: 'storefront' });
    });

    it('ignores a late FAILURE for a selection that has since changed', async () => {
        const first = deferred<{ success: boolean; readiness?: RepoReadinessState }>();
        mockRequest
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce({ success: true, readiness: { kind: 'storefront' } });
        const { result, rerender } = renderHook(
            ({ selected }: { selected: GitHubRepoItem }) => useRepoReadiness('existing', selected),
            { initialProps: { selected: STORE } },
        );

        rerender({ selected: OTHER });
        await flush();
        first.reject(new Error('timed out'));
        await flush();

        expect(result.current).toStrictEqual({ kind: 'storefront' });
    });
});
