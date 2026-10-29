/**
 * Which repository files AEM is told never to serve: the storefront's `.hlxignore`.
 *
 * It uses `.gitignore`'s rules, so it is read by `ignore`, the tested gitignore matcher,
 * rather than a hand-written one. Adobe's B2B template lists `_*.json` there (its block
 * models, combined into `component-models.json` at build time), so on Bodea's reset of
 * 2026-10-29 a check that compared every changed file with the live site reported 28 of
 * them as "did not reach the live site": AEM never serves them.
 *
 * @module features/eds/services/storefront/hlxIgnore
 */

import ignore, { type Ignore } from 'ignore';

/**
 * Read a `.hlxignore` file's text.
 *
 * @param text - the file as committed; empty when the storefront has none
 * @returns the rules, for {@link hlxIgnored}
 */
export function parseHlxIgnore(text: string): Ignore {
    return ignore().add(text);
}

/**
 * Whether AEM is told never to serve a repository path.
 *
 * @param rules - what {@link parseHlxIgnore} read
 * @param path - a repository path, no leading slash (`blocks/hero-3/_hero-3.json`)
 * @returns true when the path is left out
 */
export function hlxIgnored(rules: Ignore, path: string): boolean {
    return rules.ignores(path);
}
