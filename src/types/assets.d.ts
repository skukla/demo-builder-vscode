/**
 * TypeScript module declarations for asset file imports.
 *
 * These allow TypeScript to accept .md and .md.template imports
 * (inlined as strings at build time by esbuild's text loader).
 * In Jest, the mdTransformer provides the same string behavior.
 */

declare module '*.md' {
    const content: string;
    export default content;
}

declare module '*.md.template' {
    const content: string;
    export default content;
}
