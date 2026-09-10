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

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            const mockElement = createMockElement({
                offsetTop: 50,
                offsetHeight: 20,
            });

            const refSetter = result.current.createItemRef(0);
            act(() => {
                // @ts-expect-error - mocking element
                refSetter(mockElement);
            });

            result.current.scrollToItem(0);

            act(() => {
                jest.runAllTimers();
            });

            expect(mockContainer.scrollTo).not.toHaveBeenCalled();
        });

        it('scrolls when enabled', () => {
            const { result } = renderHook(() => useAutoScroll({ enabled: true, delay: 100 }));

            const mockContainer = createMockContainer();

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            const mockElement = createMockElement();

            const refSetter = result.current.createItemRef(0);
            act(() => {
                // @ts-expect-error - mocking element
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

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            // Item is fully visible (offsetTop: 10, height: 20, within container)
            const mockElement = createMockElement({
                offsetTop: 10,
                offsetHeight: 20,
            });

            const refSetter = result.current.createItemRef(0);
            act(() => {
                // @ts-expect-error - mocking element
                refSetter(mockElement);
            });

            result.current.scrollToItem(0);

            act(() => {
                jest.advanceTimersByTime(100);
            });

            expect(mockContainer.scrollTo).not.toHaveBeenCalled();
        });

        it('uses specified scroll behavior', () => {
            const { result } = renderHook(() => useAutoScroll({ behavior: 'smooth', delay: 100 }));

            const mockContainer = createMockContainer();

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            const mockElement = createMockElement();

            const refSetter = result.current.createItemRef(0);
            act(() => {
                // @ts-expect-error - mocking element
                refSetter(mockElement);
            });

            result.current.scrollToItem(0);

            act(() => {
                jest.advanceTimersByTime(100);
            });

            expect(mockContainer.scrollTo).toHaveBeenCalledWith({
                top: expect.any(Number),
                behavior: 'smooth',
            });
        });

        it('applies padding to scroll position', () => {
            const { result } = renderHook(() => useAutoScroll({ padding: 20, delay: 100 }));

            const mockContainer = createMockContainer();

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            const mockElement = createMockElement();

            const refSetter = result.current.createItemRef(0);
            act(() => {
                // @ts-expect-error - mocking element
                refSetter(mockElement);
            });

            result.current.scrollToItem(0);

            act(() => {
                jest.advanceTimersByTime(100);
            });

            // Should include padding in scroll calculation
            expect(mockContainer.scrollTo).toHaveBeenCalledWith({
                top: 90, // 150 + 20 - 100 + 20 (padding)
                behavior: 'smooth',
            });
        });
    });

    /**
     * The scroll decision, driven from both sides of each edge.
     *
     * `scrollToItem` has exactly two branches — below the fold, above the fold — and
     * an item that is already visible falls through both. These drive the boundary of
     * each comparison and assert the resulting scroll TARGET, not merely that a scroll
     * happened, so an off-by-one in either comparison changes the assertion.
     */
    describe('visibility decisions', () => {
        const scrollFor = (
            container: ReturnType<typeof createMockContainer>,
            item: ReturnType<typeof createMockElement>,
            options: Parameters<typeof useAutoScroll>[0] = { delay: 100 }
        ) => {
            const { result } = renderHook(() => useAutoScroll(options));

            // @ts-expect-error - mocking container
            result.current.containerRef.current = container;

            const refSetter = result.current.createItemRef(0);
            act(() => {
                // @ts-expect-error - mocking element
                refSetter(item);
            });

            result.current.scrollToItem(0);
            act(() => {
                jest.advanceTimersByTime(100);
            });
        };

        it('does not scroll an item whose bottom sits exactly on the fold', () => {
            const container = createMockContainer({ clientHeight: 100, scrollTop: 0 });

            scrollFor(container, createMockElement({ offsetTop: 80, offsetHeight: 20 }));

            expect(container.scrollTo).not.toHaveBeenCalled();
        });

        it('scrolls down only as far as the overflow plus padding', () => {
            const container = createMockContainer({ clientHeight: 100, scrollTop: 0 });

            scrollFor(container, createMockElement({ offsetTop: 95, offsetHeight: 20 }));

            // 95 + 20 - 100 + 10 (default padding)
            expect(container.scrollTo).toHaveBeenCalledWith({ top: 25, behavior: 'smooth' });
        });

        it('scrolls up to the item less padding when it is above the visible area', () => {
            const container = createMockContainer({ clientHeight: 100, scrollTop: 50 });

            scrollFor(container, createMockElement({ offsetTop: 30, offsetHeight: 10 }));

            // 30 - 10 (default padding) — NOT the below-the-fold calculation
            expect(container.scrollTo).toHaveBeenCalledWith({ top: 20, behavior: 'smooth' });
        });

        it('does not scroll an item whose top sits exactly at the scroll position', () => {
            const container = createMockContainer({ clientHeight: 100, scrollTop: 50 });

            scrollFor(container, createMockElement({ offsetTop: 50, offsetHeight: 10 }));

            expect(container.scrollTo).not.toHaveBeenCalled();
        });

        it('abandons the scroll when the item ref is cleared before the delay elapses', () => {
            const container = createMockContainer({ clientHeight: 100, scrollTop: 0 });
            const { result } = renderHook(() => useAutoScroll({ delay: 100 }));

            // @ts-expect-error - mocking container
            result.current.containerRef.current = container;

            const refSetter = result.current.createItemRef(0);
            act(() => {
                // @ts-expect-error - mocking element
                refSetter(createMockElement());
            });

            result.current.scrollToItem(0);

            // The item unmounts while the scroll is still pending.
            act(() => {
                refSetter(null);
            });

            expect(() => {
                act(() => {
                    jest.advanceTimersByTime(100);
                });
            }).not.toThrow();
            expect(container.scrollTo).not.toHaveBeenCalled();
        });

        it('abandons the scroll when the container ref is cleared before the delay elapses', () => {
            const container = createMockContainer({ clientHeight: 100, scrollTop: 0 });
            const { result } = renderHook(() => useAutoScroll({ delay: 100 }));

            // @ts-expect-error - mocking container
            result.current.containerRef.current = container;

            const refSetter = result.current.createItemRef(0);
            act(() => {
                // @ts-expect-error - mocking element
                refSetter(createMockElement());
            });

            result.current.scrollToItem(0);

            act(() => {
                // @ts-expect-error - detaching the container
                result.current.containerRef.current = null;
            });

            expect(() => {
                act(() => {
                    jest.advanceTimersByTime(100);
                });
            }).not.toThrow();
            expect(container.scrollTo).not.toHaveBeenCalled();
        });
    });

    describe('scrollToTop', () => {
        it('scrolls container to top', () => {
            const { result } = renderHook(() => useAutoScroll());

            const mockContainer = createMockContainer();

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            result.current.scrollToTop();

            expect(mockContainer.scrollTo).toHaveBeenCalledWith({
                top: 0,
                behavior: 'smooth',
            });
        });

        it('uses specified behavior', () => {
            const { result } = renderHook(() => useAutoScroll({ behavior: 'auto' }));

            const mockContainer = createMockContainer();

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            result.current.scrollToTop();

            expect(mockContainer.scrollTo).toHaveBeenCalledWith({
                top: 0,
                behavior: 'auto',
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

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            result.current.scrollToBottom();

            expect(mockContainer.scrollTo).toHaveBeenCalledWith({
                top: 500,
                behavior: 'smooth',
            });
        });

        it('uses specified behavior', () => {
            const { result } = renderHook(() => useAutoScroll({ behavior: 'auto' }));

            const mockContainer = createMockContainer();

            // @ts-expect-error - mocking container
            result.current.containerRef.current = mockContainer;

            result.current.scrollToBottom();

            expect(mockContainer.scrollTo).toHaveBeenCalledWith({
                top: 500,
                behavior: 'auto',
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
