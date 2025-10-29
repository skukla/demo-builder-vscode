import { RefObject } from 'react';
interface UseFocusTrapOptions {
    /** Enable/disable the focus trap */
    enabled?: boolean;
    /** Focus the first element on mount */
    autoFocus?: boolean;
    /** Custom selector for focusable elements */
    focusableSelector?: string;
}
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
export declare function useFocusTrap<T extends HTMLElement = HTMLDivElement>(options?: UseFocusTrapOptions): RefObject<T>;
export {};
//# sourceMappingURL=useFocusTrap.d.ts.map