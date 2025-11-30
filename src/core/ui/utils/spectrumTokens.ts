/**
 * Adobe Spectrum Design Token Translation Utility
 *
 * Converts Adobe Spectrum design tokens (e.g., "size-300") into pixel values
 * for use in custom layout components. Provides type-safe token usage while
 * maintaining backward compatibility with numeric and pixel string values.
 *
 * Token Scale: 1 unit = 8px (Adobe Spectrum's base unit)
 *
 * @see https://spectrum.adobe.com/page/design-tokens/
 */

/**
 * Valid Spectrum size token strings
 *
 * Only includes tokens actually used in this codebase (YAGNI principle).
 * Based on codebase analysis, 13 tokens are currently in use.
 */
export type SpectrumSizeToken =
  | 'size-50'    // 4px  - Extra small spacing
  | 'size-100'   // 8px  - Small spacing
  | 'size-115'   // 9.2px - Rare, used in specific components
  | 'size-130'   // 10.4px - Rare, used in specific components
  | 'size-150'   // 12px - Medium-small spacing
  | 'size-160'   // 12.8px - Rare, used in specific components
  | 'size-200'   // 16px - Medium spacing
  | 'size-300'   // 24px - Large spacing (common for gaps)
  | 'size-400'   // 32px - Extra large spacing
  | 'size-500'   // 40px - Section spacing
  | 'size-600'   // 48px - Large section spacing
  | 'size-1000'  // 80px - Very large spacing
  | 'size-6000'; // 480px - Maximum width constraints

/**
 * Dimension value type accepting Spectrum tokens, pixel strings, or numbers
 *
 * Use this type for layout component props to enable:
 * - Type-safe token usage: gap="size-300" (compile-time validated)
 * - Backward compatibility: gap={24} or gap="24px"
 */
export type DimensionValue = SpectrumSizeToken | `${number}px` | number;

/**
 * Token-to-pixel mapping based on Adobe Spectrum Design System
 *
 * Maps each token to its corresponding pixel value.
 * Only includes the 13 tokens actually used in this codebase.
 */
const SPECTRUM_TOKEN_MAP: Record<SpectrumSizeToken, string> = {
  'size-50': '4px',
  'size-100': '8px',
  'size-115': '9.2px',
  'size-130': '10.4px',
  'size-150': '12px',
  'size-160': '12.8px',
  'size-200': '16px',
  'size-300': '24px',
  'size-400': '32px',
  'size-500': '40px',
  'size-600': '48px',
  'size-1000': '80px',
  'size-6000': '480px'
};

/**
 * Translates Spectrum design tokens to CSS pixel values
 *
 * Converts Spectrum size tokens (e.g., "size-300") to pixel strings ("24px")
 * while maintaining backward compatibility with existing numeric and pixel
 * string values.
 *
 * @param value - Spectrum token, pixel string, number, or undefined
 * @returns CSS pixel value string or undefined
 *
 * @example
 * // Spectrum tokens
 * translateSpectrumToken('size-300')  // '24px'
 * translateSpectrumToken('size-100')  // '8px'
 *
 * @example
 * // Numeric values (backward compatibility)
 * translateSpectrumToken(24)          // '24px'
 * translateSpectrumToken(16.5)        // '16.5px'
 *
 * @example
 * // Pixel strings (pass-through)
 * translateSpectrumToken('24px')      // '24px'
 * translateSpectrumToken('100px')     // '100px'
 *
 * @example
 * // Edge cases
 * translateSpectrumToken(undefined)   // undefined
 * translateSpectrumToken('invalid')   // 'invalid' (graceful degradation)
 */
export function translateSpectrumToken(
  value: DimensionValue | undefined
): string | undefined {
  // Handle undefined (preserves optional prop behavior)
  if (value === undefined) {
    return undefined;
  }

  // Handle numbers (convert to px string for CSS)
  if (typeof value === 'number') {
    return `${value}px`;
  }

  // Handle strings (tokens or px strings)
  if (typeof value === 'string') {
    // If it's a Spectrum token, translate it
    if (value in SPECTRUM_TOKEN_MAP) {
      return SPECTRUM_TOKEN_MAP[value as SpectrumSizeToken];
    }

    // Otherwise, pass through unchanged (px strings, invalid tokens)
    // This provides graceful degradation for invalid tokens
    return value;
  }

  return undefined;
}
