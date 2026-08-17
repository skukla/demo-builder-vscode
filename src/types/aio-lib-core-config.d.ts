/**
 * Minimal typings for `@adobe/aio-lib-core-config`.
 *
 * The package ships a `types.d.ts` but does NOT reference it from `package.json`
 * (`types` is absent), and what it declares is the module's internal helpers
 * rather than its public surface — so TypeScript sees no shape at all. Declared
 * here instead of reaching for `any` at the call site.
 *
 * Only `get` is declared, because only `get` is used. This is a read of the
 * `aio` CLI's own config store; nothing in this extension writes it, and adding
 * `set` here would make it look like we might.
 *
 * Verified against 5.0.1 (2026-08-17): `get` is a function, `get(<absent key>)`
 * returns undefined, and `get('ims.contexts.cli.access_token')` returns
 * `{ token, expiry }`. Its exports are non-enumerable — `Object.keys()` on the
 * module gives `[]` — so do not try to introspect it at runtime.
 */
declare module '@adobe/aio-lib-core-config' {
    /** Read a dotted key from the merged aio config. Undefined when absent. */
    export function get(key?: string): unknown;
}
