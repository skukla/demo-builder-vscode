/**
 * Broken links on the project: links the storefront's copied content carries
 * to pages its content source does not have either (2026-10-07).
 *
 * Found by the content copy's completeness audit (`patchReport.brokenLinks`),
 * kept on the storefront instance's free-form metadata —
 * `componentInstances['eds-storefront'].metadata.brokenLinks` — and read by the
 * Storefront Report, which lists them with the page each sits on. They used to
 * be a warning pop-up on every create and reset, about something nobody had
 * left out of the copy.
 *
 * Written on create and on reset, both of which copy the content afresh, so
 * the record always describes the last copy. A project made before this has no
 * record, which reads as no broken links known.
 *
 * @module features/eds/services/storefront/brokenLinksRecord
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { StorefrontBrokenLink } from '@/types/webviewPayloads';

const KEY = 'brokenLinks';

function isBrokenLink(value: unknown): value is StorefrontBrokenLink {
    const entry = value as { link?: unknown; pages?: unknown } | null;
    return (
        typeof entry?.link === 'string' &&
        Array.isArray(entry.pages) &&
        entry.pages.every((page) => typeof page === 'string')
    );
}

/**
 * The broken links the last content copy found. Anything that does not read
 * as one is dropped.
 *
 * @param project - the project
 * @returns the links, or none
 */
export function readBrokenLinks(project: Project): StorefrontBrokenLink[] {
    const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
    const raw = metadata?.[KEY];
    return Array.isArray(raw) ? raw.filter(isBrokenLink) : [];
}

/**
 * Keep what the last content copy found (the caller saves the project). A
 * project with no storefront has nothing to keep it on, and is left alone.
 *
 * @param project - the project, changed in place
 * @param links - the copy's broken links; none clears the record
 */
export function writeBrokenLinks(project: Project, links: StorefrontBrokenLink[] | undefined): void {
    const instance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!instance) return;
    const metadata = { ...(instance.metadata ?? {}) };
    if (links && links.length > 0) {
        metadata[KEY] = links.map(({ link, pages }) => ({ link, pages: [...pages] }));
    } else {
        delete metadata[KEY];
    }
    instance.metadata = metadata;
}
