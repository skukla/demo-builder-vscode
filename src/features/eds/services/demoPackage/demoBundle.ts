/**
 * The demo bundle: what Export writes when the SC sends a FILE rather than a
 * link (owner, 2026-09-13: export is handing an artifact to someone else, in
 * one of two forms). One zip, one root folder, one entry per part that was
 * ticked:
 *
 *   <name>-demo-bundle/
 *     setup.demo-builder.json     the setup part: the settings file, never a credential
 *     storefront/                 the storefront part: the repository's files
 *       demo.demo-builder.json    with the description file inside, so "Add a demo package"
 *                                 reads the same card a link would give
 *
 * "Or add from a zip file" reads a bundle as well as a bare storefront zip.
 * Pure over bytes: the download and the save are the handler's.
 *
 * @module features/eds/services/demoPackage/demoBundle
 */

import AdmZip from 'adm-zip';
import { SHARED_DEMO_FILE_NAME, type SharedDemoDescription } from '@/types/projectFile';
import type { SettingsFile } from '@/types/settingsFile';

export const BUNDLE_SETUP_FILE = 'setup.demo-builder.json';
export const BUNDLE_STOREFRONT_DIR = 'storefront/';

export interface DemoBundleParts {
    /** The setup part, credentials already stripped. */
    settings?: SettingsFile;
    /** The storefront part: the repository archive GitHub served, and its description. */
    storefront?: { archive: Buffer; description: SharedDemoDescription };
}

export interface DemoBundle {
    bytes: Buffer;
    /** Files in the bundle. */
    fileCount: number;
    /** The parts it carries, in the order they appear. */
    parts: Array<'setup' | 'storefront'>;
}

/** The archive's single root folder (GitHub names it `<owner>-<repo>-<sha>/`). */
function archiveRoot(zip: AdmZip): string {
    return zip.getEntries().find((entry) => entry.isDirectory && !entry.entryName.slice(0, -1).includes('/'))?.entryName ?? '';
}

/**
 * Build the bundle.
 *
 * @param name - The bundle's root folder is `<name>-demo-bundle/`
 * @param parts - What to put in
 * @returns The zip to hand to the SC
 */
export function buildDemoBundle(name: string, parts: DemoBundleParts): DemoBundle {
    const out = new AdmZip();
    const root = `${name}-demo-bundle/`;
    const included: DemoBundle['parts'] = [];
    if (parts.settings) {
        out.addFile(`${root}${BUNDLE_SETUP_FILE}`, Buffer.from(`${JSON.stringify(parts.settings, null, 2)}\n`, 'utf-8'));
        included.push('setup');
    }
    if (parts.storefront) {
        const archive = new AdmZip(parts.storefront.archive);
        const strip = archiveRoot(archive).length;
        for (const entry of archive.getEntries()) {
            if (entry.isDirectory) continue;
            const path = entry.entryName.slice(strip);
            if (!path || path === SHARED_DEMO_FILE_NAME) continue;
            out.addFile(`${root}${BUNDLE_STOREFRONT_DIR}${path}`, entry.getData());
        }
        out.addFile(
            `${root}${BUNDLE_STOREFRONT_DIR}${SHARED_DEMO_FILE_NAME}`,
            Buffer.from(`${JSON.stringify(parts.storefront.description, null, 2)}\n`, 'utf-8'),
        );
        included.push('storefront');
    }
    const bytes = out.toBuffer();
    return { bytes, fileCount: out.getEntries().filter((entry) => !entry.isDirectory).length, parts: included };
}

/** `<name>-demo-bundle.zip`, the name the save dialog offers and the headless default. */
export function defaultBundleName(name: string): string {
    return `${name}-demo-bundle.zip`;
}
