import { renderHook, act } from '@testing-library/react';
import { useAutoScroll } from '@/core/ui/hooks/useAutoScroll';

describe('useAutoScroll - Initialization and Refs', () => {
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
});
