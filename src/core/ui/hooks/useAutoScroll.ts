import { useRef, useEffect, RefObject } from 'react';

interface UseAutoScrollOptions {
  /** Enable/disable auto-scroll */
  enabled?: boolean;
  /** Scroll behavior ('auto' | 'smooth') */
  behavior?: ScrollBehavior;
  /** Delay before scrolling (ms) */
  delay?: number;
  /** Padding from container edges (px) */
  padding?: number;
}

interface UseAutoScrollReturn<C extends HTMLElement = HTMLDivElement, I extends HTMLElement = HTMLDivElement> {
  /** Ref to attach to the scrollable container */
  containerRef: RefObject<C>;
  /** Function to create refs for individual items */
  createItemRef: (index: number) => (el: I | null) => void;
  /** Manually scroll to a specific item */
  scrollToItem: (index: number) => void;
  /** Scroll to top of container */
  scrollToTop: () => void;
  /** Scroll to bottom of container */
  scrollToBottom: () => void;
}

/**
 * Hook for managing auto-scroll behavior in a container with multiple items
 *
 * Automatically scrolls to keep items visible as they are updated.
 * Extracted from PrerequisitesStep's auto-scroll logic.
 *
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * const { containerRef, createItemRef, scrollToItem } = useAutoScroll({
 *   enabled: isChecking,
 *   behavior: 'smooth',
 *   padding: 10
 * });
 *
 * return (
 *   <div ref={containerRef} style={{ maxHeight: '400px', overflowY: 'auto' }}>
 *     {items.map((item, index) => (
 *       <div key={item.id} ref={createItemRef(index)}>
 *         {item.content}
 *       </div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useAutoScroll<
  C extends HTMLElement = HTMLDivElement,
  I extends HTMLElement = HTMLDivElement
>(
  options: UseAutoScrollOptions = {}
): UseAutoScrollReturn<C, I> {
  const {
    enabled = true,
    behavior = 'smooth',
    delay = 100,
    padding = 10
  } = options;

  const containerRef = useRef<C>(null);
  const itemRefs = useRef<(I | null)[]>([]);

  // Create a ref setter for a specific index
  const createItemRef = (index: number) => (el: I | null) => {
    itemRefs.current[index] = el;
  };

  // Scroll to a specific item if it's not fully visible
  const scrollToItem = (index: number) => {
    if (!enabled || !containerRef.current || !itemRefs.current[index]) {
      return;
    }

    // Use setTimeout to ensure DOM is updated before scrolling
    setTimeout(() => {
      const container = containerRef.current;
      const item = itemRefs.current[index];

      if (!container || !item) return;

      // Calculate position relative to container
      const itemTop = item.offsetTop;
      const itemHeight = item.offsetHeight;
      const containerHeight = container.clientHeight;
      const containerScrollTop = container.scrollTop;

      // Check if item is already visible
      const isVisible =
        itemTop >= containerScrollTop &&
        itemTop + itemHeight <= containerScrollTop + containerHeight;

      // Only scroll if not already visible
      if (!isVisible) {
        // If item is below visible area, scroll just enough to show it at bottom
        if (itemTop + itemHeight > containerScrollTop + containerHeight) {
          const scrollTo = itemTop + itemHeight - containerHeight + padding;
          container.scrollTo({
            top: Math.max(0, scrollTo),
            behavior
          });
        }
        // If item is above visible area, scroll to show it at top
        else if (itemTop < containerScrollTop) {
          container.scrollTo({
            top: Math.max(0, itemTop - padding),
            behavior
          });
        }
      }
    }, delay);
  };

  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior
      });
    }
  };

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior
      });
    }
  };

  return {
    containerRef: containerRef as RefObject<C>,
    createItemRef,
    scrollToItem,
    scrollToTop,
    scrollToBottom
  };
}
