/**
 * A `.gitignore` file as tests over repository-relative paths, for the doors that
 * turn files into a new repository without `git`: a zip arriving as a storefront
 * (`zipStorefrontImport`), and a blank-starter app saved to GitHub
 * (`appRepoPromotion`). Moved here from the zip import on 2026-10-05 when the
 * second door needed the same rule.
 *
 * @module core/utils/gitignoreRules
 */

/** One rule: whether it ignores a repository-relative, `/`-separated path. */
export type IgnoreRule = (path: string) => boolean;

/**
 * One `.gitignore` line as a test over repository-relative paths. Covers what
 * ignore files actually use: a name (`node_modules`, `*.bak`), a directory
 * (`logs/`, `coverage/*`), and a rooted path with globs
 * (`scripts/__dropins__/**\/*.map`). Negations (`!`) are not honoured: a file
 * the author un-ignored is rare, and dropping it is the safe direction.
 */
function ignoreRule(line: string): IgnoreRule | undefined {
    const rule = line.trim();
    if (!rule || rule.startsWith('#') || rule.startsWith('!')) return undefined;
    const dirOnly = /\/\*?$/.test(rule);
    const body = rule.replace(/\/\*?$/, '').replace(/^\//, '');
    if (!body) return undefined;
    // A slash inside the pattern roots it at the repository; a bare name matches
    // any path component (git's own rule).
    const rooted = body.includes('/');
    const regex = new RegExp(
        '^' +
            body
                .split('**')
                .map((part) =>
                    part
                        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                        .replace(/\*/g, '[^/]*')
                        .replace(/\?/g, '[^/]'),
                )
                .join('.*') +
            '$',
    );
    return (path: string): boolean => {
        const segments = path.split('/');
        const directories = segments.slice(0, -1);
        if (!rooted) {
            return (dirOnly ? directories : segments).some((segment) => regex.test(segment));
        }
        const prefixes = directories.map((_, i) => segments.slice(0, i + 1).join('/'));
        return (dirOnly ? prefixes : [path, ...prefixes]).some((candidate) =>
            regex.test(candidate),
        );
    };
}

/**
 * Every rule in a `.gitignore` file's text; blank lines, comments and negations
 * give none.
 *
 * @param text - The file's content ('' when there is no file)
 * @returns One test per rule
 */
export function parseIgnoreRules(text: string): IgnoreRule[] {
    return text
        .split('\n')
        .map(ignoreRule)
        .filter((rule): rule is IgnoreRule => rule !== undefined);
}
