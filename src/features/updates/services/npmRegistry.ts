/**
 * The newest published version of an npm package, from the public npm registry.
 *
 * For a package that ships through npm rather than GitHub releases. The Adobe MCP package
 * (`@adobe-commerce/commerce-extensibility-tools`) is one: its GitHub repository is private
 * and has no releases or tags, so the update check asking GitHub for its latest release
 * found nothing, and never offered an Adobe MCP update (found 2026-10-20, PL-80). Its
 * update runs `npm update`, so npm is also where the version it installs comes from.
 *
 * @module features/updates/services/npmRegistry
 */

import { fetchWithTimeout } from './githubApiClient';

const NPM_REGISTRY = 'https://registry.npmjs.org';

/**
 * The version the `latest` dist-tag points at.
 *
 * @param packageName - the package, scoped or not: `@adobe-commerce/commerce-extensibility-tools`
 * @returns the version, or null when the registry cannot be read or answers without one
 */
export async function getLatestNpmVersion(packageName: string): Promise<string | null> {
    // A scoped name keeps its `@` and encodes its `/`, as the registry's own URLs do.
    const url = `${NPM_REGISTRY}/${packageName.replace('/', '%2F')}/latest`;
    try {
        const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) return null;
        const body = (await response.json()) as { version?: unknown };
        return typeof body.version === 'string' ? body.version : null;
    } catch {
        return null;
    }
}
