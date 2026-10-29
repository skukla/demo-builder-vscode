/**
 * Stands in for the `vscode` module when the canary update runs outside VS Code
 * (`npm run build:canary-update` aliases `vscode` to this file).
 *
 * The update path needs nothing from VS Code at run time (checked 2026-10-17: the
 * bundle loads, and its imports of `vscode` are types or unreached defaults). If a
 * change ever makes it reach for VS Code, this fails at that line, by name, rather
 * than with an undefined somewhere later.
 *
 * @module features/updates/canary/vscodeAbsent
 */

const absent: unknown = new Proxy(
    {},
    {
        get(_target, key) {
            // The bundler's own module bookkeeping, not a use of VS Code.
            if (key === '__esModule' || key === 'default' || typeof key === 'symbol') return undefined;
            throw new Error(`The canary update reached for vscode.${String(key)}, which does not exist outside VS Code.`);
        },
    },
);

export = absent;
