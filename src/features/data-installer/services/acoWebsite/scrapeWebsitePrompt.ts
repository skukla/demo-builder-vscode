/**
 * The prompt "From a website" opens the project's AI with (PL-60 slice A). It names the skill
 * that says how to scrape (`scrape-products-to-aco`) and the tool that saves the pack
 * (`make_aco_pack_from_products`), and asks for the review step before saving, so the SC sees
 * which values were proposed before anything reaches the library.
 *
 * @module features/data-installer/services/acoWebsite/scrapeWebsitePrompt
 */

/** The skill the prompt points the agent at. Its template is `templates/skills/<name>.md`. */
export const SCRAPE_PRODUCTS_SKILL = 'scrape-products-to-aco';

/**
 * @param url - an http(s) URL, already checked and normalised (`URL.href`)
 */
export function scrapeWebsitePrompt(url: string): string {
    return (
        `Make an ACO datapack from the products on ${url}. Follow the ${SCRAPE_PRODUCTS_SKILL} skill: ` +
        'read the product cards with the browser, prefer what the page states, and mark every value ' +
        'you had to propose. Show me the products and which values were proposed, then save them to ' +
        'my datapack library with make_aco_pack_from_products once I agree.'
    );
}
