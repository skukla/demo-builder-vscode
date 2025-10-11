import { useCallback } from 'react';

/**
 * Hook to make text fields with default values easily replaceable.
 * 
 * When a field has a sensible default value, this hook ensures that
 * when the user focuses the field, all text is automatically selected.
 * This allows the user to immediately start typing to replace the
 * default without needing to manually select/delete first.
 * 
 * @example
 * ```tsx
 * const selectableProps = useSelectableDefault();
 * 
 * <TextField
 *   value={value}
 *   onChange={setValue}
 *   {...selectableProps}
 * />
 * ```
 */
export function useSelectableDefault() {
    const handleFocus = useCallback((event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        // Select all text when field is focused
        // This allows user to immediately type to replace the default value
        event.target.select();
    }, []);

    return {
        onFocus: handleFocus
    };
}

/**
 * Hook variant that only selects text if the field contains a default value
 * (doesn't select if user has already modified it)
 * 
 * @param currentValue - The current value of the field
 * @param defaultValue - The default value to compare against
 * 
 * @example
 * ```tsx
 * const selectableProps = useSelectableDefaultWhen(value, 'https://example.com');
 * 
 * <TextField
 *   value={value}
 *   onChange={setValue}
 *   {...selectableProps}
 * />
 * ```
 */
export function useSelectableDefaultWhen(currentValue: string, defaultValue: string) {
    const handleFocus = useCallback((event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        // Only select if the current value matches the default
        if (currentValue === defaultValue) {
            event.target.select();
        }
    }, [currentValue, defaultValue]);

    return {
        onFocus: handleFocus
    };
}
