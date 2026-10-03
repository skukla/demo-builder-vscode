/**
 * Merging a component's `.env` with the new version's `.env.example`.
 *
 * Extracted from `ComponentUpdater.mergeEnvFiles` on 2026-08-30 so the merge
 * SEMANTICS can be tested without driving a download, an extraction, a structure
 * verification and a post-update build to reach them. Behaviour is unchanged —
 * this is the same two-line parse-and-merge, given a name and a seam.
 *
 * WHAT THE RULE IS: the user's existing values win; keys the new template adds
 * arrive with the template's default. That preserves customisation across an
 * update, which is the point.
 *
 * RENAMES are invisible to a key-by-key merge, so they are DECLARED. If a
 * component renames `CATALOG_SERVICE_ENDPOINT` to
 * `ADOBE_CATALOG_SERVICE_ENDPOINT`, an undeclared rename keeps the old key (with
 * the user's real value) AND adds the new one (with the template's empty
 * default); the component reads the new name, finds it empty, and fails at
 * runtime — a mesh deploy reports "missing keys" and nothing points back to the
 * rename. Declaring it in `ENV_VAR_RENAMES` moves the existing project's value
 * to the new name instead (PL-24; CLAUDE.md property 3).
 *
 * Both behaviours are asserted in `envMerge.test.ts`.
 *
 * @module features/updates/services/envMerge
 */

/** Parse `KEY=value` lines, ignoring blanks and `#` comments. */
export function parseEnvFile(content: string): Map<string, string> {
    const vars = new Map<string, string>();

    content.split('\n').forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) return;

        const [key, ...valueParts] = line.split('=');
        if (key) {
            vars.set(key.trim(), valueParts.join('=').trim());
        }
    });

    return vars;
}

/**
 * Environment variables a component has renamed: OLD name -> NEW name.
 *
 * Add a row in the same change that renames a variable in a component's
 * `.env.example`, so an existing project's value follows the rename on update.
 * Empty on purpose: no component has renamed one since this list existed.
 */
export const ENV_VAR_RENAMES: Readonly<Record<string, string>> = {};

/**
 * Move each renamed variable's value to its new name.
 *
 * Only when the user has the old name and NOT the new one — a value already
 * under the new name is theirs and wins. The old name is dropped unless the new
 * template still ships it (then the component still reads it).
 */
function applyRenames(
    oldVars: Map<string, string>,
    templateVars: Map<string, string>,
    renames: Readonly<Record<string, string>>,
): Map<string, string> {
    const result = new Map(oldVars);
    for (const [from, to] of Object.entries(renames)) {
        const value = oldVars.get(from);
        if (value === undefined || oldVars.has(to)) continue;
        result.set(to, value);
        if (!templateVars.has(from)) result.delete(from);
    }
    return result;
}

/**
 * Merge an existing `.env` with a new `.env.example`.
 *
 * @param oldContent - the user's current `.env`
 * @param templateContent - the new version's `.env.example`
 * @param renames - declared renames, OLD -> NEW (production passes `ENV_VAR_RENAMES`)
 * @returns the merged file content, newline-terminated
 */
export function mergeEnvContent(
    oldContent: string,
    templateContent: string,
    renames: Readonly<Record<string, string>> = {},
): string {
    const templateVars = parseEnvFile(templateContent);
    const oldVars = applyRenames(parseEnvFile(oldContent), templateVars, renames);

    // Old values win; template-only keys are added with their defaults.
    const merged = new Map([...templateVars, ...oldVars]);

    return (
        Array.from(merged.entries())
            .map(([key, value]) => `${key}=${value}`)
            .join('\n') + '\n'
    );
}
