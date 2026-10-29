/**
 * Live code patches as the ledgers list them (read from
 * `eds-demo-patches/citisignal-b2b/code-patches.json`, 2026-10-23), with storefront files they
 * fit. The product teaser's two patches are one change in two parts on one file: the link and
 * the import it calls.
 *
 * Typed to the real interface so a field the code stops reading, or one invented here, fails
 * `typecheck:tests`.
 */

import type { CodePatch } from '@/features/eds/services/patches/codePatchRegistry';

export const HEADER_NAV_TOOLS: CodePatch = {
    id: 'header-nav-tools-defensive',
    target: 'blocks/header/header.js',
    description: 'Make header.js defensive when the nav-tools section is missing.',
    precondition: "const navTools = nav.querySelector('.nav-tools');",
    replacement:
        "let navTools = nav.querySelector('.nav-tools');\n\n  // Create the nav-tools section if it is missing. DA.live strips empty\n" +
        '  // divs during content processing, leaving nav with only 2 sections\n' +
        '  // (brand, sections) instead of 3 — without this guard header.js throws\n' +
        '  // "Cannot read properties of null".\n  if (!navTools) {\n' +
        "    navTools = document.createElement('div');\n    navTools.classList.add('nav-tools');\n" +
        '    nav.appendChild(navTools);\n  }',
};

export const TEASER_LINK: CodePatch = {
    id: 'product-teaser-sku-encoding',
    target: 'blocks/product-teaser/product-teaser.js',
    description: 'Build the product-teaser Details link with getProductLink.',
    precondition: 'rootLink(`/products/${urlKey}/${sku}`)',
    replacement: 'getProductLink(urlKey, sku)',
};

export const TEASER_IMPORT: CodePatch = {
    id: 'product-teaser-getproductlink-import',
    target: 'blocks/product-teaser/product-teaser.js',
    description: "Swap the product-teaser's rootLink import for getProductLink.",
    precondition: "import {\n  rootLink,\n} from '../../scripts/commerce.js';",
    replacement: "import {\n  getProductLink,\n} from '../../scripts/commerce.js';",
};

export const KNOWN_PATCHES: readonly CodePatch[] = [HEADER_NAV_TOOLS, TEASER_LINK, TEASER_IMPORT];

/** Adobe's header.js around the line the patch fixes. */
export const HEADER_JS = "export default async function decorate(block) {\n  const navTools = nav.querySelector('.nav-tools');\n}\n";

/** The product teaser as Adobe's template has it: the import, then the link. */
export const TEASER_JS =
    "import {\n  rootLink,\n} from '../../scripts/commerce.js';\n\n" +
    'export default function decorate() {\n  const href = rootLink(`/products/${urlKey}/${sku}`);\n}\n';
