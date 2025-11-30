import { renderHook, act, waitFor } from '@testing-library/react';
import { useAsyncOperation } from '@/core/ui/hooks/useAsyncOperation';

describe('useAsyncOperation', () => {
    describe('execution flow', () => {
        it('should set isExecuting true during operation', async () => {
            const { result } = renderHook(() => useAsyncOperation());

            let resolvePromise: (value: string) => void;
            const promise = new Promise<string>((resolve) => {
                resolvePromise = resolve;
            });

            act(() => {
                result.current.execute(() => promise);
            });

            expect(result.current.isExecuting).toBe(true);

            await act(async () => {
                resolvePromise!('done');
                await promise;
            });

            expect(result.current.isExecuting).toBe(false);
        });

        it('should set isExecuting false after success', async () => {
            const { result } = renderHook(() => useAsyncOperation());

            await act(async () => {
                await result.current.execute(async () => 'result');
            });

            expect(result.current.isExecuting).toBe(false);
        });

        it('should set isExecuting false after error', async () => {
            const { result } = renderHook(() => useAsyncOperation());

            await act(async () => {
                await result.current.execute(async () => {
                    throw new Error('test error');
                });
            });

            expect(result.current.isExecuting).toBe(false);
        });

        it('should return result from successful operation', async () => {
            const { result } = renderHook(() => useAsyncOperation<string>());

            let returnValue: string | undefined;
            await act(async () => {
                returnValue = await result.current.execute(async () => 'test-result');
            });

            expect(returnValue).toBe('test-result');
        });

        it('should return undefined on error', async () => {
            const { result } = renderHook(() => useAsyncOperation());

            let returnValue: unknown;
            await act(async () => {
                returnValue = await result.current.execute(async () => {
                    throw new Error('test error');
                });
            });

            expect(returnValue).toBeUndefined();
        });
    });

    describe('callbacks', () => {
        it('should call onSuccess callback with result', async () => {
            const onSuccess = jest.fn();
            const { result } = renderHook(() =>
                useAsyncOperation<string>({ onSuccess })
            );

            await act(async () => {
                await result.current.execute(async () => 'success-data');
            });

            expect(onSuccess).toHaveBeenCalledWith('success-data');
        });

        it('should call onError callback with error', async () => {
            const onError = jest.fn();
            const { result } = renderHook(() =>
                useAsyncOperation({ onError })
            );

            const testError = new Error('test error');
            await act(async () => {
                await result.current.execute(async () => {
                    throw testError;
                });
            });

            expect(onError).toHaveBeenCalledWith(testError);
        });

        it('should convert non-Error throws to Error objects', async () => {
            const onError = jest.fn();
            const { result } = renderHook(() =>
                useAsyncOperation({ onError })
            );

            await act(async () => {
                await result.current.execute(async () => {
                    throw 'string error';
                });
            });

            expect(onError).toHaveBeenCalledWith(expect.any(Error));
            expect(onError.mock.calls[0][0].message).toBe('string error');
        });
    });

    describe('message management', () => {
        it('should use initial message when provided', () => {
            const { result } = renderHook(() =>
                useAsyncOperation({
                    initialMessage: 'Starting...',
                    initialSubMessage: 'Please wait',
                })
            );

            expect(result.current.message).toBe('Starting...');
            expect(result.current.subMessage).toBe('Please wait');
        });

        it('should allow message updates', () => {
            const { result } = renderHook(() => useAsyncOperation());

            act(() => {
                result.current.setMessage('Processing...');
                result.current.setSubMessage('Step 1 of 3');
            });

            expect(result.current.message).toBe('Processing...');
            expect(result.current.subMessage).toBe('Step 1 of 3');
        });

        it('should clear messages on reset', () => {
            const { result } = renderHook(() => useAsyncOperation());

            act(() => {
                result.current.setMessage('Some message');
                result.current.setSubMessage('Some sub-message');
            });

            act(() => {
                result.current.reset();
            });

            expect(result.current.message).toBeNull();
            expect(result.current.subMessage).toBeNull();
        });

        it('should restore initial messages on reset', () => {
            const { result } = renderHook(() =>
                useAsyncOperation({
                    initialMessage: 'Initial',
                    initialSubMessage: 'Sub-initial',
                })
            );

            act(() => {
                result.current.setMessage('Changed');
                result.current.setSubMessage('Changed sub');
            });

            act(() => {
                result.current.reset();
            });

            expect(result.current.message).toBe('Initial');
            expect(result.current.subMessage).toBe('Sub-initial');
        });
    });

    describe('error handling', () => {
        it('should capture error from failed operation', async () => {
            const { result } = renderHook(() => useAsyncOperation());

            const testError = new Error('Operation failed');
            await act(async () => {
                await result.current.execute(async () => {
                    throw testError;
                });
            });

            expect(result.current.error).toBe(testError);
        });

        it('should clear error on new execution', async () => {
            const { result } = renderHook(() => useAsyncOperation());

            // First: fail
            await act(async () => {
                await result.current.execute(async () => {
                    throw new Error('first error');
                });
            });

            expect(result.current.error).not.toBeNull();

            // Second: succeed
            await act(async () => {
                await result.current.execute(async () => 'success');
            });

            expect(result.current.error).toBeNull();
        });

        it('should clear error on reset', async () => {
            const { result } = renderHook(() => useAsyncOperation());

            await act(async () => {
                await result.current.execute(async () => {
                    throw new Error('test error');
                });
            });

            expect(result.current.error).not.toBeNull();

            act(() => {
                result.current.reset();
            });

            expect(result.current.error).toBeNull();
        });

        it('should allow retry after error', async () => {
            const { result } = renderHook(() => useAsyncOperation<string>());

            // First: fail
            await act(async () => {
                await result.current.execute(async () => {
                    throw new Error('temporary error');
                });
            });

            expect(result.current.error).not.toBeNull();

            // Second: succeed
            let retryResult: string | undefined;
            await act(async () => {
                retryResult = await result.current.execute(async () => 'retry-success');
            });

            expect(retryResult).toBe('retry-success');
            expect(result.current.error).toBeNull();
        });
    });

    describe('unmount safety', () => {
        it('should not update state after unmount', async () => {
            const onSuccess = jest.fn();
            const { result, unmount } = renderHook(() =>
                useAsyncOperation({ onSuccess })
            );

            let resolvePromise: (value: string) => void;
            const promise = new Promise<string>((resolve) => {
                resolvePromise = resolve;
            });

            act(() => {
                result.current.execute(() => promise);
            });

            // Unmount before promise resolves
            unmount();

            // Resolve after unmount
            await act(async () => {
                resolvePromise!('late result');
                await promise.catch(() => {}); // Ignore unhandled rejection
            });

            // onSuccess should not have been called
            expect(onSuccess).not.toHaveBeenCalled();
        });
    });
});
