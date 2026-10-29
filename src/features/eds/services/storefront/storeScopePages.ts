/**
 * Replacing a storefront's pages after its store changed (EDS-44).
 *
 * A storefront's product pages (`/products/{urlKey}/{sku}`) and Demo Builder's category
 * pages are made for one store. When a republish puts another store's codes live
 * (`storeScopeChange.ts` remembers it), this replaces them: Reset's catalog half, in
 * Reset's order (`edsResetService.ts`), on the same pieces —
 *
 * 1. the old store's generated product pages come off Helix (`removeProductPages`,
 *    with its refusal when another local project publishes to the same repository);
 * 2. Demo Builder's category pages are swapped for the new store's
 *    (`replaceCatalogMenuStep`; a page the SC edited is kept and named);
 * 3. the new store's product pages are published (`prewarmCatalog`, wired by
 *    `storeScopePagesDeps.ts`);
 * 4. the marker is cleared and the project saved.
 *
 * Undo is the same path: change the store back and republish.
 *
 * Three doors, this one service: Configure's Republish, the agent's `republish`, and
 * the dashboard's Republish (`republishStorefrontContent`). Each calls it only when the
 * marker is set and its own config publish reached the CDN.
 *
 * Never throws. It ends with ONE sentence for the SC. Every dependency is handed in
 * (ADR-015).
 *
 * @module features/eds/services/storefront/storeScopePages
 */

import { replaceCatalogMenuStep, type CatalogMenuReplacement, type CatalogMenuSite } from '../catalogMenu/catalogMenuStep';
import type { PrewarmResult } from '../catalogPrewarmService';
import { extractConfigParams } from '../storefrontConfigParams';
import type { EdsPipelineProgressCallback } from '../types';
import {
    removeProductPages,
    type ProductPageRemovalDeps,
    type ProductPageRemovalResult,
    type ProductPageSite,
} from './productPageRemoval';
import { clearCatalogPagesPending } from './storeScopeChange';
import { andList } from '@/core/utils/andList';
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { itemCount } from '@/core/utils/storefrontJobs';
import { formatDuration } from '@/core/utils/timeFormatting';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

export interface StoreScopePagesDeps {
    /** The Helix site, by GitHub owner and repository. */
    site: ProductPageSite;
    /** Helix, the authored-page listing and the shared-repository check, for the removal. */
    productPages: ProductPageRemovalDeps;
    /** The storefront, reading the categories of the store now live. */
    catalogMenu: CatalogMenuSite;
    /** Publish a page per product of the store now live. */
    publishProductPages(onProgress: EdsPipelineProgressCallback): Promise<PrewarmResult>;
    /** Save the project once the marker is cleared. */
    persist(project: Project): Promise<void>;
    logger: Logger;
}

/**
 * Report a stage as it starts, with the line under it: a count of its items, when there
 * is one, goes there ("30 pages"), never as a position on the stage.
 */
export type StoreScopeReport = (stage: string, step?: string) => void;

export interface StoreScopePagesResult {
    /** One sentence for the SC: where the storefront is now, and what changed. */
    sentence: string;
    counts: { categoryPages: number; productPages: number; oldProductPagesRemoved: number };
}

const STAGE = {
    remove: OPERATION_STAGES.removingProductPages.label,
    // The vocabulary's names for these jobs (progress vocabulary slice 3): the category
    // pages are the catalog menu, and a page per product is the warm-up Reset runs too.
    categories: OPERATION_STAGES.updatingCatalogMenu.label,
    publish: OPERATION_STAGES.warmingProductPages.label,
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const count = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The store as the SC picked it: the website's name when known, else its code. */
function storeNameOf(project: Project): string {
    const code = extractConfigParams(project).websiteCode;
    const website = project.commerceStoreStructure?.websites.find((w) => w.code === code);
    return website?.name ?? code ?? 'the new store';
}

function removedSentence(removal: ProductPageRemovalResult): string | undefined {
    if (removal.status === 'nothing') return undefined;
    if (removal.status === 'removed') return `${count(removal.liveRemoved, 'old product page')} removed.`;
    return removal.summary;
}

function keptSentence(kept: string[]): string | undefined {
    if (kept.length === 0) return undefined;
    const quoted = kept.map((path) => `"${path}"`);
    return `Kept ${andList(quoted)}: you edited ${kept.length === 1 ? 'it' : 'them'}.`;
}

function productSentence(publish: PrewarmResult): string | undefined {
    if (publish.skipped) return `Product pages were not published (${publish.skipReason ?? 'skipped'}).`;
    if (publish.failed > 0) return `${count(publish.failed, 'product page')} could not be published; republish to try again.`;
    return undefined;
}

function sentenceOf(
    store: string,
    removal: ProductPageRemovalResult,
    categories: CatalogMenuReplacement,
    publish: PrewarmResult,
): string {
    const made = [
        categories.written > 0 ? count(categories.written, 'category page') : '',
        publish.succeeded > 0 ? count(publish.succeeded, 'product page') : '',
    ].filter(Boolean);
    const head = made.length
        ? `Now on ${store}: ${made.join(' and ')} published.`
        : `Now on ${store}: no category or product pages were published.`;
    return [head, removedSentence(removal), keptSentence(categories.kept), categories.problem, productSentence(publish)]
        .filter(Boolean)
        .join(' ');
}

async function publishProductPages(deps: StoreScopePagesDeps, report: StoreScopeReport): Promise<PrewarmResult> {
    report(STAGE.publish);
    const started = Date.now();
    try {
        // The count is in the message ("Warming product pages: 37 of 300 pages"), for line
        // 2. Never a position: "(37 of 300)" on line 1 reads as a step of the run.
        const result = await deps.publishProductPages((p) => report(STAGE.publish, p.message));
        deps.logger.info(
            `[StoreScopePages] Publishing ${result.attempted} product pages took ${formatDuration(Date.now() - started)}`,
        );
        return result;
    } catch (error) {
        deps.logger.warn(`[StoreScopePages] Product pages were not published: ${messageOf(error)}`);
        return { attempted: 0, succeeded: 0, failed: 0, skipped: true, skipReason: messageOf(error) };
    }
}

async function clearMarker(project: Project, deps: StoreScopePagesDeps): Promise<void> {
    clearCatalogPagesPending(project);
    // The doors call this only after a config publish the CDN took, so the marker was
    // all that kept the storefront stale.
    if (project.edsStorefrontStatusSummary === 'stale') project.edsStorefrontStatusSummary = 'published';
    try {
        await deps.persist(project);
    } catch (error) {
        deps.logger.warn(`[StoreScopePages] Could not save the project: ${messageOf(error)}`);
    }
}

/**
 * Replace the old store's product and category pages with the new store's.
 *
 * @param project - the project, whose marker and category-page record change in place
 * @param deps - the storefront's clients, from `createStoreScopePagesDeps`
 * @param report - where each stage is shown
 * @returns the sentence and the counts. Never throws.
 */
export async function replaceStoreScopePages(
    project: Project,
    deps: StoreScopePagesDeps,
    report: StoreScopeReport = () => undefined,
): Promise<StoreScopePagesResult> {
    const store = storeNameOf(project);
    try {
        report(STAGE.remove);
        const removal = await removeProductPages(deps.site, deps.productPages);
        if (removal.found > 0) report(STAGE.remove, itemCount(removal.found, 'page'));

        report(STAGE.categories);
        const categories = await replaceCatalogMenuStep(project, deps.catalogMenu);
        if (categories.summary) deps.logger.info(`[StoreScopePages] Category pages: ${categories.summary}`);

        const publish = await publishProductPages(deps, report);
        await clearMarker(project, deps);

        const sentence = sentenceOf(store, removal, categories, publish);
        deps.logger.info(`[StoreScopePages] ${sentence}`);
        const counts = {
            categoryPages: categories.written,
            productPages: publish.succeeded,
            oldProductPagesRemoved: removal.liveRemoved,
        };
        return { sentence, counts };
    } catch (error) {
        deps.logger.error('[StoreScopePages] Replacing the pages failed', error instanceof Error ? error : undefined);
        return {
            sentence: `The pages for ${store} could not be made: ${messageOf(error)}. Republish the storefront to try again.`,
            counts: { categoryPages: 0, productPages: 0, oldProductPagesRemoved: 0 },
        };
    }
}
