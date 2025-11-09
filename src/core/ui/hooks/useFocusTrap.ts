import { useEffect, useRef, RefObject } from 'react';

interface UseFocusTrapOptions {
  /** Enable/disable the focus trap */
  enabled?: boolean;
  /** Focus the first element on mount */
  autoFocus?: boolean;
  /** Custom selector for focusable elements */
  focusableSelector?: string;
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
 * Prevents Tab navigation from escaping the container.
 * Useful for modals, wizards, and dashboard components.
 * Extracted from WizardContainer and project-dashboard.
 *
 * **Note**: This hook uses a polling approach to detect when the ref is attached.
 * In tests, you should manually trigger the effect by setting the ref and waiting
 * for the next event loop iteration.
 *
 * @param options - Configuration options
 * @returns Ref to attach to the container element
 *
 * @example
 * ```tsx
 * const containerRef = useFocusTrap({
 *   enabled: isOpen,
 *   autoFocus: true
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
    focusableSelector = DEFAULT_FOCUSABLE_SELECTOR
  } = options;

  const containerRef = useRef<T>(null);
  const hasAttachedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Poll for ref attachment every 16ms (one animation frame)
    const intervalId = setInterval(() => {
      const container = containerRef.current;

      // Skip if ref not attached yet
      if (!container) return;

      // Skip if already attached
      if (hasAttachedRef.current) return;

      // Mark as attached
      hasAttachedRef.current = true;

      // Clear interval
      clearInterval(intervalId);

      // Get all focusable elements
      const getFocusableElements = (): HTMLElement[] => {
        const elements = container.querySelectorAll(focusableSelector);
        return Array.from(elements) as HTMLElement[];
      };

      // Auto-focus first element if requested
      if (autoFocus) {
        const focusableElements = getFocusableElements();
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        }
      }

      // Handle Tab key to trap focus
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement as HTMLElement;

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

      container.addEventListener('keydown', handleKeyDown);

      // Store cleanup function
      cleanupRef.current = () => {
        container.removeEventListener('keydown', handleKeyDown);
      };
    }, 16);

    return () => {
      clearInterval(intervalId);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      hasAttachedRef.current = false;
    };
  }, [enabled, autoFocus, focusableSelector]);

  return containerRef as RefObject<T>;
}
