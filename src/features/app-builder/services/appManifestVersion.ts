/**
 * The version an App Management app declares, read from the manifest
 * `@adobe/aio-commerce-lib-app` generates into the app (`metadata.version`).
 * It is what the app's installer compares when it decides to upgrade.
 *
 * @module features/app-builder/services/appManifestVersion
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';

/** Where lib-app writes the manifest, relative to the app root (read from lib-app 1.11 and 2.0). */
export const APP_MANIFEST_PATH = path.join(
    'src',
    'commerce-extensibility-1',
    '.generated',
    'app.commerce.manifest.json',
);

/**
 * @param componentPath - the app's folder
 * @returns the declared version, or undefined when the app has no readable manifest
 */
export async function readAppManifestVersion(componentPath: string): Promise<string | undefined> {
    let text: string;
    try {
        text = await fsPromises.readFile(path.join(componentPath, APP_MANIFEST_PATH), 'utf8');
    } catch {
        return undefined;
    }
    try {
        const version = (JSON.parse(text) as { metadata?: { version?: unknown } }).metadata?.version;
        return typeof version === 'string' && version.length > 0 ? version : undefined;
    } catch {
        return undefined;
    }
}
