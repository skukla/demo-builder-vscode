/**
 * The input of "make an ACO pack from products" (PL-60 slice A), as zod: one schema read by the
 * agent's tool (`make_aco_pack_from_products`, which publishes it) and by the handler (which
 * checks it again, since a handler is reachable from more than one surface).
 *
 * Typed to `ScrapedProduct` (`types/scrapedProduct.ts`), so the schema and the type cannot drift
 * apart without a compile error.
 *
 * @module features/data-installer/services/acoWebsite/scrapedProductInput
 */

import { z } from 'zod';
import type { ScrapedProduct } from '@/types/scrapedProduct';

/** At most this many products in one pack: DSC's scraper's own cap (reported). */
export const MAX_SCRAPED_PRODUCTS = 100;

const ISO_CURRENCY = /^[A-Za-z]{3}$/u;

/** `ProposableField`, as zod. */
const PROPOSED_FIELD = z.enum(['price', 'currency', 'sku', 'description', 'categories']);
/** `ScrapedProductSource`, as zod. */
const READ_FROM = z.enum(['json-ld', 'page']);

const SCRAPED_ATTRIBUTE = z
    .object({
        name: z.string().trim().min(1).describe('As the page labels the option: Size'),
        values: z.array(z.string()).describe('The values offered: ["S", "M", "L"]'),
    })
    .strict();

const SCRAPED_DATA = z
    .object({
        name: z.string().trim().min(1),
        image: z.string().url().describe('Absolute http(s) image URL; ACO fetches it from there'),
        description: z.string().optional(),
        price: z.number().finite().nonnegative().optional().describe('A number, no currency sign'),
        currency: z.string().regex(ISO_CURRENCY).optional().describe('ISO 4217: USD'),
        categories: z.array(z.string()).optional().describe('Category names, as the page shows them'),
        sku: z.string().trim().min(1).optional(),
        url: z.string().url().optional().describe("The product's own page"),
        attributes: z.array(SCRAPED_ATTRIBUTE).optional().describe('Option dimensions (size, colour)'),
    })
    .strict();

/** One product. */
export const SCRAPED_PRODUCT: z.ZodType<ScrapedProduct, z.ZodTypeDef, unknown> = z
    .object({
        origin: z.string().url().describe('The listing page it was found on'),
        data: SCRAPED_DATA,
        proposed: z
            .array(PROPOSED_FIELD)
            .optional()
            .describe('Every field whose value the page did NOT state, so you proposed it'),
        readFrom: READ_FROM.optional()
            .describe('Where the stated values were read: schema.org Product JSON-LD, or the visible page'),
    })
    .strict();

/** The tool's arguments, as a zod shape. */
export const MAKE_ACO_PACK_INPUT = {
    datapackName: z.string().trim().min(1).describe('Name of the new library pack, e.g. aco_acme_shop'),
    version: z.string().trim().min(1).describe('Its version, e.g. v1'),
    displayName: z.string().trim().min(1).optional().describe('The name everyone sees; the datapackName when omitted'),
    locale: z.string().trim().min(2).describe('The catalog locale ACO rows carry, e.g. en-US'),
    currency: z.string().regex(ISO_CURRENCY).describe("The pack's one currency, ISO 4217: USD"),
    priceBookId: z.string().trim().min(1).optional().describe('The price book the prices go in; main when omitted'),
    products: z.array(SCRAPED_PRODUCT).min(1).max(MAX_SCRAPED_PRODUCTS),
};

/** The arguments, checked (unknown keys such as `confirm` are dropped, not refused, here). */
export const MAKE_ACO_PACK_ARGS = z.object(MAKE_ACO_PACK_INPUT);

export type MakeAcoPackArgs = z.infer<typeof MAKE_ACO_PACK_ARGS>;
