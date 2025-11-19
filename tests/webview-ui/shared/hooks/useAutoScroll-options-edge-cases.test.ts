import { renderHook, act } from '@testing-library/react';
import { useAutoScroll } from '@/core/ui/hooks/useAutoScroll';
import { createMockContainer, createMockElement } from './useAutoScroll.testUtils';

describe('useAutoScroll - Options and Edge Cases', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('options', () => {
    it('respects enabled option', () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => useAutoScroll({ enabled, delay: 100 }),
        { initialProps: { enabled: true } }
      );

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = createMockElement();

      const refSetter = result.current.createItemRef(0);
      act(() => {
        // @ts-ignore - mocking element
        refSetter(mockElement);
      });

      // Scroll when enabled
      result.current.scrollToItem(0);
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockContainer.scrollTo).toHaveBeenCalledTimes(1);

      // Disable
      rerender({ enabled: false });

      // Should not scroll when disabled
      result.current.scrollToItem(0);
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockContainer.scrollTo).toHaveBeenCalledTimes(1); // Still only once
    });

    it('respects delay option', () => {
      const { result } = renderHook(() => useAutoScroll({ delay: 500 }));

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = createMockElement();

      const refSetter = result.current.createItemRef(0);
      act(() => {
        // @ts-ignore - mocking element
        refSetter(mockElement);
      });

      result.current.scrollToItem(0);

      // Not yet
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(mockContainer.scrollTo).not.toHaveBeenCalled();

      // Now
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockContainer.scrollTo).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles scrolling with delay of 0', () => {
      const { result } = renderHook(() => useAutoScroll({ delay: 0 }));

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = createMockElement();

      const refSetter = result.current.createItemRef(0);
      act(() => {
        // @ts-ignore - mocking element
        refSetter(mockElement);
      });

      result.current.scrollToItem(0);

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(mockContainer.scrollTo).toHaveBeenCalled();
    });

    it('prevents negative scroll positions', () => {
      const { result } = renderHook(() => useAutoScroll({ delay: 100 }));

      const mockContainer = createMockContainer({
        scrollTop: 50
      });

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      // Item above visible area
      const mockElement = createMockElement({
        offsetTop: 5,
        offsetHeight: 10
      });

      const refSetter = result.current.createItemRef(0);
      act(() => {
        // @ts-ignore - mocking element
        refSetter(mockElement);
      });

      result.current.scrollToItem(0);

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockContainer.scrollTo).toHaveBeenCalledWith({
        top: 0, // Not negative
        behavior: 'smooth'
      });
    });
  });
});
