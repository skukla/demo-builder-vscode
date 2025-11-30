/**
 * Utility for managing CSS class names in React Spectrum components
 * This provides a cleaner alternative to inline UNSAFE_style props
 */

/**
 * Combines multiple class names into a single string, filtering out falsy values
 * Similar to popular libraries like clsx or classnames
 *
 * @example
 * cn('text-sm', isError && 'text-red-600', 'mb-2')
 * // Returns: "text-sm text-red-600 mb-2" (if isError is true)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}