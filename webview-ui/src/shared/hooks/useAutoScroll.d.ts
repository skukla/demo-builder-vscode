import { RefObject } from 'react';
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
export declare function useAutoScroll<C extends HTMLElement = HTMLDivElement, I extends HTMLElement = HTMLDivElement>(options?: UseAutoScrollOptions): UseAutoScrollReturn<C, I>;
export {};
//# sourceMappingURL=useAutoScroll.d.ts.map