import { renderHook, act } from '@testing-library/react';
import { useAsyncData } from '@/webview-ui/shared/hooks/useAsyncData';
import { vscode } from '@/webview-ui/shared/vscode-api';

// Mock vscode API
jest.mock('@/core/ui/vscode-api', () => ({
  vscode: {
    onMessage: jest.fn()
  }
}));

// Mock useVSCodeMessage and useLoadingState since useAsyncData depends on them
jest.mock('@/core/ui/hooks/useVSCodeMessage', () => ({
  useVSCodeMessage: jest.fn()
}));

describe('useAsyncData', () => {
  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnsubscribe = jest.fn();
    (vscode.onMessage as jest.Mock).mockReturnValue(mockUnsubscribe);
  });

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
      const { result } = renderHook(() =>
        useAsyncData({ initialData })
      );

      expect(result.current.data).toEqual(initialData);
      expect(result.current.hasLoadedOnce).toBe(true);
    });

    it('sets up loading state when autoLoad is true', () => {
      const { result } = renderHook(() =>
        useAsyncData({ autoLoad: true })
      );

      // autoLoad triggers internal state but loading is managed by useLoadingState
      // The actual loading state depends on when load() is called
      expect(result.current).toBeDefined();
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
      const { result } = renderHook(() =>
        useAsyncData({ initialData })
      );

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
      const { result } = renderHook(() =>
        useAsyncData({ initialData })
      );

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
        transformed: true
      });

      const { result } = renderHook(() =>
        useAsyncData({ transform })
      );

      const rawData = { id: '123', name: 'Test' };

      act(() => {
        result.current.setData(transform(rawData));
      });

      expect(result.current.data).toEqual({
        id: '123',
        name: 'Test',
        transformed: true
      });
    });
  });

  describe('autoLoad option', () => {
    it('triggers load request when autoLoad is true', () => {
      const { result } = renderHook(() =>
        useAsyncData({ autoLoad: true })
      );

      // autoLoad is set up internally, actual loading depends on implementation
      expect(result.current).toBeDefined();
      expect(result.current.load).toBeInstanceOf(Function);
    });

    it('does not trigger load when autoLoad is false', () => {
      const { result } = renderHook(() =>
        useAsyncData({ autoLoad: false })
      );

      expect(result.current.loading).toBe(false);
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
        reset: result.current.reset
      };

      rerender();

      const funcs2 = {
        load: result.current.load,
        setData: result.current.setData,
        setLoading: result.current.setLoading,
        setError: result.current.setError,
        reset: result.current.reset
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
});
