import { renderHook, act } from '@testing-library/react';
import { useDebouncedLoading } from '@/webview-ui/shared/hooks/useDebouncedLoading';

describe('useDebouncedLoading', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('returns false when not loading', () => {
      const { result } = renderHook(() => useDebouncedLoading(false, 300));

      expect(result.current).toBe(false);
    });

    it('returns false initially even if isLoading is true', () => {
      const { result } = renderHook(() => useDebouncedLoading(true, 300));

      // Should not show loading immediately
      expect(result.current).toBe(false);
    });
  });

  describe('debounce delay', () => {
    it('shows loading after default delay of 300ms', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });
      expect(result.current).toBe(false);

      // Advance time but not enough
      act(() => {
        jest.advanceTimersByTime(299);
      });
      expect(result.current).toBe(false);

      // Advance to delay threshold
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBe(true);
    });

    it('shows loading after custom delay', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });

      act(() => {
        jest.advanceTimersByTime(499);
      });
      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBe(true);
    });
  });

  describe('fast operations', () => {
    it('never shows loading for operations faster than delay', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });
      expect(result.current).toBe(false);

      // Complete before delay
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });

      // Should never have shown loading
      expect(result.current).toBe(false);

      // Advance remaining time
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Still should not show loading
      expect(result.current).toBe(false);
    });

    it('prevents flash of loading state for quick operations', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      // Multiple quick operations
      for (let i = 0; i < 5; i++) {
        rerender({ isLoading: true });
        act(() => {
          jest.advanceTimersByTime(50);
        });
        rerender({ isLoading: false });
        act(() => {
          jest.advanceTimersByTime(50);
        });
      }

      // Should never have shown loading
      expect(result.current).toBe(false);
    });
  });

  describe('slow operations', () => {
    it('shows loading for operations longer than delay', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });

      // Wait past delay
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe(true);

      // Continue loading
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current).toBe(true);

      // Complete loading
      rerender({ isLoading: false });
      expect(result.current).toBe(false);
    });

    it('hides loading immediately when operation completes', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      // Start and show loading
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe(true);

      // Complete loading
      rerender({ isLoading: false });

      // Should hide immediately
      expect(result.current).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('clears timeout on unmount', () => {
      const { rerender, unmount } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });

      // Unmount before delay completes
      unmount();

      // Advance time - should not cause errors
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // No assertions needed - just verify no errors
    });

    it('clears timeout when loading completes', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });

      // Complete before delay
      rerender({ isLoading: false });

      // Advance past delay
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should still be false (timeout was cleared)
      expect(result.current).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles delay of 0', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 0),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(result.current).toBe(true);
    });

    it('handles very long delays', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 10000),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });

      act(() => {
        jest.advanceTimersByTime(9999);
      });
      expect(result.current).toBe(false);

      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current).toBe(true);
    });

    it('handles rapid on/off toggling', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      // Rapid toggling
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });

      // Should never show loading
      expect(result.current).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    it('works for API calls that complete quickly', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      // Simulate fast API call (150ms)
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(150);
      });
      rerender({ isLoading: false });

      // Should never show loading UI
      expect(result.current).toBe(false);
    });

    it('works for API calls that take longer', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      // Simulate slow API call (2000ms)
      rerender({ isLoading: true });

      // After 300ms, loading appears
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe(true);

      // Continue showing loading
      act(() => {
        jest.advanceTimersByTime(1700);
      });
      expect(result.current).toBe(true);

      // Complete
      rerender({ isLoading: false });
      expect(result.current).toBe(false);
    });

    it('provides smooth UX for consecutive operations', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useDebouncedLoading(isLoading, 300),
        { initialProps: { isLoading: false } }
      );

      // First operation (fast)
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });
      expect(result.current).toBe(false);

      // Second operation (slow)
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe(true);

      act(() => {
        jest.advanceTimersByTime(500);
      });
      rerender({ isLoading: false });
      expect(result.current).toBe(false);

      // Third operation (fast)
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });
      expect(result.current).toBe(false);
    });
  });
});
