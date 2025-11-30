import { renderHook, act } from '@testing-library/react';
import { useAutoScroll } from '@/core/ui/hooks/useAutoScroll';
import { createMockContainer, createMockElement } from './useAutoScroll.testUtils';

describe('useAutoScroll - Scrolling Operations', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('scrollToItem', () => {
    it('does not throw when refs are not set', () => {
      const { result } = renderHook(() => useAutoScroll());

      expect(() => {
        result.current.scrollToItem(0);
      }).not.toThrow();
    });

    it('does not scroll when disabled', () => {
      const { result } = renderHook(() => useAutoScroll({ enabled: false }));

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = createMockElement({
        offsetTop: 50,
        offsetHeight: 20
      });

      const refSetter = result.current.createItemRef(0);
      act(() => {
        // @ts-ignore - mocking element
        refSetter(mockElement);
      });

      result.current.scrollToItem(0);

      act(() => {
        jest.runAllTimers();
      });

      expect(mockContainer.scrollTo).not.toHaveBeenCalled();
    });

    it('scrolls when enabled', () => {
      const { result } = renderHook(() =>
        useAutoScroll({ enabled: true, delay: 100 })
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

      result.current.scrollToItem(0);

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockContainer.scrollTo).toHaveBeenCalled();
    });

    it('does not scroll if item is already visible', () => {
      const { result } = renderHook(() => useAutoScroll({ delay: 100 }));

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      // Item is fully visible (offsetTop: 10, height: 20, within container)
      const mockElement = createMockElement({
        offsetTop: 10,
        offsetHeight: 20
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

      expect(mockContainer.scrollTo).not.toHaveBeenCalled();
    });

    it('uses specified scroll behavior', () => {
      const { result } = renderHook(() =>
        useAutoScroll({ behavior: 'smooth', delay: 100 })
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

      result.current.scrollToItem(0);

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockContainer.scrollTo).toHaveBeenCalledWith({
        top: expect.any(Number),
        behavior: 'smooth'
      });
    });

    it('applies padding to scroll position', () => {
      const { result } = renderHook(() =>
        useAutoScroll({ padding: 20, delay: 100 })
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

      result.current.scrollToItem(0);

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Should include padding in scroll calculation
      expect(mockContainer.scrollTo).toHaveBeenCalledWith({
        top: 90, // 150 + 20 - 100 + 20 (padding)
        behavior: 'smooth'
      });
    });
  });

  describe('scrollToTop', () => {
    it('scrolls container to top', () => {
      const { result } = renderHook(() => useAutoScroll());

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      result.current.scrollToTop();

      expect(mockContainer.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: 'smooth'
      });
    });

    it('uses specified behavior', () => {
      const { result } = renderHook(() => useAutoScroll({ behavior: 'auto' }));

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      result.current.scrollToTop();

      expect(mockContainer.scrollTo).toHaveBeenCalledWith({
        top: 0,
        behavior: 'auto'
      });
    });

    it('does nothing if container ref is not set', () => {
      const { result } = renderHook(() => useAutoScroll());

      expect(() => {
        result.current.scrollToTop();
      }).not.toThrow();
    });
  });

  describe('scrollToBottom', () => {
    it('scrolls container to bottom', () => {
      const { result } = renderHook(() => useAutoScroll());

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      result.current.scrollToBottom();

      expect(mockContainer.scrollTo).toHaveBeenCalledWith({
        top: 500,
        behavior: 'smooth'
      });
    });

    it('uses specified behavior', () => {
      const { result } = renderHook(() => useAutoScroll({ behavior: 'auto' }));

      const mockContainer = createMockContainer();

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      result.current.scrollToBottom();

      expect(mockContainer.scrollTo).toHaveBeenCalledWith({
        top: 500,
        behavior: 'auto'
      });
    });

    it('does nothing if container ref is not set', () => {
      const { result } = renderHook(() => useAutoScroll());

      expect(() => {
        result.current.scrollToBottom();
      }).not.toThrow();
    });
  });
});
