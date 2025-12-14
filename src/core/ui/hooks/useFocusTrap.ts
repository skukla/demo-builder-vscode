import { useLayoutEffect, useRef, RefObject } from 'react';
import { webviewLogger } from '../utils/webviewLogger';

const log = webviewLogger('useFocusTrap');

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

/**
 * Enhanced focusable selector that includes native HTML elements and ARIA roles
 * for custom components like Adobe Spectrum.
 *
 * This selector is used by both useFocusTrap and components that need to
 * find focusable elements (e.g., auto-focus on step navigation).
 */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([tabindex="-1"]), ' +
  'input:not([disabled]):not([tabindex="-1"]), ' +
  'select:not([disabled]):not([tabindex="-1"]), ' +
  'textarea:not([disabled]):not([tabindex="-1"]), ' +
  '[role="button"]:not([aria-disabled="true"]):not([tabindex="-1"]), ' +
  '[role="combobox"]:not([aria-disabled="true"]):not([tabindex="-1"]), ' +
  '[role="textbox"]:not([aria-disabled="true"]):not([tabindex="-1"]), ' +
  '[tabindex="0"]';

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
    focusableSelector = FOCUSABLE_SELECTOR,
    containFocus = true
  } = options;

  const containerRef = useRef<T>(null);
  const focusableElementsCacheRef = useRef<HTMLElement[]>([]);
  const observerRef = useRef<MutationObserver | null>(null);
  // Track if we've successfully auto-focused (to handle async component rendering)
  const hasAutoFocusedRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    // Reset auto-focus tracking when effect re-runs
    hasAutoFocusedRef.current = false;

    // Get all focusable elements
    const getFocusableElements = (): HTMLElement[] => {
      const elements = container.querySelectorAll(focusableSelector);
      return Array.from(elements) as HTMLElement[];
    };

    // Attempt to auto-focus first element
    const tryAutoFocus = () => {
      if (!autoFocus || hasAutoFocusedRef.current) return;

      const elements = focusableElementsCacheRef.current;
      if (elements.length > 0) {
        elements[0].focus();
        hasAutoFocusedRef.current = true;
      }
    };

    // Update cache
    const updateCache = () => {
      const prevLength = focusableElementsCacheRef.current.length;
      focusableElementsCacheRef.current = getFocusableElements();

      // Development warning (webviewLogger already handles dev-only logging)
      if (focusableElementsCacheRef.current.length === 0) {
        log.warn('No focusable elements found in container');
      }

      // If autoFocus is enabled and we haven't focused yet,
      // try again when elements become available (handles async Spectrum rendering)
      if (prevLength === 0 && focusableElementsCacheRef.current.length > 0) {
        tryAutoFocus();
      }
    };

    // Initial cache update
    updateCache();

    // Initial auto-focus attempt
    tryAutoFocus();

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
