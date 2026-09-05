import '../../../helpers/webviewClientMock';
import { renderHook, act } from '@testing-library/react';
import { useAsyncData } from '@/core/ui/hooks/useAsyncData';
import { useVSCodeMessage } from '@/core/ui/hooks/useVSCodeMessage';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

// Mock useVSCodeMessage and useLoadingState since useAsyncData depends on them
jest.mock('@/core/ui/hooks/useVSCodeMessage', () => ({
    useVSCodeMessage: jest.fn(),
}));

describe('useAsyncData', () => {
    let mockUnsubscribe: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUnsubscribe = jest.fn();
        (webviewClient.onMessage as jest.Mock).mockReturnValue(mockUnsubscribe);
    });

    /**
     * The two subscriptions this hook opens, as it last declared them.
     *
     * `useVSCodeMessage` is mocked, so nothing here dispatches a real message —
     * the handlers are read back and CALLED, which is the only way to reach the
     * body of either callback. It is also the seam where the arguments matter:
     * the type decides which messages arrive, and the dependency list decides
     * whether a changed transform or onAutoSelect is ever picked up.
     *
     * Called on every render, so the LAST pair is the current one.
     */
    type Subscription = [string, (data: unknown) => void, unknown[]];
    const subscriptions = (): [Subscription, Subscription] => {
        const calls = (useVSCodeMessage as unknown as jest.Mock).mock.calls;
        return [
            calls[calls.length - 2] as Subscription,
            calls[calls.length - 1] as Subscription,
        ];
    };
    const onData = (): Subscription => subscriptions()[0];
    const onError = (): Subscription => subscriptions()[1];

    describe('initial state', () => {
        it('returns initial state with null data', () => {
            const { result } = renderHook(() => useAsyncData());

            expect(result.current.data).toBeNull();
            expect(result.current.loading).toBe(false);
            expect(result.current.error).toBeNull();
            expect(result.current.hasLoadedOnce).toBe(false);
            expect(result.current.isRefreshing).toBe(false);
        });

        it('accepts initial data', () => {
            const initialData = { id: '123', name: 'Test' };
            const { result } = renderHook(() => useAsyncData({ initialData }));

            expect(result.current.data).toEqual(initialData);
            expect(result.current.hasLoadedOnce).toBe(true);
        });
    });

    describe('load function', () => {
        it('sets loading state', () => {
            const { result } = renderHook(() => useAsyncData());

            expect(result.current.loading).toBe(false);

            act(() => {
                result.current.load();
            });

            expect(result.current.loading).toBe(true);
        });

        it('sets refreshing state when isRefresh is true', () => {
            const initialData = { value: 'test' };
            const { result } = renderHook(() => useAsyncData({ initialData }));

            expect(result.current.isRefreshing).toBe(false);

            act(() => {
                result.current.load(true);
            });

            expect(result.current.isRefreshing).toBe(true);
            expect(result.current.loading).toBe(false); // loading should be false
        });

        it('is stable across renders', () => {
            const { result, rerender } = renderHook(() => useAsyncData());

            const load1 = result.current.load;
            rerender();
            const load2 = result.current.load;

            expect(load1).toBe(load2);
        });
    });

    describe('setData function', () => {
        it('updates data', () => {
            const { result } = renderHook(() => useAsyncData<string>());

            act(() => {
                result.current.setData('new data');
            });

            expect(result.current.data).toBe('new data');
            expect(result.current.hasLoadedOnce).toBe(true);
        });

        it('clears error states and sets hasLoadedOnce', () => {
            const { result } = renderHook(() => useAsyncData<string>());

            act(() => {
                result.current.setError('Error occurred');
            });

            expect(result.current.error).toBe('Error occurred');

            act(() => {
                result.current.setData('data');
            });

            expect(result.current.loading).toBe(false);
            expect(result.current.error).toBeNull();
            expect(result.current.hasLoadedOnce).toBe(true);
        });
    });

    describe('setError function', () => {
        it('updates error', () => {
            const { result } = renderHook(() => useAsyncData());

            act(() => {
                result.current.setError('Failed to load');
            });

            expect(result.current.error).toBe('Failed to load');
        });

        it('clears loading state', () => {
            const { result } = renderHook(() => useAsyncData());

            act(() => {
                result.current.setLoading(true);
                result.current.setError('Error');
            });

            expect(result.current.loading).toBe(false);
        });
    });

    describe('reset function', () => {
        it('resets to initial state', () => {
            const { result } = renderHook(() => useAsyncData<string>());

            act(() => {
                result.current.setData('some data');
                result.current.setError('some error');
            });

            act(() => {
                result.current.reset();
            });

            expect(result.current.data).toBeNull();
            expect(result.current.loading).toBe(false);
            expect(result.current.error).toBeNull();
            expect(result.current.hasLoadedOnce).toBe(false);
            expect(result.current.isRefreshing).toBe(false);
        });

        it('resets to initial data when provided', () => {
            const initialData = { id: '123' };
            const { result } = renderHook(() => useAsyncData({ initialData }));

            act(() => {
                result.current.setData({ id: '456' });
            });

            act(() => {
                result.current.reset();
            });

            expect(result.current.data).toEqual(initialData);
            expect(result.current.hasLoadedOnce).toBe(true);
        });
    });

    describe('transform option', () => {
        it('transforms incoming data', () => {
            const transform = (data: any) => ({
                ...data,
                transformed: true,
            });

            const { result } = renderHook(() => useAsyncData({ transform }));

            const rawData = { id: '123', name: 'Test' };

            act(() => {
                result.current.setData(transform(rawData));
            });

            expect(result.current.data).toEqual({
                id: '123',
                name: 'Test',
                transformed: true,
            });
        });
    });

    describe('typical async workflow', () => {
        it('handles load -> data flow', () => {
            const { result } = renderHook(() => useAsyncData<string[]>());

            // Start loading
            act(() => {
                result.current.load();
            });
            expect(result.current.loading).toBe(true);
            expect(result.current.hasLoadedOnce).toBe(false);

            // Receive data
            act(() => {
                result.current.setData(['item1', 'item2']);
            });
            expect(result.current.loading).toBe(false);
            expect(result.current.data).toEqual(['item1', 'item2']);
            expect(result.current.hasLoadedOnce).toBe(true);
        });

        it('handles load -> error flow', () => {
            const { result } = renderHook(() => useAsyncData());

            // Start loading
            act(() => {
                result.current.load();
            });
            expect(result.current.loading).toBe(true);

            // Receive error
            act(() => {
                result.current.setError('Failed to load');
            });
            expect(result.current.loading).toBe(false);
            expect(result.current.error).toBe('Failed to load');
            expect(result.current.data).toBeNull();
        });

        it('handles refresh flow', () => {
            const { result } = renderHook(() => useAsyncData<string>());

            // Initial load
            act(() => {
                result.current.setData('initial data');
            });

            // Refresh
            act(() => {
                result.current.load(true);
            });
            expect(result.current.isRefreshing).toBe(true);
            expect(result.current.data).toBe('initial data'); // Data still available

            // New data arrives
            act(() => {
                result.current.setData('refreshed data');
            });
            expect(result.current.isRefreshing).toBe(false);
            expect(result.current.data).toBe('refreshed data');
        });
    });

    describe('error handling', () => {
        it('preserves data when error occurs', () => {
            const { result } = renderHook(() => useAsyncData<string>());

            act(() => {
                result.current.setData('existing data');
            });

            act(() => {
                result.current.setError('Error occurred');
            });

            expect(result.current.data).toBe('existing data');
            expect(result.current.error).toBe('Error occurred');
        });

        it('clears error on new load', () => {
            const { result } = renderHook(() => useAsyncData());

            act(() => {
                result.current.setError('Previous error');
            });

            act(() => {
                result.current.load();
            });

            expect(result.current.error).toBeNull();
            expect(result.current.loading).toBe(true);
        });
    });

    describe('hasLoadedOnce flag', () => {
        it('is false initially', () => {
            const { result } = renderHook(() => useAsyncData());

            expect(result.current.hasLoadedOnce).toBe(false);
        });

        it('becomes true after first data load', () => {
            const { result } = renderHook(() => useAsyncData());

            act(() => {
                result.current.setData({ value: 'test' });
            });

            expect(result.current.hasLoadedOnce).toBe(true);
        });

        it('remains true after errors', () => {
            const { result } = renderHook(() => useAsyncData());

            act(() => {
                result.current.setData({ value: 'test' });
            });
            expect(result.current.hasLoadedOnce).toBe(true);

            act(() => {
                result.current.setError('Error');
            });

            expect(result.current.hasLoadedOnce).toBe(true);
        });

        it('is true when initial data is provided', () => {
            const { result } = renderHook(() =>
                useAsyncData({ initialData: { value: 'initial' } })
            );

            expect(result.current.hasLoadedOnce).toBe(true);
        });
    });

    describe('function stability', () => {
        it('all functions are stable', () => {
            const { result, rerender } = renderHook(() => useAsyncData());

            const funcs1 = {
                load: result.current.load,
                setData: result.current.setData,
                setLoading: result.current.setLoading,
                setError: result.current.setError,
                reset: result.current.reset,
            };

            rerender();

            const funcs2 = {
                load: result.current.load,
                setData: result.current.setData,
                setLoading: result.current.setLoading,
                setError: result.current.setError,
                reset: result.current.reset,
            };

            expect(funcs1.load).toBe(funcs2.load);
            expect(funcs1.setData).toBe(funcs2.setData);
            expect(funcs1.setLoading).toBe(funcs2.setLoading);
            expect(funcs1.setError).toBe(funcs2.setError);
            expect(funcs1.reset).toBe(funcs2.reset);
        });
    });

    describe('complex scenarios', () => {
        it('handles multiple consecutive loads', () => {
            const { result } = renderHook(() => useAsyncData<number>());

            // First load
            act(() => {
                result.current.load();
                result.current.setData(1);
            });
            expect(result.current.data).toBe(1);

            // Second load
            act(() => {
                result.current.load();
                result.current.setData(2);
            });
            expect(result.current.data).toBe(2);

            // Third load
            act(() => {
                result.current.load();
                result.current.setData(3);
            });
            expect(result.current.data).toBe(3);
        });

        it('handles load -> error -> retry -> success', () => {
            const { result } = renderHook(() => useAsyncData<string>());

            // First attempt fails
            act(() => {
                result.current.load();
                result.current.setError('Network error');
            });
            expect(result.current.error).toBe('Network error');
            expect(result.current.data).toBeNull();

            // Retry succeeds
            act(() => {
                result.current.load();
                result.current.setData('success');
            });
            expect(result.current.error).toBeNull();
            expect(result.current.data).toBe('success');
        });
    });
    /**
     * Everything below the two `useVSCodeMessage` calls had never run: the
     * collaborator is mocked, so the handlers were built and thrown away, and
     * 37 of this file's mutants had no coverage at all (measured 2026-09-05).
     * Reading the handler back and calling it is what reaches them.
     */
    describe('the data subscription', () => {
        it('subscribes to the caller’s type, and to a disabled one when there is none', () => {
            renderHook(() => useAsyncData({ messageType: 'projects' }));
            expect(onData()[0]).toBe('projects');

            renderHook(() => useAsyncData());
            expect(onData()[0]).toBe('__disabled__');
        });

        it('declares everything the handler closes over as a dependency', () => {
            // With an empty list the handler captured on mount is used forever,
            // so a later transform or onAutoSelect never takes effect.
            const transform = (d: unknown) => d as string;
            const onAutoSelect = jest.fn();
            renderHook(() =>
                useAsyncData<string>({
                    messageType: 'projects',
                    transform,
                    autoSelectSingle: true,
                    onAutoSelect,
                }),
            );

            expect(onData()[2]).toEqual([
                'projects',
                transform,
                true,
                onAutoSelect,
                expect.any(Function),
                expect.any(Function),
            ]);
        });

        it('ignores a message when no message type was configured', () => {
            const { result } = renderHook(() => useAsyncData<{ id: number }>());

            act(() => onData()[1]({ id: 1 }));

            expect(result.current.data).toBeNull();
            expect(result.current.hasLoadedOnce).toBe(false);
        });

        it('stores a plain message as data', () => {
            const { result } = renderHook(() =>
                useAsyncData<{ id: number }>({ messageType: 'projects' }),
            );

            act(() => onData()[1]({ id: 1 }));

            expect(result.current.data).toEqual({ id: 1 });
            expect(result.current.error).toBeNull();
            expect(result.current.hasLoadedOnce).toBe(true);
        });

        it('reads a payload carrying an error field as an ERROR, not as data', () => {
            const { result } = renderHook(() => useAsyncData({ messageType: 'projects' }));

            act(() => onData()[1]({ error: 'boom' }));

            expect(result.current.error).toBe('boom');
            expect(result.current.data).toBeNull();
        });

        it('takes null as data rather than asking whether null has an error', () => {
            // `'error' in null` throws; the leading truthiness check is what stops it.
            const { result } = renderHook(() => useAsyncData({ messageType: 'projects' }));

            act(() => onData()[1](null));

            expect(result.current.data).toBeNull();
            expect(result.current.hasLoadedOnce).toBe(true);
            expect(result.current.error).toBeNull();
        });

        it('takes a string as data rather than asking whether a string has an error', () => {
            // `'error' in 'hello'` throws too — `in` needs an object on the right.
            const { result } = renderHook(() =>
                useAsyncData<string>({ messageType: 'projects' }),
            );

            act(() => onData()[1]('hello'));

            expect(result.current.data).toBe('hello');
            expect(result.current.error).toBeNull();
        });

        it('runs the message through transform before storing it', () => {
            const { result } = renderHook(() =>
                useAsyncData<string>({
                    messageType: 'projects',
                    transform: (d) => `seen:${String((d as { id: number }).id)}`,
                }),
            );

            act(() => onData()[1]({ id: 7 }));

            expect(result.current.data).toBe('seen:7');
        });
    });

    describe('auto-selecting a single item', () => {
        const renderWith = (options: Parameters<typeof useAsyncData>[0]) =>
            renderHook(() => useAsyncData(options));

        it('hands onAutoSelect the one item', () => {
            const onAutoSelect = jest.fn();
            renderWith({ messageType: 'projects', autoSelectSingle: true, onAutoSelect });

            act(() => onData()[1](['only']));

            expect(onAutoSelect).toHaveBeenCalledWith('only');
        });

        it('does not fire when auto-select was not asked for', () => {
            const onAutoSelect = jest.fn();
            renderWith({ messageType: 'projects', onAutoSelect });

            act(() => onData()[1](['only']));

            expect(onAutoSelect).not.toHaveBeenCalled();
        });

        it('does not fire for two items — there is no single one to pick', () => {
            const onAutoSelect = jest.fn();
            renderWith({ messageType: 'projects', autoSelectSingle: true, onAutoSelect });

            act(() => onData()[1](['a', 'b']));

            expect(onAutoSelect).not.toHaveBeenCalled();
        });

        it('does not fire for an empty array', () => {
            const onAutoSelect = jest.fn();
            renderWith({ messageType: 'projects', autoSelectSingle: true, onAutoSelect });

            act(() => onData()[1]([]));

            expect(onAutoSelect).not.toHaveBeenCalled();
        });

        it('does not fire for a non-array that merely has a length of 1', () => {
            // Array-LIKE is not array. Selecting `payload[0]` off one hands the
            // caller undefined and calls it a selection.
            const onAutoSelect = jest.fn();
            renderWith({ messageType: 'projects', autoSelectSingle: true, onAutoSelect });

            act(() => onData()[1]({ length: 1 }));

            expect(onAutoSelect).not.toHaveBeenCalled();
        });

        it('stores the single item without crashing when no onAutoSelect was given', () => {
            const { result } = renderHook(() =>
                useAsyncData<string[]>({ messageType: 'projects', autoSelectSingle: true }),
            );

            act(() => onData()[1](['only']));

            expect(result.current.data).toEqual(['only']);
        });
    });

    describe('the error subscription', () => {
        it('subscribes to the caller’s error type, disabled when there is none', () => {
            renderHook(() => useAsyncData({ errorMessageType: 'project-error' }));
            expect(onError()[0]).toBe('project-error');

            renderHook(() => useAsyncData());
            expect(onError()[0]).toBe('__disabled__');
        });

        it('declares its dependencies', () => {
            renderHook(() => useAsyncData({ errorMessageType: 'project-error' }));

            expect(onError()[2]).toEqual(['project-error', expect.any(Function)]);
        });

        it('ignores an error message when no error type was configured', () => {
            const { result } = renderHook(() => useAsyncData());

            act(() => onError()[1]('boom'));

            expect(result.current.error).toBeNull();
        });

        it('takes a string payload as the message itself', () => {
            const { result } = renderHook(() =>
                useAsyncData({ errorMessageType: 'project-error' }),
            );

            act(() => onError()[1]('boom'));

            expect(result.current.error).toBe('boom');
        });

        it('takes the error field out of an object payload', () => {
            const { result } = renderHook(() =>
                useAsyncData({ errorMessageType: 'project-error' }),
            );

            act(() => onError()[1]({ error: 'boom' }));

            expect(result.current.error).toBe('boom');
        });

        it('falls back to a generic message for a payload that carries none', () => {
            // Including undefined: reading `.error` off it without the optional
            // chain throws inside the message handler, where nothing catches it.
            const { result: absent } = renderHook(() =>
                useAsyncData({ errorMessageType: 'project-error' }),
            );
            act(() => onError()[1](undefined));
            expect(absent.current.error).toBe('An error occurred');

            const { result: empty } = renderHook(() =>
                useAsyncData({ errorMessageType: 'project-error' }),
            );
            act(() => onError()[1]({ error: '' }));
            expect(empty.current.error).toBe('An error occurred');
        });
    });
});
