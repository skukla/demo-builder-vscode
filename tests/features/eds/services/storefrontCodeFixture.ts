/**
 * Lines of a real storefront's code, for the suites that read paths out of code.
 *
 * Copied 2026-10-12 from the clone of an added demo built on a colleague's
 * repository (boilerplate 4.0.1 plus its author's own blocks): the storefront whose
 * copy arrived without its cart and checkout pages (EDS-40). Each file holds the
 * handful of lines that load a site path, unchanged, under the path it has in the
 * repository. Real lines on purpose: the reader has to survive how storefront code
 * is actually written, and a fixture written to fit a pattern only proves the
 * pattern matches itself.
 *
 * Typed to the reader's own input, so a change to that shape fails here.
 */

import type { StorefrontCodeFile } from '@/features/eds/services/storefrontCodePaths';

/** `scripts/commerce.js`: the route constants, plain and built from each other. */
const COMMERCE_JS = `
export const PRODUCT_TEMPLATE_PATHS = [
  'products/default',
];

// PATHS
export const SUPPORT_PATH = '/support';
export const PRIVACY_POLICY_PATH = '/privacy-policy';

// GUEST PATHS
export const ORDER_STATUS_PATH = '/order-status';
export const ORDER_DETAILS_PATH = '/order-details';
export const RETURN_DETAILS_PATH = '/return-details';
export const CREATE_RETURN_PATH = '/create-return';
export const SALES_GUEST_VIEW_PATH = '/sales/guest/view/';

// CUSTOMER PATHS
export const CUSTOMER_PATH = '/customer';
export const CUSTOMER_ORDER_DETAILS_PATH = \`\${CUSTOMER_PATH}\${ORDER_DETAILS_PATH}\`;
export const CUSTOMER_RETURN_DETAILS_PATH = \`\${CUSTOMER_PATH}\${RETURN_DETAILS_PATH}\`;
export const CUSTOMER_CREATE_RETURN_PATH = \`\${CUSTOMER_PATH}\${CREATE_RETURN_PATH}\`;
export const CUSTOMER_ORDERS_PATH = \`\${CUSTOMER_PATH}/orders\`;
export const CUSTOMER_FORGOTPASSWORD_PATH = \`\${CUSTOMER_PATH}/forgotpassword\`;
export const CUSTOMER_REQUISITION_LIST_DETAILS_PATH = \`\${CUSTOMER_PATH}/requisition-list-view\`;

// TRACKING URL
export const UPS_TRACKING_URL = 'https://www.ups.com/track';

// CUSTOMER B2B PATHS
export const CUSTOMER_PO_RULE_FORM_PATH = \`\${CUSTOMER_PATH}/approval-rule\`;
export const CUSTOMER_PO_RULE_DETAILS_PATH = \`\${CUSTOMER_PATH}/approval-rule-details\`;
export const CUSTOMER_PO_DETAILS_PATH = \`\${CUSTOMER_PATH}/purchase-order-details\`;

export async function fetchIndex(indexFile, pageSize = 500) {
  const handleIndex = async (offset) => {
    const resp = await fetch(\`/\${indexFile}.json?limit=\${pageSize}&offset=\${offset}\`);
`;

/** `blocks/footer/footer.js`: a fragment loaded from a default, and one from a local constant. */
const FOOTER_JS = `
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);
    const storeSwitcherPath = '/store-switcher';
      fragmentStoreView = await loadFragment(storeSwitcherPath);
`;

/** `blocks/header/header.js`: metadata defaults and links through `rootLink`. */
const HEADER_JS = `
import { fetchPlaceholders, getProductLink, rootLink } from '../../scripts/commerce.js';
const labels = await fetchPlaceholders();
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const wishlistPath = wishlistMeta ? new URL(wishlistMeta, window.location).pathname : '/wishlist';
  const excludeMiniCartFromPaths = ['/checkout'];
      const miniCartPath = miniCartMeta ? new URL(miniCartMeta, window.location).pathname : '/mini-cart';
                href: rootLink('/search'),
            window.location.href = \`\${rootLink('/search')}?q=\${encodeURIComponent(query)}\`;
`;

/** Blocks that link to pages, load a fragment by a literal, and read a constant from another file. */
const BLOCKS = {
    'blocks/commerce-checkout/commerce-checkout.js': `
    window.location.href = rootLink('/cart');
`,
    'blocks/commerce-checkout/containers.js': `
    const placeholders = await fetchPlaceholders('placeholders/checkout.json');
`,
    'blocks/commerce-account-sidebar/commerce-account-sidebar.js': `
  const fragment = await loadFragment('/customer/sidebar-fragment');
`,
    'blocks/commerce-b2b-po-checkout-success/commerce-b2b-po-checkout-success.js': `
    routePurchaseOrderDetails: () => rootLink(\`\${CUSTOMER_PO_DETAILS_PATH}?poRef=\${poUid}\`),
`,
    'blocks/uniform-configurator/uniform-configurator.lib.js': `
export const DEFAULT_DATA_SOURCE = '/data/configurators/marine-officer-dress-blues.json';
`,
    'scripts/initializers/auth.js': `
  const labels = await fetchPlaceholders('placeholders/auth.json');
`,
};

/** The fixture storefront, as the reader takes it: every file with its repository path. */
export const STOREFRONT_CODE: StorefrontCodeFile[] = [
    { path: 'scripts/commerce.js', content: COMMERCE_JS },
    { path: 'blocks/footer/footer.js', content: FOOTER_JS },
    { path: 'blocks/header/header.js', content: HEADER_JS },
    ...Object.entries(BLOCKS).map(([path, content]) => ({ path, content })),
];
