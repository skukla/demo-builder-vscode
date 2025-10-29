"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAutoScroll = useAutoScroll;
const react_1 = require("react");
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
function useAutoScroll(options = {}) {
    const { enabled = true, behavior = 'smooth', delay = 100, padding = 10 } = options;
    const containerRef = (0, react_1.useRef)(null);
    const itemRefs = (0, react_1.useRef)([]);
    // Create a ref setter for a specific index
    const createItemRef = (index) => (el) => {
        itemRefs.current[index] = el;
    };
    // Scroll to a specific item if it's not fully visible
    const scrollToItem = (index) => {
        if (!enabled || !containerRef.current || !itemRefs.current[index]) {
            return;
        }
        // Use setTimeout to ensure DOM is updated before scrolling
        setTimeout(() => {
            const container = containerRef.current;
            const item = itemRefs.current[index];
            if (!container || !item)
                return;
            // Calculate position relative to container
            const itemTop = item.offsetTop;
            const itemHeight = item.offsetHeight;
            const containerHeight = container.clientHeight;
            const containerScrollTop = container.scrollTop;
            // Check if item is already visible
            const isVisible = itemTop >= containerScrollTop &&
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
        containerRef: containerRef,
        createItemRef,
        scrollToItem,
        scrollToTop,
        scrollToBottom
    };
}
//# sourceMappingURL=useAutoScroll.js.map