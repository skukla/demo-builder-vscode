import { renderHook, act } from '@testing-library/react';
import { useAutoScroll } from '@/webview-ui/shared/hooks/useAutoScroll';

describe('useAutoScroll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('returns container ref and helper functions', () => {
      const { result } = renderHook(() => useAutoScroll());

      expect(result.current.containerRef).toBeDefined();
      expect(result.current.containerRef.current).toBeNull(); // Not attached to DOM
      expect(typeof result.current.createItemRef).toBe('function');
      expect(typeof result.current.scrollToItem).toBe('function');
      expect(typeof result.current.scrollToTop).toBe('function');
      expect(typeof result.current.scrollToBottom).toBe('function');
    });

    it('accepts options', () => {
      const { result } = renderHook(() =>
        useAutoScroll({
          enabled: false,
          behavior: 'auto',
          delay: 200,
          padding: 20
        })
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('createItemRef', () => {
    it('creates ref setter function', () => {
      const { result } = renderHook(() => useAutoScroll());

      const refSetter = result.current.createItemRef(0);

      expect(typeof refSetter).toBe('function');
    });

    it('stores element references', () => {
      const { result } = renderHook(() => useAutoScroll());

      const mockElement1 = document.createElement('div');
      const mockElement2 = document.createElement('div');

      const refSetter1 = result.current.createItemRef(0);
      const refSetter2 = result.current.createItemRef(1);

      act(() => {
        refSetter1(mockElement1);
        refSetter2(mockElement2);
      });

      // Refs are stored internally, we can't directly verify
      // but we can test scrollToItem works with them
      expect(() => {
        result.current.scrollToItem(0);
        result.current.scrollToItem(1);
      }).not.toThrow();
    });

    it('handles null element (cleanup)', () => {
      const { result } = renderHook(() => useAutoScroll());

      const refSetter = result.current.createItemRef(0);

      expect(() => {
        act(() => {
          refSetter(null);
        });
      }).not.toThrow();
    });
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

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 0
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = {
        offsetTop: 50,
        offsetHeight: 20
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 0
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = {
        offsetTop: 150,
        offsetHeight: 20
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 0
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      // Item is fully visible (offsetTop: 10, height: 20, within container)
      const mockElement = {
        offsetTop: 10,
        offsetHeight: 20
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 0
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = {
        offsetTop: 150,
        offsetHeight: 20
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 0
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = {
        offsetTop: 150,
        offsetHeight: 20
      };

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

      const mockContainer = {
        scrollTo: jest.fn()
      };

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

      const mockContainer = {
        scrollTo: jest.fn()
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        scrollHeight: 500
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        scrollHeight: 500
      };

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

  describe('options', () => {
    it('respects enabled option', () => {
      const { result, rerender } = renderHook(
        ({ enabled }) => useAutoScroll({ enabled, delay: 100 }),
        { initialProps: { enabled: true } }
      );

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 0
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = {
        offsetTop: 150,
        offsetHeight: 20
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 0
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = {
        offsetTop: 150,
        offsetHeight: 20
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 0
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      const mockElement = {
        offsetTop: 150,
        offsetHeight: 20
      };

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

      const mockContainer = {
        scrollTo: jest.fn(),
        clientHeight: 100,
        scrollTop: 50
      };

      // @ts-ignore - mocking container
      result.current.containerRef.current = mockContainer;

      // Item above visible area
      const mockElement = {
        offsetTop: 5,
        offsetHeight: 10
      };

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
