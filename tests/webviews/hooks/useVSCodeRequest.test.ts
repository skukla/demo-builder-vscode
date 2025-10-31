import { renderHook, act, waitFor } from '@testing-library/react';
import { useVSCodeRequest } from '@/webview-ui/shared/hooks/useVSCodeRequest';
import { webviewClient } from '@/webview-ui/shared/utils/WebviewClient';

// Mock the webviewClient
jest.mock('@/webview-ui/shared/utils/WebviewClient', () => ({
  webviewClient: {
    request: jest.fn()
  }
}));

describe('useVSCodeRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('returns initial state with no loading/error/data', () => {
      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.data).toBeNull();
      expect(result.current.execute).toBeInstanceOf(Function);
      expect(result.current.reset).toBeInstanceOf(Function);
    });
  });

  describe('successful request', () => {
    it('executes request and updates state on success', async () => {
      const mockData = { id: '123', name: 'Test' };
      (webviewClient.request as jest.Mock).mockResolvedValue(mockData);

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();

      let executePromise: Promise<any>;
      act(() => {
        executePromise = result.current.execute({ param: 'value' });
      });

      // Should be loading
      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();

      // Wait for request to complete
      const returnedData = await act(() => executePromise);

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual(mockData);
      expect(returnedData).toEqual(mockData);
      expect(webviewClient.request).toHaveBeenCalledWith('test-request', { param: 'value' }, undefined);
    });

    it('executes request without payload', async () => {
      const mockData = { result: 'success' };
      (webviewClient.request as jest.Mock).mockResolvedValue(mockData);

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      let executePromise: Promise<any>;
      act(() => {
        executePromise = result.current.execute();
      });

      const returnedData = await act(() => executePromise);

      expect(returnedData).toEqual(mockData);
      expect(webviewClient.request).toHaveBeenCalledWith('test-request', undefined, undefined);
    });

    it('calls onSuccess callback when request succeeds', async () => {
      const mockData = { result: 'success' };
      const onSuccess = jest.fn();
      (webviewClient.request as jest.Mock).mockResolvedValue(mockData);

      const { result } = renderHook(() =>
        useVSCodeRequest('test-request', { onSuccess })
      );

      await act(async () => {
        await result.current.execute();
      });

      expect(onSuccess).toHaveBeenCalledWith(mockData);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it('handles multiple successful requests', async () => {
      (webviewClient.request as jest.Mock)
        .mockResolvedValueOnce({ result: 1 })
        .mockResolvedValueOnce({ result: 2 });

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      // First request
      await act(async () => {
        await result.current.execute();
      });
      expect(result.current.data).toEqual({ result: 1 });

      // Second request
      await act(async () => {
        await result.current.execute();
      });
      expect(result.current.data).toEqual({ result: 2 });

      expect(webviewClient.request).toHaveBeenCalledTimes(2);
    });
  });

  describe('failed request', () => {
    it('handles error and updates state', async () => {
      const mockError = new Error('Request failed');
      (webviewClient.request as jest.Mock).mockRejectedValue(mockError);

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      let executePromise: Promise<any>;
      act(() => {
        executePromise = result.current.execute();
      });

      expect(result.current.loading).toBe(true);

      await expect(act(() => executePromise)).rejects.toThrow('Request failed');

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toBeNull();
    });

    it('converts non-Error objects to Error', async () => {
      (webviewClient.request as jest.Mock).mockRejectedValue('String error');

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      await expect(
        act(async () => {
          await result.current.execute();
        })
      ).rejects.toThrow('String error');

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('String error');
    });

    it('calls onError callback when request fails', async () => {
      const mockError = new Error('Request failed');
      const onError = jest.fn();
      (webviewClient.request as jest.Mock).mockRejectedValue(mockError);

      const { result } = renderHook(() =>
        useVSCodeRequest('test-request', { onError })
      );

      await expect(
        act(async () => {
          await result.current.execute();
        })
      ).rejects.toThrow();

      expect(onError).toHaveBeenCalledWith(mockError);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('clears error on new request', async () => {
      const mockError = new Error('First error');
      (webviewClient.request as jest.Mock)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce({ result: 'success' });

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      // First request fails
      await expect(
        act(async () => {
          await result.current.execute();
        })
      ).rejects.toThrow();

      expect(result.current.error).toEqual(mockError);

      // Second request succeeds
      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.data).toEqual({ result: 'success' });
    });
  });

  describe('timeout', () => {
    it('passes custom timeout to webviewClient.request', async () => {
      (webviewClient.request as jest.Mock).mockResolvedValue({ result: 'success' });

      const { result } = renderHook(() =>
        useVSCodeRequest('test-request', { timeout: 5000 })
      );

      await act(async () => {
        await result.current.execute({ data: 'test' });
      });

      expect(webviewClient.request).toHaveBeenCalledWith('test-request', { data: 'test' }, 5000);
    });

    it('uses default timeout when not specified', async () => {
      (webviewClient.request as jest.Mock).mockResolvedValue({ result: 'success' });

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      await act(async () => {
        await result.current.execute();
      });

      expect(webviewClient.request).toHaveBeenCalledWith('test-request', undefined, undefined);
    });
  });

  describe('reset functionality', () => {
    it('resets state to initial values', async () => {
      const mockData = { result: 'success' };
      (webviewClient.request as jest.Mock).mockResolvedValue(mockData);

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      // Execute request
      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.loading).toBe(false);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.data).toBeNull();
    });

    it('resets error state', async () => {
      const mockError = new Error('Request failed');
      (webviewClient.request as jest.Mock).mockRejectedValue(mockError);

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      // Execute request that fails
      await expect(
        act(async () => {
          await result.current.execute();
        })
      ).rejects.toThrow();

      expect(result.current.error).toEqual(mockError);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('concurrent requests', () => {
    it('handles concurrent requests correctly', async () => {
      (webviewClient.request as jest.Mock)
        .mockImplementation((type, payload) => {
          return new Promise(resolve => {
            setTimeout(() => resolve({ id: payload.id }), 100);
          });
        });

      const { result } = renderHook(() => useVSCodeRequest('test-request'));

      // Start two requests concurrently
      const promise1 = act(async () => {
        return result.current.execute({ id: 1 });
      });

      const promise2 = act(async () => {
        return result.current.execute({ id: 2 });
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should complete successfully
      expect(result1).toEqual({ id: 1 });
      expect(result2).toEqual({ id: 2 });
    });
  });

  describe('typed responses', () => {
    interface TestResponse {
      id: string;
      name: string;
      count: number;
    }

    it('handles typed response data', async () => {
      const mockData: TestResponse = { id: '123', name: 'Test', count: 5 };
      (webviewClient.request as jest.Mock).mockResolvedValue(mockData);

      const { result } = renderHook(() => useVSCodeRequest<TestResponse>('test-request'));

      await act(async () => {
        await result.current.execute();
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.data?.id).toBe('123');
      expect(result.current.data?.name).toBe('Test');
      expect(result.current.data?.count).toBe(5);
    });
  });

  describe('callback stability', () => {
    it('execute function is stable across renders', () => {
      const { result, rerender } = renderHook(() => useVSCodeRequest('test-request'));

      const execute1 = result.current.execute;
      rerender();
      const execute2 = result.current.execute;

      expect(execute1).toBe(execute2);
    });

    it('reset function is stable across renders', () => {
      const { result, rerender } = renderHook(() => useVSCodeRequest('test-request'));

      const reset1 = result.current.reset;
      rerender();
      const reset2 = result.current.reset;

      expect(reset1).toBe(reset2);
    });
  });
});
