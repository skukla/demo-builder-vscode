/**
 * appConfigPackages — read + isolate an App Builder app's `app.config.yaml`
 * runtime packages.
 *
 * Package isolation is the prune boundary in a shared workspace: `aio app deploy`
 * prunes only entities in the app's own package, so every integration must deploy
 * under a DISTINCT package (never the shared `application` / `dx-excshell-1`). We
 * achieve that by renaming the standalone runtime packages in the repo's
 * `app.config.yaml` to a name derived from the deployable id.
 *
 * Renaming works ONLY for STANDALONE apps (`application.runtimeManifest.packages`).
 * Extension apps (excshell etc.) fix their package via the extension point and
 * cannot be renamed — so integrations must be standalone action apps, enforced at
 * the add door via {@link isStandaloneApp}.
 *
 * @module features/app-builder/services/appConfigPackages
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

/** A runtime-manifest packages map: package name → its definition (opaque here). */
export type RuntimePackages = Record<string, unknown>;

interface AppConfigDoc {
    application?: { runtimeManifest?: { packages?: RuntimePackages } };
}

/** The `app.config.yaml` path for a cloned component. */
export function appConfigPath(componentPath: string): string {
    return path.join(componentPath, 'app.config.yaml');
}

/** Read + parse `app.config.yaml`, or `undefined` when it is missing/unparseable. */
async function readConfigDoc(componentPath: string): Promise<AppConfigDoc | undefined> {
    let raw: string;
    try {
        raw = await fsPromises.readFile(appConfigPath(componentPath), 'utf-8');
    } catch {
        return undefined;
    }
    try {
        return yaml.parse(raw) as AppConfigDoc;
    } catch {
        return undefined;
    }
}

/** The non-empty standalone runtime packages of a parsed config, else undefined. */
function standalonePackagesOf(doc: AppConfigDoc | undefined): RuntimePackages | undefined {
    const packages = doc?.application?.runtimeManifest?.packages;
    if (!packages || Object.keys(packages).length === 0) {
        return undefined;
    }
    return packages;
}

/**
 * Read a cloned app's standalone runtime packages, or `undefined` when there are
 * none to isolate — a missing/unparseable config, or an app whose packages are not
 * under `application.runtimeManifest` (an extension app). `undefined` therefore
 * means "not a standalone action app we can package-isolate".
 */
export async function readStandalonePackages(
    componentPath: string,
): Promise<RuntimePackages | undefined> {
    return standalonePackagesOf(await readConfigDoc(componentPath));
}

/**
 * Map each declared runtime package to a DISTINCT name derived from `owPackage`,
 * preserving contents:
 *   - a single package  → exactly `owPackage`;
 *   - multiple packages → `owPackage-<origName>` each (kept, never collapsed).
 *
 * Idempotent: re-applying to an already-isolated config leaves the names unchanged
 * (a redeploy re-runs this on the previously-renamed file).
 */
export function isolatePackages(packages: RuntimePackages, owPackage: string): RuntimePackages {
    const names = Object.keys(packages);
    if (names.length === 1) {
        return { [owPackage]: packages[names[0]] };
    }
    const isolated: RuntimePackages = {};
    for (const name of names) {
        const already = name === owPackage || name.startsWith(`${owPackage}-`);
        isolated[already ? name : `${owPackage}-${name}`] = packages[name];
    }
    return isolated;
}

/**
 * Whether the cloned app is a standalone action app that can be package-isolated.
 * Used at the add door to reject an extension-shaped or malformed integration
 * BEFORE any deploy (rather than silently landing it on a shared package).
 */
export async function isStandaloneApp(componentPath: string): Promise<boolean> {
    return (await readStandalonePackages(componentPath)) !== undefined;
}

/**
 * Rewrite a standalone app's `app.config.yaml` so its runtime packages carry the
 * derived distinct `owPackage` (the isolation transform above). No-op when there
 * are no standalone packages to rename — that case is caught at the add door, and
 * `aio app deploy` would fail on a missing/invalid config with its own error.
 *
 * @returns true when the config was rewritten, false when there was nothing to isolate.
 */
export async function applyIsolatedPackages(
    componentPath: string,
    owPackage: string,
): Promise<boolean> {
    const doc = await readConfigDoc(componentPath);
    const manifest = doc?.application?.runtimeManifest;
    const packages = standalonePackagesOf(doc);
    if (!manifest || !packages) {
        return false;
    }
    manifest.packages = isolatePackages(packages, owPackage);
    await fsPromises.writeFile(appConfigPath(componentPath), yaml.stringify(doc), 'utf-8');
    return true;
}
