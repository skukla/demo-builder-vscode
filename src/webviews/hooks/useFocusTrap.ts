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

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;

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

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, autoFocus, focusableSelector]);

  return containerRef as RefObject<T>;
}
