import { useLayoutEffect, useRef, RefObject } from 'react';

interface UseFocusTrapOptions {
  /** Enable/disable the focus trap */
  enabled?: boolean;
  /** Focus the first element on mount */
  autoFocus?: boolean;
  /** Custom selector for focusable elements */
  focusableSelector?: string;
  /** Enable focus containment (prevents focus escape) */
  containFocus?: boolean;
}

const DEFAULT_FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([tabindex="-1"]), ' +
  'input:not([disabled]):not([tabindex="-1"]), ' +
  'select:not([disabled]):not([tabindex="-1"]), ' +
  'textarea:not([disabled]):not([tabindex="-1"]), ' +
  '[tabindex]:not([tabindex="-1"])';

/**
 * Hook for trapping keyboard focus within a container
 *
 * Prevents Tab navigation from escaping the container and redirects
 * Tab presses from outside the container to enter it.
 * Useful for modals, wizards, and dashboard components.
 *
 * **Improvements in v2**:
 * - Uses useLayoutEffect instead of polling (synchronous with React rendering)
 * - Adds focus containment to prevent escape
 * - Caches focusable elements for better performance
 * - Adds development warnings for debugging
 *
 * **Improvements in v3**:
 * - Handles Tab from outside container (redirects to first/last element)
 * - Uses global keydown listener to catch Tab from anywhere
 * - Ensures keyboard navigation always enters webview
 *
 * @param options - Configuration options
 * @returns Ref to attach to the container element
 *
 * @example
 * ```tsx
 * const containerRef = useFocusTrap({
 *   enabled: isOpen,
 *   autoFocus: true,
 *   containFocus: true
 * });
 *
 * return (
 *   <div ref={containerRef}>
 *     <button>First</button>
 *     <button>Second</button>
 *     <button>Last</button>
 *   </div>
 * );
 * ```
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {}
): RefObject<T> {
  const {
    enabled = true,
    autoFocus = false,
    focusableSelector = DEFAULT_FOCUSABLE_SELECTOR,
    containFocus = true
  } = options;

  const containerRef = useRef<T>(null);
  const focusableElementsCacheRef = useRef<HTMLElement[]>([]);
  const observerRef = useRef<MutationObserver | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    // Get all focusable elements
    const getFocusableElements = (): HTMLElement[] => {
      const elements = container.querySelectorAll(focusableSelector);
      return Array.from(elements) as HTMLElement[];
    };

    // Update cache
    const updateCache = () => {
      focusableElementsCacheRef.current = getFocusableElements();

      // Development warning
      if (process.env.NODE_ENV === 'development' && focusableElementsCacheRef.current.length === 0) {
        console.warn('[useFocusTrap] No focusable elements found in container');
      }
    };

    // Initial cache update
    updateCache();

    // Auto-focus first element if requested
    if (autoFocus && focusableElementsCacheRef.current.length > 0) {
      focusableElementsCacheRef.current[0].focus();
    }

    // Observe DOM changes to invalidate cache
    observerRef.current = new MutationObserver(() => {
      updateCache();
    });

    observerRef.current.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'tabindex']
    });

    // Handle Tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = focusableElementsCacheRef.current;
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement;

      // If focus is outside container, redirect Tab to first/last element
      if (!container.contains(activeElement)) {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Tab from outside: go to last element
          lastElement.focus();
        } else {
          // Tab from outside: go to first element
          firstElement.focus();
        }
        return;
      }

      // Focus is inside container: wrap at boundaries
      // Shift+Tab on first element: go to last
      if (e.shiftKey && activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
      // Tab on last element: go to first
      else if (!e.shiftKey && activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    // Focus containment: prevent focus from escaping
    const handleFocusIn = (e: FocusEvent) => {
      if (!containFocus) return;

      const target = e.target as Node;
      const focusableElements = focusableElementsCacheRef.current;

      // If focus moved outside container, bring it back
      if (!container.contains(target) && focusableElements.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        focusableElements[0].focus();
      }
    };

    // Use global listener for Tab to catch presses from outside container
    document.addEventListener('keydown', handleKeyDown, true);

    // Use global listener for focus containment (capture phase)
    if (containFocus) {
      document.addEventListener('focusin', handleFocusIn, true);
    }

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);

      if (containFocus) {
        document.removeEventListener('focusin', handleFocusIn, true);
      }

      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      focusableElementsCacheRef.current = [];
    };
  }, [enabled, autoFocus, focusableSelector, containFocus]);

  return containerRef as RefObject<T>;
}
