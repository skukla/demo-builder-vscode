/**
 * The user-facing names of the AI surface, WITH where each was read.
 *
 * A plain data module — no React — so the modal components and the coherence
 * suite (`tests/templates/ai-bundle-coherence.test.ts`) import one source of
 * truth. Provenance is structural, not a comment, because on 2026-08-26 four
 * of six user-facing names turned out to be wrong and correcting them took two
 * rounds of research precisely because nothing recorded where any name came
 * from. The suite fails a label whose source is empty.
 *
 * @module features/dashboard/ui/components/aiSurfaceNames
 */

export interface NamedWithSource {
    label: string;
    /** Where the label was read — a doc URL, a README heading, or "ours". */
    source: string;
}

/** Display label per `.mcp.json` server id. An unknown id renders as itself. */
export const SERVER_LABELS: Record<string, NamedWithSource> = {
    'demo-builder': { label: 'Demo Builder MCP', source: 'ours — named for the product' },
    'commerce-extensibility': {
        // The server KEY is `commerce-extensibility`; the npm PACKAGE is
        // "Adobe Commerce Extensibility Tools". Neither is what Adobe puts in a
        // heading, and neither is what a user searching the docs will type.
        label: 'Adobe Commerce App Builder MCP',
        source: 'H1 of developer.adobe.com/internals/mcp-registry-web-app/mcp/commerce-extensibility-tools (read 2026-08-26)',
    },
    playwright: {
        label: 'Playwright MCP',
        source: 'the README heading of @playwright/mcp',
    },
    dropins: {
        // Adobe's own split: the PRODUCT is closed ("Dropins MCP") while PROSE
        // hyphenates ("drop-in components"). This is a product name.
        label: 'Dropins MCP',
        source: 'H1 of experienceleague.adobe.com/developer/commerce/storefront/ai/dropins-mcp/ (read 2026-08-26)',
    },
};

/**
 * Display label per Adobe skill-bundle prefix (the `<prefix>-` skillsWriter
 * stamps on delivered bundle directories).
 */
export const BUNDLE_LABELS: Readonly<Record<string, NamedWithSource>> = {
    aem: {
        // NOT "AEM Boilerplate Commerce" (the CLI picker's id for the REPO):
        // both halves of this name are Adobe's — see source — the joined
        // phrase is ours.
        label: 'Adobe Commerce Storefront skills',
        source: '"Adobe Commerce Storefront" titles experienceleague.adobe.com/developer/commerce/storefront/; "Storefront skills" heads the same set on developer.adobe.com/commerce/extensibility/developer-agent/skills-and-prompts (read 2026-08-26)',
    },
    appbuilder: {
        label: 'Adobe Commerce Integration Starter Kit skills',
        source: "Title Case per the tools-setup starter-kit picker (starterKits.json in aio-cli-plugin-commerce) and the kit's own architect SKILL.md (read 2026-08-26)",
    },
};
