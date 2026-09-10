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
 * WHAT IT DOES NOT DO, and the consequence: it cannot see a RENAME. If a
 * component renames `CATALOG_SERVICE_ENDPOINT` to
 * `ADOBE_CATALOG_SERVICE_ENDPOINT`, the merge keeps the old key (with the user's
 * real value) AND adds the new one (with the template's empty default). The
 * component then reads the new name, finds it empty, and fails at runtime — a
 * mesh deploy reports "missing keys" and nothing points back to the rename.
 *
 * That gap was described in prose by a six-block test suite that asserted
 * NOTHING and passed forever. It is now asserted in `envMerge.test.ts`.
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
 * Merge an existing `.env` with a new `.env.example`.
 *
 * @param oldContent - the user's current `.env`
 * @param templateContent - the new version's `.env.example`
 * @returns the merged file content, newline-terminated
 */
export function mergeEnvContent(oldContent: string, templateContent: string): string {
    const oldVars = parseEnvFile(oldContent);
    const templateVars = parseEnvFile(templateContent);

    // Old values win; template-only keys are added with their defaults.
    const merged = new Map([...templateVars, ...oldVars]);

    return (
        Array.from(merged.entries())
            .map(([key, value]) => `${key}=${value}`)
            .join('\n') + '\n'
    );
}
