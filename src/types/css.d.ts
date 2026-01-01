/**
 * CSS Module Type Declarations
 *
 * This ambient module declaration enables TypeScript to understand CSS Module
 * imports (*.module.css files) without compilation errors.
 *
 * CSS Modules export an object mapping class names (strings) to their
 * generated/scoped class name strings. The readonly modifier ensures
 * TypeScript enforces immutability of these class name mappings.
 *
 * Usage:
 * ```typescript
 * import styles from './Component.module.css';
 * // styles.className is typed as string
 * ```
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
