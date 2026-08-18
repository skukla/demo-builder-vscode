/**
 * Settings the user has set that the extension no longer reads.
 *
 * Renaming a contributed setting does NOT migrate the user's value — VS Code
 * simply stops reading the old key, and the new one falls back to its default.
 * When that default is non-empty the fallback is invisible: the code's
 * `if (value)` guard stays true, the feature keeps working against the WRONG
 * value, and it reports success every time.
 *
 * That is not hypothetical. `demoBuilder.daLive.AEMRepositoryId` became
 * `demoBuilder.daLive.aemAuthorUrl` in February 2026 (commit 062f09f7). The
 * author's own AEM environment stopped being applied that day; every site
 * created since was bound to the shipped default instead, and each run logged
 * `Applied: aem.repositoryId`. It surfaced six months later, through a
 * colleague's bug report and a hand-diff of settings.json.
 *
 * A rename is a one-line change. Detecting one costs this file. Diagnostics is
 * where someone already goes when the extension is doing something they cannot
 * explain, so the answer belongs there — and being derived rather than listed,
 * it needs no rename registry to keep up to date.
 *
 * @module commands/orphanedSettings
 */

/** Shape of `WorkspaceConfiguration.inspect`, narrowed to what matters here. */
export interface SettingInspection {
    defaultValue?: unknown;
    globalValue?: unknown;
    workspaceValue?: unknown;
    workspaceFolderValue?: unknown;
}

/** How deep a settings tree is walked before giving up (loop backstop). */
const MAX_DEPTH = 6;

/**
 * Keys the user has set but nothing contributes.
 *
 * @param contributed - Every key declared in package.json
 * @param userSet - Every key the user has an explicit value for
 * @returns The orphans, sorted so two reports diff cleanly
 */
export function orphanedKeys(
    contributed: readonly string[],
    userSet: readonly string[],
): string[] {
    const known = new Set(contributed);
    return userSet.filter((key) => !known.has(key)).sort();
}

/**
 * Every configuration key an extension manifest declares.
 *
 * `contributes.configuration` is either one object or an array of them; both
 * are valid and both appear in the wild. Returns nothing on any shape it does
 * not recognise — a diagnostic must never become the failure it explains.
 *
 * @param packageJSON - The extension manifest
 * @returns The contributed keys, or an empty array
 */
export function contributedKeysFrom(packageJSON: unknown): string[] {
    const contributes = (packageJSON as { contributes?: unknown } | undefined)?.contributes;
    const configuration = (contributes as { configuration?: unknown } | undefined)?.configuration;
    if (!configuration) {
        return [];
    }
    const sections = Array.isArray(configuration) ? configuration : [configuration];
    const keys: string[] = [];
    for (const section of sections) {
        const properties = (section as { properties?: unknown } | undefined)?.properties;
        if (properties && typeof properties === 'object') {
            keys.push(...Object.keys(properties as Record<string, unknown>));
        }
    }
    return keys;
}

/** True for a value we may descend into looking for nested settings. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when the user gave this key an explicit value at any scope. */
function isUserSet(inspection: SettingInspection | undefined): boolean {
    return (
        inspection?.globalValue !== undefined ||
        inspection?.workspaceValue !== undefined ||
        inspection?.workspaceFolderValue !== undefined
    );
}

/**
 * Walk a resolved configuration section and collect the keys the user has set.
 *
 * A node is a SETTING when `inspect` recognises it, and only then — an
 * object-valued setting (`blockLibraries.defaults`) must not be descended into,
 * or the walk invents keys like `…defaults.foo` that no schema ever declared.
 * Anything `inspect` does not recognise is treated as a container and walked.
 *
 * Pure: the VS Code objects are passed in, so the whole rule is testable
 * without the editor.
 *
 * @param tree - The resolved section, e.g. `getConfiguration('demoBuilder')`
 * @param section - Dotted prefix that tree's keys hang off
 * @param inspect - Resolves a full dotted key to its inspection
 * @returns Full dotted keys the user has set, in walk order
 */
export function collectUserSetKeys(
    tree: Record<string, unknown>,
    section: string,
    inspect: (key: string) => SettingInspection | undefined,
): string[] {
    const found: string[] = [];

    const walk = (node: unknown, prefix: string, depth: number): void => {
        if (depth > MAX_DEPTH || !isPlainObject(node)) {
            return;
        }
        for (const name of Object.keys(node)) {
            const fullKey = `${prefix}.${name}`;
            const inspection = inspect(fullKey);
            if (inspection) {
                // A real setting. Record it if the user set it, and never
                // descend — its value belongs to the setting, not to the tree.
                if (isUserSet(inspection)) {
                    found.push(fullKey);
                }
                continue;
            }
            walk(node[name], fullKey, depth + 1);
        }
    };

    walk(tree, section, 0);
    return found;
}
