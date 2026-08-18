/**
 * Minimal typings for `@adobe/aio-lib-core-config`.
 *
 * The package ships a `types.d.ts` but does NOT reference it from `package.json`
 * (`types` is absent), and what it declares is the module's internal helpers
 * rather than its public surface — so TypeScript sees no shape at all. Declared
 * here instead of reaching for `any` at the call site.
 *
 * Only `get` and `reload` are declared, because only those are used. This is a
 * read of the `aio` CLI's own config store; nothing in this extension writes it,
 * and adding `set` here would make it look like we might.
 *
 * Verified against 5.0.1 (2026-08-17): `get` is a function, `get(<absent key>)`
 * returns undefined, and `get('ims.contexts.cli.access_token')` returns
 * `{ token, expiry }`. Its exports are non-enumerable — `Object.keys()` on the
 * module gives `[]` — so do not try to introspect it at runtime.
 *
 * Also measured the same day: `get` parses the file once and serves every later
 * call from memory, so a write by another process (`aio login`) stays invisible
 * until `reload()`. Never read this store without reloading it first.
 */
declare module '@adobe/aio-lib-core-config' {
    /** Read a dotted key from the merged aio config. Undefined when absent. */
    export function get(key?: string): unknown;
    /** Re-read the config file(s) from disk, discarding the in-memory snapshot. */
    export function reload(): unknown;
}
