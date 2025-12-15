import { useEffect } from 'react';

/**
 * Hook that updates the wizard's canProceed state based on a validation value.
 *
 * Extracts the common pattern of:
 * ```tsx
 * useEffect(() => {
 *   setCanProceed(!!value);
 * }, [value, setCanProceed]);
 * ```
 *
 * @param value - The value to check for truthiness (typically a selection ID)
 * @param setCanProceed - The setter function for canProceed state
 * @param validator - Optional custom validator function (default: truthy check)
 *
 * @example
 * ```tsx
 * // Simple truthy check
 * useCanProceed(state.adobeProject?.id, setCanProceed);
 *
 * // Custom validation
 * useCanProceed(
 *   state.components,
 *   setCanProceed,
 *   (components) => !!components?.frontend
 * );
 * ```
 */
export function useCanProceed<T>(
    value: T,
    setCanProceed: (canProceed: boolean) => void,
    validator?: (value: T) => boolean,
): void {
    useEffect(() => {
        const canProceed = validator ? validator(value) : Boolean(value);
        setCanProceed(canProceed);
    }, [value, setCanProceed, validator]);
}

/**
 * Hook that updates canProceed based on multiple conditions.
 *
 * All conditions must be truthy for canProceed to be true.
 *
 * @param conditions - Array of values that must all be truthy
 * @param setCanProceed - The setter function for canProceed state
 *
 * @example
 * ```tsx
 * useCanProceedAll(
 *   [state.adobeProject?.id, state.adobeWorkspace?.id],
 *   setCanProceed
 * );
 * ```
 */
export function useCanProceedAll(
    conditions: unknown[],
    setCanProceed: (canProceed: boolean) => void,
): void {
    useEffect(() => {
        const canProceed = conditions.every(Boolean);
        setCanProceed(canProceed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...conditions, setCanProceed]);
}
