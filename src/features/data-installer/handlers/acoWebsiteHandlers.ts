/**
 * "From a website": an ACO pack made from a public website's products (PL-60 slice A).
 *
 * Two message types:
 * - `make-aco-pack-from-products` — the agent's `make_aco_pack_from_products`: the products the
 *   project's AI read off the page (typed `ScrapedProduct`), saved as an ACO pack in the SC's
 *   datapack LIBRARY for review. Never into ACO or Commerce. Undone by `delete-library-datapack`.
 * - `scrape-website-to-aco-pack` — the Create datapack dialog's "From a website": checks the URL
 *   and opens the project's AI with the prompt to do the scrape, through the house command
 *   (`demoBuilder.openInClaude`, which delivers the prompt as `claude --continue -- '<prompt>'`
 *   or to Copilot's chat, by engine).
 *
 * The scrape itself is the agent's, following the generated `scrape-products-to-aco` skill with
 * the `@playwright/mcp` browser every project ships; DSC's own scraper refused our sign-in
 * (`.rptc/research/aco-support/dsc-scraper.md`).
 *
 * @module features/data-installer/handlers/acoWebsiteHandlers
 */

import * as vscode from 'vscode';
import { saveScrapedAcoPack } from '../services/acoWebsite/scrapedAcoPack';
import { ScrapedPackError } from '../services/acoWebsite/scrapedAcoRows';
import { MAKE_ACO_PACK_ARGS } from '../services/acoWebsite/scrapedProductInput';
import { scrapeWebsitePrompt } from '../services/acoWebsite/scrapeWebsitePrompt';
import { writePackToStore } from '../services/datapackTransfer';
import { openLibraryWriter } from './libraryWriter';
import { ErrorCode } from '@/types/errorCodes';
import { defineHandlers, type HandlerContext, type HandlerResponse } from '@/types/handlers';

const LOG_PREFIX = '[Data Installer]';

/** The first few of zod's complaints, each as `path: message`. */
function inputProblem(issues: ReadonlyArray<{ path: Array<string | number>; message: string }>): string {
    return issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
        .join('; ');
}

/** Make the pack from the products and save it into the library. */
async function makeAcoPackFromProducts(context: HandlerContext, payload?: unknown): Promise<HandlerResponse> {
    const parsed = MAKE_ACO_PACK_ARGS.safeParse(payload ?? {});
    if (!parsed.success)
        return {
            success: false,
            error: `These products cannot be made into an ACO pack: ${inputProblem(parsed.error.issues)}.`,
            code: ErrorCode.INVALID_OPERATION,
        };
    const args = parsed.data;
    const library = await openLibraryWriter(context);
    if (!library.ok) return { success: false, error: library.reason };
    const { writer } = library;
    try {
        const outcome = await saveScrapedAcoPack(
            {
                id: { name: args.datapackName, version: args.version },
                ...(args.displayName ? { displayName: args.displayName } : {}),
                locale: args.locale,
                currency: args.currency,
                ...(args.priceBookId ? { priceBookId: args.priceBookId } : {}),
                products: args.products,
            },
            (file) => writePackToStore(writer, file),
        );
        context.logger.info(`${LOG_PREFIX} ${outcome.sentence}`);
        return { success: true, note: outcome.sentence, data: outcome };
    } catch (error) {
        if (error instanceof ScrapedPackError)
            return { success: false, error: error.message, code: ErrorCode.INVALID_OPERATION };
        context.logger.error(
            `${LOG_PREFIX} The ACO pack ${args.datapackName}@${args.version} could not be saved`,
            error instanceof Error ? error : undefined,
        );
        return {
            success: false,
            error: 'The ACO pack could not be saved. Details are in Debug Logs.',
            code: ErrorCode.UNKNOWN,
        };
    }
}

/** An http(s) URL, or undefined. */
function websiteUrl(raw: unknown): URL | undefined {
    if (typeof raw !== 'string') return undefined;
    try {
        const url = new URL(raw.trim());
        return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined;
    } catch {
        return undefined;
    }
}

/** Open the project's AI on scraping the website into an ACO pack. */
async function scrapeWebsiteToAcoPack(_context: HandlerContext, payload?: unknown): Promise<HandlerResponse> {
    const raw = typeof payload === 'object' && payload !== null && 'url' in payload ? payload.url : undefined;
    const url = websiteUrl(raw);
    if (!url)
        return {
            success: false,
            error: 'Enter the address of a page that lists products, starting with https:// or http://.',
            code: ErrorCode.INVALID_OPERATION,
        };
    await vscode.commands.executeCommand('demoBuilder.openInClaude', { prompt: scrapeWebsitePrompt(url.href) });
    return { success: true };
}

export const acoWebsiteHandlers = defineHandlers({
    'make-aco-pack-from-products': makeAcoPackFromProducts,
    'scrape-website-to-aco-pack': scrapeWebsiteToAcoPack,
});
