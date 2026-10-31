/**
 * A product read off a public website, as the project's agent hands it to
 * `make_aco_pack_from_products` (PL-60 slice A, "From a website").
 *
 * Modelled on DSC 3.0's `ScrapedProduct` (`{ origin, data: { name, description, price, currency,
 * categories, sku, image, url, attributes[] } }`, as FluffyJaws reports it from
 * `Adobe-CoreTech/livedemos-scraper`; not verified by us — `.rptc/research/aco-support/dsc-scraper.md`).
 * Two differences, both on purpose:
 *
 * - `proposed` names every field whose value the page did NOT state. DSC's scraper proposes a
 *   price, USD and a SKU silently; here a proposed value is marked, so the SC can review it
 *   before the pack is loaded.
 * - `readFrom` says where the stated values came from: schema.org `Product` JSON-LD, or the
 *   visible page. DSC reads only the visible page.
 *
 * DSC's `downloadUrl` (a 24-hour re-hosted image copy) has no counterpart: ACO fetches the image
 * from its original URL.
 *
 * Imports nothing, so a webview can read it too.
 *
 * @module types/scrapedProduct
 */

/** A field whose value can be proposed when the page does not state it. */
export type ProposableField = 'price' | 'currency' | 'sku' | 'description' | 'categories';

/** Every proposable field, in the order an answer names them. */
export const PROPOSABLE_FIELDS: readonly ProposableField[] = [
    'price',
    'currency',
    'sku',
    'description',
    'categories',
];

/** Where a product's stated values were read. */
export type ScrapedProductSource = 'json-ld' | 'page';

/** One option dimension a product page offers (size, colour): its values, not variant SKUs. */
export interface ScrapedProductAttribute {
    /** As the page labels it: `Size`. */
    name: string;
    values: string[];
}

/** What was read (or proposed) for one product. */
export interface ScrapedProductData {
    name: string;
    /** An absolute http(s) image URL; ACO fetches it from there. */
    image: string;
    description?: string;
    price?: number;
    /** ISO 4217, `USD`. */
    currency?: string;
    /** Category names, as the page shows them. */
    categories?: string[];
    sku?: string;
    /** The product's own page; the listing URL when it has none. */
    url?: string;
    attributes?: ScrapedProductAttribute[];
}

/** One product read off a website. */
export interface ScrapedProduct {
    /** The listing page it was found on. */
    origin: string;
    data: ScrapedProductData;
    /** Fields whose value the page did not state, so the agent proposed it. */
    proposed?: ProposableField[];
    readFrom?: ScrapedProductSource;
}
