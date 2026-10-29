/**
 * The two code patches the patches repo RETIRED (EDS-62), as its ledger lists them under
 * `retired` (read from `eds-demo-patches/b2b/code-patches.json`, 2026-10-22). Both put an old
 * `_HH` SKU encoding into `scripts/commerce.js`; storefronts made before 2026-10-06 still
 * carry it, and every product link to a SKU with `_` points at an address never published.
 *
 * Typed to the real interface so a field the code stops reading, or one invented here, fails
 * `typecheck:tests`.
 */

import type { RetiredCodePatch } from '@/features/eds/services/patches/retiredPatches';

export const RETIRED_SKU_ENCODING: RetiredCodePatch = {
    id: "product-link-sku-encoding",
    target: "scripts/commerce.js",
    description: "Add reversible encodeSkuForUrl/decodeSkuFromUrl helpers and decode the SKU segment on PDP load, so SKUs with spaces/punctuation/mixed case round-trip to the Commerce API. Replaces the lossy slug + __-slash scheme (ADR-007).",
    precondition: "function getSkuFromUrl() {\n  const path = window.location.pathname;\n  const result = path.match(/\\/products\\/[\\w|-]+\\/([\\w|-]+)$/);\n  return result?.[1];\n}",
    replacement: "/**\n * Reversible, lowercase-stable, Helix-path-safe SKU encoding for PDP URLs.\n * Keeps [a-z0-9-] literal; escapes every other UTF-8 byte (including _) as\n * _HH lowercase hex. MIRROR of demo-builder-vscode\n * src/features/eds/services/pdpUrlEncoding.ts \u2014 keep byte-for-byte identical\n * (see ADR-007). Clean SKUs encode unchanged; SKUs with spaces/punctuation\n * round-trip instead of breaking. Decode is modulo case \u2014 Helix lowercases\n * content-bus paths and Catalog Service SKU lookup is case-insensitive.\n */\nexport function encodeSkuForUrl(sku) {\n  const bytes = new TextEncoder().encode(sku.toLowerCase());\n  let out = '';\n  for (const b of bytes) {\n    const ch = String.fromCharCode(b);\n    out += /[a-z0-9-]/.test(ch) ? ch : `_${b.toString(16).padStart(2, '0')}`;\n  }\n  return out;\n}\n\nfunction decodeSkuFromUrl(value) {\n  const bytes = [];\n  for (let i = 0; i < value.length; i += 1) {\n    if (value[i] === '_') {\n      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));\n      i += 2;\n    } else {\n      bytes.push(value.charCodeAt(i));\n    }\n  }\n  return new TextDecoder().decode(new Uint8Array(bytes));\n}\n\nfunction getSkuFromUrl() {\n  const path = window.location.pathname;\n  // Allow the full Helix-safe alphabet in the SKU segment, then decode the\n  // _HH escapes back to the original SKU before querying Commerce.\n  const result = path.match(/\\/products\\/[^/]+\\/([^/]+)$/);\n  return result?.[1] ? decodeSkuFromUrl(result[1]) : null;\n}",
    exit: "TODO: file PR to upstream so canonical encodes SKUs reversibly; delete on merge. See ADR-007.",
    critical: false,
    retiredBy: "21f7e02",
    reason: "Put a reversible _HH SKU encoding in product links. Helix rewrites '_' to '-' on publish, so every SKU with '_' was published at an address no link pointed to. Adobe's own getProductLink already cleans the SKU the way Helix does, and product pages carry <meta name=\"sku\"> (ADR-024).",
};

export const RETIRED_SKU_LINK: RetiredCodePatch = {
    id: "product-link-sku-slash-encoding",
    target: "scripts/commerce.js",
    description: "Build product links with reversible encodeSkuForUrl(sku) instead of lossy sanitizeName(sku), so the generated PDP URL decodes back to the exact SKU. Pairs with product-link-sku-encoding (ADR-007). (Id is historical \u2014 now full encoding, not just slashes.)",
    precondition: "export function getProductLink(urlKey, sku) {\n  if (!urlKey) {\n    console.warn('getProductLink: urlKey is missing or empty', { urlKey, sku });\n  }\n  if (!sku) {\n    console.warn('getProductLink: sku is missing or empty', { urlKey, sku });\n  }\n  const sanitizedUrlKey = urlKey ? sanitizeName(urlKey) : '';\n  const sanitizedSku = sku ? sanitizeName(sku) : '';\n  return rootLink(`/products/${sanitizedUrlKey}/${sanitizedSku}`);\n}",
    replacement: "export function getProductLink(urlKey, sku) {\n  if (!urlKey) {\n    console.warn('getProductLink: urlKey is missing or empty', { urlKey, sku });\n  }\n  if (!sku) {\n    console.warn('getProductLink: sku is missing or empty', { urlKey, sku });\n  }\n  const sanitizedUrlKey = urlKey ? sanitizeName(urlKey) : '';\n  // Reversible, Helix-safe SKU encoding (see encodeSkuForUrl) instead of the\n  // lossy sanitizeName(), so SKUs with spaces/punctuation/mixed case survive\n  // the round-trip to the Commerce API on PDP load.\n  const sanitizedSku = sku ? encodeSkuForUrl(sku) : '';\n  return rootLink(`/products/${sanitizedUrlKey}/${sanitizedSku}`);\n}",
    exit: "TODO: file PR to upstream so canonical encodes SKUs reversibly; delete on merge. See ADR-007.",
    critical: false,
    retiredBy: "21f7e02",
    reason: "Put a reversible _HH SKU encoding in product links. Helix rewrites '_' to '-' on publish, so every SKU with '_' was published at an address no link pointed to. Adobe's own getProductLink already cleans the SKU the way Helix does, and product pages carry <meta name=\"sku\"> (ADR-024).",
};

export const RETIRED_PATCHES: readonly RetiredCodePatch[] = [RETIRED_SKU_ENCODING, RETIRED_SKU_LINK];

const HEADER = "import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';\n\n";
const BETWEEN = '\n\nexport function sanitizeName(name) {\n  return name.toLowerCase();\n}\n\n';
const FOOTER = '\n\nexport async function loadCommerce() {}\n';

/** `scripts/commerce.js` as Adobe's boilerplate ships it: both retired preconditions, untouched. */
export const COMMERCE_JS_CANONICAL =
    HEADER + RETIRED_SKU_ENCODING.precondition + BETWEEN + RETIRED_SKU_LINK.precondition + FOOTER;

/** The same file on a storefront made before 2026-10-06: both retired replacements in place. */
export const COMMERCE_JS_RETIRED_APPLIED =
    HEADER + RETIRED_SKU_ENCODING.replacement + BETWEEN + RETIRED_SKU_LINK.replacement + FOOTER;
