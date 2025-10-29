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
export declare function useSelectableDefault(): {
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
};
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
export declare function useSelectableDefaultWhen(currentValue: string, defaultValue: string): {
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
};
//# sourceMappingURL=useSelectableDefault.d.ts.map