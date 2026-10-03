/**
 * The catalog menu's record on the project (EDS-24).
 *
 * Lives on the storefront instance's free-form metadata —
 * `componentInstances['eds-storefront'].metadata.catalogMenu` (owner-approved
 * 2026-10-04). The manifest schema types `metadata` as an object with
 * `additionalProperties: {}`, so the key needs no schema change.
 *
 * The record is the proof of authorship the undo relies on (`catalogMenuService`), so a
 * value that does not read as one counts as NO record: removing nothing is the safe way
 * to be wrong.
 *
 * @module features/eds/services/catalogMenu/catalogMenuRecord
 */

import type { CatalogMenuRecord } from './catalogMenuService';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';

const KEY = 'catalogMenu';

function isPageEntry(value: unknown): value is { path: string; hash: string } {
    const entry = value as { path?: unknown; hash?: unknown } | null;
    return typeof entry?.path === 'string' && typeof entry.hash === 'string';
}

/**
 * The record Demo Builder kept the last time it built or removed the menu.
 *
 * @param project - the project
 * @returns the record, or the empty record when there is none
 */
export function readCatalogMenuRecord(project: Project): CatalogMenuRecord {
    const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
    const raw = metadata?.[KEY] as { pages?: unknown; navSwitch?: unknown } | undefined;
    const pages = Array.isArray(raw?.pages) ? raw.pages.filter(isPageEntry) : [];
    return {
        pages: pages.map(({ path, hash }) => ({ path, hash })),
        navSwitch: raw?.navSwitch === true,
    };
}

/**
 * Keep the record on the project (the caller saves it). An empty record deletes the key.
 *
 * @param project - the project, changed in place
 * @param record - what the last run left claimed
 */
export function writeCatalogMenuRecord(project: Project, record: CatalogMenuRecord): void {
    const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!instance) {
        throw new Error('This project has no storefront to keep the catalog menu record on');
    }
    const metadata = { ...(instance.metadata ?? {}) };
    if (record.pages.length === 0 && !record.navSwitch) {
        delete metadata[KEY];
    } else {
        metadata[KEY] = record;
    }
    instance.metadata = metadata;
}
