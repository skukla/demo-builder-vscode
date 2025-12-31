import { useEffect, RefObject } from 'react';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

interface UseFocusOnMountOptions {
    /**
     * CSS selector to find the element to focus within the ref.
     * If not provided, focuses the ref element directly.
     */
    selector?: string;
    /**
     * Fallback timeout in milliseconds for slow-rendering components.
     * @default TIMEOUTS.FOCUS_FALLBACK (1000ms)
     */
    delay?: number;
    /**
     * Disable focus management.
     * Useful when conditionally enabling focus based on step state.
     */
    disabled?: boolean;
}

/**
 * Hook for managing focus on mount for React components.
 *
 * Uses a simple 3-tier strategy:
 * 1. **Immediate**: Try to focus synchronously (for already-rendered content)
 * 2. **RAF**: Try after next animation frame (for async Spectrum components)
 * 3. **Timeout**: Fallback for slow-rendering scenarios
 *
 * This approach is simpler and more reliable than MutationObserver-based
 * solutions, which add overhead and can be unreliable with React's
 * rendering cycle.
 *
 * @param ref - React ref to the container element
 * @param options - Configuration options
 *
 * @example
 * ```tsx
 * // Focus a button inside a container
 * const containerRef = useRef<HTMLDivElement>(null);
 * useFocusOnMount(containerRef, { selector: 'button' });
 *
 * return (
 *   <div ref={containerRef}>
 *     <Picker placeholder="Select option">...</Picker>
 *   </div>
 * );
 * ```
 *
 * @example
 * ```tsx
 * // Focus the element directly
 * const inputRef = useRef<HTMLInputElement>(null);
 * useFocusOnMount(inputRef);
 *
 * return <input ref={inputRef} type="text" />;
 * ```
 *
 * @example
 * ```tsx
 * // Conditionally enable focus
 * useFocusOnMount(containerRef, {
 *   selector: 'button',
 *   disabled: !isActiveStep
 * });
 * ```
 */
export function useFocusOnMount(
    ref: RefObject<HTMLElement | null>,
    options: UseFocusOnMountOptions = {},
): void {
    const {
        selector,
        delay = TIMEOUTS.UI.FOCUS_FALLBACK,
        disabled = false,
    } = options;

    useEffect(() => {
        if (disabled) return;

        const focusElement = (): boolean => {
            const container = ref.current;
            if (!container) return false;

            // Find target element (either via selector or the container itself)
            const target = selector
                ? container.querySelector(selector)
                : container;

            if (target instanceof HTMLElement) {
                target.focus();
                return true;
            }

            return false;
        };

        // Tier 1: Try immediate focus (for synchronously rendered content)
        if (focusElement()) return;

        // Tier 2: Try after next animation frame (for async Spectrum components)
        const frameId = requestAnimationFrame(() => {
            if (focusElement()) return;
        });

        // Tier 3: Fallback timeout for slow rendering
        const timerId = setTimeout(focusElement, delay);

        // Cleanup
        return () => {
            cancelAnimationFrame(frameId);
            clearTimeout(timerId);
        };
    }, [ref, selector, delay, disabled]);
}
