/**
 * CSS Module Type Declarations
 *
 * This ambient module declaration enables TypeScript to understand CSS Module
 * imports (*.module.css files) without compilation errors.
 *
 * CSS Modules export an object mapping class names (strings) to their
 * generated/scoped class name strings.
 *
 * Import pattern:
 * ```typescript
 * import styles from './Component.module.css';
 * <div className={styles.container} />
 * ```
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
