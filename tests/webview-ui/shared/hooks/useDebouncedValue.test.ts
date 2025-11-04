import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '@/webview-ui/shared/hooks/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initial value', () => {
    it('returns initial value immediately', () => {
      const { result } = renderHook(() => useDebouncedValue('initial', 500));

      expect(result.current).toBe('initial');
    });

    it('handles different types', () => {
      const { result: stringResult } = renderHook(() => useDebouncedValue('test', 300));
      const { result: numberResult } = renderHook(() => useDebouncedValue(42, 300));
      const { result: objectResult } = renderHook(() =>
        useDebouncedValue({ key: 'value' }, 300)
      );

      expect(stringResult.current).toBe('test');
      expect(numberResult.current).toBe(42);
      expect(objectResult.current).toEqual({ key: 'value' });
    });
  });

  describe('debouncing behavior', () => {
    it('debounces value updates', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 500),
        { initialProps: { value: 'initial' } }
      );

      expect(result.current).toBe('initial');

      // Update value
      rerender({ value: 'updated' });

      // Should not update immediately
      expect(result.current).toBe('initial');

      // Advance timers
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Should update after delay
      expect(result.current).toBe('updated');
    });

    it('cancels previous timeout on rapid changes', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 500),
        { initialProps: { value: 'value1' } }
      );

      // Make rapid changes
      rerender({ value: 'value2' });
      act(() => {
        jest.advanceTimersByTime(200);
      });
      rerender({ value: 'value3' });
      act(() => {
        jest.advanceTimersByTime(200);
      });
      rerender({ value: 'value4' });

      // Still should be initial value
      expect(result.current).toBe('value1');

      // Advance full delay from last update
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Should be the last value
      expect(result.current).toBe('value4');
    });

    it('updates only once after multiple rapid changes', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 300),
        { initialProps: { value: 'initial' } }
      );

      // Rapid changes
      for (let i = 1; i <= 10; i++) {
        rerender({ value: `value${i}` });
        act(() => {
          jest.advanceTimersByTime(50);
        });
      }

      // Still initial value
      expect(result.current).toBe('initial');

      // Wait for debounce to complete
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should be last value only
      expect(result.current).toBe('value10');
    });
  });

  describe('custom delay', () => {
    it('uses default delay of 300ms', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      act(() => {
        jest.advanceTimersByTime(299);
      });
      expect(result.current).toBe('initial');

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBe('updated');
    });

    it('respects custom delay', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 1000),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      act(() => {
        jest.advanceTimersByTime(999);
      });
      expect(result.current).toBe('initial');

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBe('updated');
    });

    it('handles delay of 0', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 0),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(result.current).toBe('updated');
    });
  });

  describe('cleanup on unmount', () => {
    it('clears timeout on unmount', () => {
      const { rerender, unmount } = renderHook(
        ({ value }) => useDebouncedValue(value, 500),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      // Unmount before debounce completes
      unmount();

      // Advance timers - should not throw or cause issues
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // No assertions needed - just verify no errors
    });
  });

  describe('delay change', () => {
    it('uses new delay when delay prop changes', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebouncedValue(value, delay),
        { initialProps: { value: 'initial', delay: 500 } }
      );

      // Change value
      rerender({ value: 'updated', delay: 500 });

      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Now change delay
      rerender({ value: 'updated', delay: 100 });

      // Old timer should be cleared, new one starts
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current).toBe('updated');
    });
  });

  describe('real-world use cases', () => {
    it('works for search input scenario', () => {
      const { result, rerender } = renderHook(
        ({ query }) => useDebouncedValue(query, 300),
        { initialProps: { query: '' } }
      );

      // User types "r"
      rerender({ query: 'r' });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // User types "re"
      rerender({ query: 're' });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // User types "react"
      rerender({ query: 'react' });

      // Should still show empty (debouncing)
      expect(result.current).toBe('');

      // After delay
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should show final value
      expect(result.current).toBe('react');
    });

    it('works for API call debouncing', () => {
      const mockApiCall = jest.fn();

      const { rerender } = renderHook(
        ({ value }) => {
          const debouncedValue = useDebouncedValue(value, 500);

          // Simulate effect that calls API
          if (debouncedValue) {
            mockApiCall(debouncedValue);
          }

          return debouncedValue;
        },
        { initialProps: { value: '' } }
      );

      // Rapid value changes
      rerender({ value: 'a' });
      rerender({ value: 'ab' });
      rerender({ value: 'abc' });

      // API should not be called yet
      expect(mockApiCall).not.toHaveBeenCalled();

      // Wait for debounce
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // API called once with final value
      expect(mockApiCall).toHaveBeenCalledTimes(1);
      expect(mockApiCall).toHaveBeenCalledWith('abc');
    });
  });

  describe('complex types', () => {
    it('handles object values', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 300),
        { initialProps: { value: { count: 0 } } }
      );

      rerender({ value: { count: 1 } });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(result.current).toEqual({ count: 1 });
    });

    it('handles array values', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebouncedValue(value, 300),
        { initialProps: { value: [1, 2, 3] } }
      );

      rerender({ value: [4, 5, 6] });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(result.current).toEqual([4, 5, 6]);
    });
  });
});
