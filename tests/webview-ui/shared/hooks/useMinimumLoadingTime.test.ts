import { renderHook, act } from '@testing-library/react';
import { useMinimumLoadingTime } from '@/core/ui/hooks/useMinimumLoadingTime';

describe('useMinimumLoadingTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('returns false when not loading', () => {
      const { result } = renderHook(() => useMinimumLoadingTime(false, 500));

      expect(result.current).toBe(false);
    });

    it('returns true immediately when loading starts', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });

      // Should show loading immediately
      expect(result.current).toBe(true);
    });
  });

  describe('minimum duration', () => {
    it('uses default minimum duration of 500ms', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });
      expect(result.current).toBe(true);

      // Complete quickly (100ms)
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });

      // Should still show loading (hasn't reached minimum)
      expect(result.current).toBe(true);

      // Advance to minimum duration
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Should hide now
      expect(result.current).toBe(false);
    });

    it('respects custom minimum duration', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 1000),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });

      // Complete quickly (200ms)
      act(() => {
        jest.advanceTimersByTime(200);
      });
      rerender({ isLoading: false });

      // Should still show loading
      expect(result.current).toBe(true);

      // Advance to minimum
      act(() => {
        jest.advanceTimersByTime(800);
      });

      // Should hide now
      expect(result.current).toBe(false);
    });
  });

  describe('fast operations', () => {
    it('extends display time for operations faster than minimum', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });
      expect(result.current).toBe(true);

      // Complete in 100ms (much faster than minimum)
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });

      // Should still show loading
      expect(result.current).toBe(true);

      // Wait remaining time (400ms)
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Now should hide
      expect(result.current).toBe(false);
    });

    it('prevents jarring flashes for very fast operations', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });

      // Complete almost instantly (10ms)
      act(() => {
        jest.advanceTimersByTime(10);
      });
      rerender({ isLoading: false });

      // Should still show for remaining time
      expect(result.current).toBe(true);

      act(() => {
        jest.advanceTimersByTime(490);
      });

      expect(result.current).toBe(false);
    });
  });

  describe('slow operations', () => {
    it('hides immediately for operations longer than minimum', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });

      // Take longer than minimum (2000ms)
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      rerender({ isLoading: false });

      // Should hide immediately (minimum already exceeded)
      expect(result.current).toBe(false);
    });

    it('does not delay hiding for long operations', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // Start loading
      rerender({ isLoading: true });

      // Take 1000ms (longer than minimum)
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      rerender({ isLoading: false });

      // Should hide immediately
      expect(result.current).toBe(false);

      // Advancing time should not change anything
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current).toBe(false);
    });
  });

  describe('multiple operations', () => {
    it('handles consecutive operations correctly', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // First operation (fast)
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });
      expect(result.current).toBe(true);

      // Wait for minimum to complete
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(result.current).toBe(false);

      // Second operation (slow)
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      rerender({ isLoading: false });
      expect(result.current).toBe(false);
    });

    it('cancels previous timeout when new operation starts', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // First operation (fast)
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });
      expect(result.current).toBe(true);

      // Second operation starts before first minimum completes
      act(() => {
        jest.advanceTimersByTime(200);
      });
      rerender({ isLoading: true });
      expect(result.current).toBe(true);

      // Complete second operation quickly
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });

      // Should still show (new minimum timer started)
      expect(result.current).toBe(true);

      // Wait for new minimum
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(result.current).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('clears timeout on unmount', () => {
      const { rerender, unmount } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // Start and complete loading
      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender({ isLoading: false });

      // Unmount before minimum completes
      unmount();

      // Advance time - should not cause errors
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // No assertions needed - just verify no errors
    });
  });

  describe('edge cases', () => {
    it('handles minimum duration of 0', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 0),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });
      rerender({ isLoading: false });

      // Should hide immediately with 0 minimum
      expect(result.current).toBe(false);
    });

    it('handles very short minimum durations', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 10),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });
      act(() => {
        jest.advanceTimersByTime(5);
      });
      rerender({ isLoading: false });

      expect(result.current).toBe(true);

      act(() => {
        jest.advanceTimersByTime(5);
      });
      expect(result.current).toBe(false);
    });

    it('handles operation completing exactly at minimum duration', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      rerender({ isLoading: true });

      // Complete exactly at minimum
      act(() => {
        jest.advanceTimersByTime(500);
      });
      rerender({ isLoading: false });

      // Should hide immediately (minimum reached)
      expect(result.current).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    it('provides smooth UX for button click with fast response', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // User clicks button, operation completes in 150ms
      rerender({ isLoading: true });
      expect(result.current).toBe(true); // Spinner shows immediately

      act(() => {
        jest.advanceTimersByTime(150);
      });
      rerender({ isLoading: false });

      // Spinner stays visible (feels intentional, not buggy)
      expect(result.current).toBe(true);

      // Spinner hides after minimum duration
      act(() => {
        jest.advanceTimersByTime(350);
      });
      expect(result.current).toBe(false);
    });

    it('provides smooth UX for data fetching', () => {
      const { result, rerender } = renderHook(
        ({ isLoading }) => useMinimumLoadingTime(isLoading, 500),
        { initialProps: { isLoading: false } }
      );

      // Start fetching data
      rerender({ isLoading: true });
      expect(result.current).toBe(true);

      // Fetch takes 2 seconds
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      rerender({ isLoading: false });

      // Spinner hides immediately (operation was long)
      expect(result.current).toBe(false);
    });
  });
});
