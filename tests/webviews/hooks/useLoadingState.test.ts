import { renderHook, act } from '@testing-library/react';
import { useLoadingState } from '../../../src/webviews/hooks/useLoadingState';

describe('useLoadingState', () => {
  describe('initial state', () => {
    it('returns initial state with null data', () => {
      const { result } = renderHook(() => useLoadingState());

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.hasLoadedOnce).toBe(false);
      expect(result.current.isRefreshing).toBe(false);
    });

    it('accepts initial data', () => {
      const initialData = { id: '123', name: 'Test' };
      const { result } = renderHook(() => useLoadingState(initialData));

      expect(result.current.data).toEqual(initialData);
      expect(result.current.hasLoadedOnce).toBe(true);
    });

    it('hasLoadedOnce is true when initial data is provided', () => {
      const { result } = renderHook(() => useLoadingState([]));

      expect(result.current.hasLoadedOnce).toBe(true);
    });
  });

  describe('setData', () => {
    it('sets data and clears loading/error states', () => {
      const { result } = renderHook(() => useLoadingState<string>());

      act(() => {
        result.current.setLoading(true);
        result.current.setError('Some error');
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.setData('new data');
      });

      expect(result.current.data).toBe('new data');
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.hasLoadedOnce).toBe(true);
      expect(result.current.isRefreshing).toBe(false);
    });

    it('sets hasLoadedOnce flag', () => {
      const { result } = renderHook(() => useLoadingState());

      expect(result.current.hasLoadedOnce).toBe(false);

      act(() => {
        result.current.setData({ value: 'test' });
      });

      expect(result.current.hasLoadedOnce).toBe(true);
    });

    it('updates data multiple times', () => {
      const { result } = renderHook(() => useLoadingState<number>());

      act(() => {
        result.current.setData(1);
      });
      expect(result.current.data).toBe(1);

      act(() => {
        result.current.setData(2);
      });
      expect(result.current.data).toBe(2);

      act(() => {
        result.current.setData(3);
      });
      expect(result.current.data).toBe(3);
    });
  });

  describe('setLoading', () => {
    it('sets loading state', () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.loading).toBe(true);
    });

    it('clears error when setting loading to true', () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setError('Some error');
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('does not clear error when setting loading to false', () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setError('Some error');
        result.current.setLoading(false);
      });

      expect(result.current.error).toBe('Some error');
      expect(result.current.loading).toBe(false);
    });
  });

  describe('setError', () => {
    it('sets error and clears loading/refreshing states', () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setLoading(true);
        result.current.setRefreshing(true);
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.isRefreshing).toBe(true);

      act(() => {
        result.current.setError('Failed to load');
      });

      expect(result.current.error).toBe('Failed to load');
      expect(result.current.loading).toBe(false);
      expect(result.current.isRefreshing).toBe(false);
    });

    it('preserves data when error occurs', () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setData({ value: 'test' });
      });

      act(() => {
        result.current.setError('Some error');
      });

      expect(result.current.data).toEqual({ value: 'test' });
      expect(result.current.error).toBe('Some error');
    });
  });

  describe('setRefreshing', () => {
    it('sets refreshing state', () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setRefreshing(true);
      });

      expect(result.current.isRefreshing).toBe(true);
      expect(result.current.loading).toBe(false); // Independent of loading
    });

    it('clears error when setting refreshing to true', () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setError('Some error');
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.setRefreshing(true);
      });

      expect(result.current.isRefreshing).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('preserves data during refresh', () => {
      const initialData = { value: 'initial' };
      const { result } = renderHook(() => useLoadingState(initialData));

      act(() => {
        result.current.setRefreshing(true);
      });

      expect(result.current.data).toEqual(initialData);
      expect(result.current.isRefreshing).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets to initial state with null data', () => {
      const { result } = renderHook(() => useLoadingState<string>());

      act(() => {
        result.current.setData('some data');
        result.current.setError('some error');
        result.current.setLoading(true);
        result.current.setRefreshing(true);
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
      const { result } = renderHook(() => useLoadingState(initialData));

      act(() => {
        result.current.setData({ id: '456' });
        result.current.setError('error');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.data).toEqual(initialData);
      expect(result.current.error).toBeNull();
      expect(result.current.hasLoadedOnce).toBe(true);
    });
  });

  describe('typical async operation flow', () => {
    it('handles successful load flow', () => {
      const { result } = renderHook(() => useLoadingState<string>());

      // Start loading
      act(() => {
        result.current.setLoading(true);
      });
      expect(result.current.loading).toBe(true);
      expect(result.current.hasLoadedOnce).toBe(false);

      // Simulate successful data fetch
      act(() => {
        result.current.setData('loaded data');
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBe('loaded data');
      expect(result.current.hasLoadedOnce).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('handles failed load flow', () => {
      const { result } = renderHook(() => useLoadingState<string>());

      // Start loading
      act(() => {
        result.current.setLoading(true);
      });
      expect(result.current.loading).toBe(true);

      // Simulate failed data fetch
      act(() => {
        result.current.setError('Failed to load');
      });
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe('Failed to load');
      expect(result.current.data).toBeNull();
    });

    it('handles refresh flow', () => {
      const { result } = renderHook(() => useLoadingState<string>());

      // Initial load
      act(() => {
        result.current.setData('initial data');
      });

      // Start refresh
      act(() => {
        result.current.setRefreshing(true);
      });
      expect(result.current.isRefreshing).toBe(true);
      expect(result.current.data).toBe('initial data'); // Data still available

      // Complete refresh
      act(() => {
        result.current.setData('refreshed data');
      });
      expect(result.current.isRefreshing).toBe(false);
      expect(result.current.data).toBe('refreshed data');
    });
  });

  describe('function stability', () => {
    it('setData function is stable across renders', () => {
      const { result, rerender } = renderHook(() => useLoadingState());

      const setData1 = result.current.setData;
      rerender();
      const setData2 = result.current.setData;

      expect(setData1).toBe(setData2);
    });

    it('all setter functions are stable', () => {
      const { result, rerender } = renderHook(() => useLoadingState());

      const funcs1 = {
        setData: result.current.setData,
        setLoading: result.current.setLoading,
        setError: result.current.setError,
        setRefreshing: result.current.setRefreshing,
        reset: result.current.reset
      };

      rerender();

      const funcs2 = {
        setData: result.current.setData,
        setLoading: result.current.setLoading,
        setError: result.current.setError,
        setRefreshing: result.current.setRefreshing,
        reset: result.current.reset
      };

      expect(funcs1.setData).toBe(funcs2.setData);
      expect(funcs1.setLoading).toBe(funcs2.setLoading);
      expect(funcs1.setError).toBe(funcs2.setError);
      expect(funcs1.setRefreshing).toBe(funcs2.setRefreshing);
      expect(funcs1.reset).toBe(funcs2.reset);
    });
  });
});
