/**
 * The verdict `npm run lint:types` gives over a set of ESLint results (PL-113).
 *
 * Kept apart from the script so a test can hand it results without a full type-aware
 * lint of the test tree, which takes minutes.
 */

/** The four rules the test tree must stay clean of. */
export const RULES = new Set([
    '@typescript-eslint/no-unnecessary-type-assertion',
    '@typescript-eslint/no-base-to-string',
    '@typescript-eslint/only-throw-error',
    '@typescript-eslint/await-thenable',
]);

/**
 * The four rules not set to error in a resolved config. A rule switched off would make
 * every run "clean" for the wrong reason, so the check refuses to count without them.
 *
 * @param {Record<string, unknown>} rules - `calculateConfigForFile(...).rules`
 * @returns {string[]}
 */
export function rulesNotOn(rules) {
    const severity = (v) => (Array.isArray(v) ? v[0] : v);
    return [...RULES].filter((r) => ![2, 'error'].includes(severity(rules?.[r])));
}

/** Fewer linted files than this means the run did not read the test tree. */
export const MIN_FILES = 1000;

/**
 * @param {Array<{filePath: string, messages: Array<{ruleId: string|null, line: number, fatal?: boolean, message: string}>}>} results
 * @param {string} root - prefix stripped from file paths in the report
 * @returns {{ code: 0|1|2, lines: string[] }} 0 clean, 1 findings, 2 the run proves nothing
 */
export function verdict(results, root = '') {
    const rel = (p) => (root && p.startsWith(root) ? p.slice(root.length + 1) : p);
    if (results.length < MIN_FILES) {
        return { code: 2, lines: [`linted only ${results.length} files; expected the whole test tree.`] };
    }
    // A file the parser could not read reports no rule at all, so it would pass as clean.
    const unread = results.flatMap((r) =>
        r.messages.filter((m) => m.fatal).map((m) => `${rel(r.filePath)}:${m.line}  could not be read: ${m.message}`),
    );
    if (unread.length > 0) return { code: 2, lines: unread };
    const findings = results.flatMap((r) =>
        r.messages.filter((m) => RULES.has(m.ruleId)).map((m) => `${rel(r.filePath)}:${m.line}  ${m.ruleId}`),
    );
    if (findings.length > 0) return { code: 1, lines: findings };
    return { code: 0, lines: [`clean (${results.length} test files, ${RULES.size} rules).`] };
}
