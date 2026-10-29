/**
 * Label files as they really sit in storefront repositories, byte for byte.
 *
 * Shared by the placeholder-stub suites (the service, creation and reset), which all
 * need the same files.
 */

/**
 * Adobe's `placeholders/checkout.json` in adobe-commerce/boilerplate-b2b-template,
 * read 2026-10-22 with
 * `gh api repos/adobe-commerce/boilerplate-b2b-template/contents/placeholders/checkout.json`
 * (blob 06753e9b1a97b8a1fbc2e55f7436cd81c0c8a4d5, last changed by commit efe28c41 on
 * 2026-09-02). The old bare single-sheet shape. The checkout block reads both keys with no
 * fallback, so a storefront without them shows "undefined" in the checkout's item-list
 * heading and its Edit link (measured on a live storefront the same day).
 */
export const B2B_TEMPLATE_CHECKOUT_JSON = `{
  "data": [
    {
      "Key": "Checkout.Summary.heading",
      "Value": "Your Cart ({count})"
    },
    {
      "Key": "Checkout.Summary.Edit",
      "Value": "Edit"
    }
  ]
}
`;

/** The two rows the template's file carries. */
export const B2B_TEMPLATE_CHECKOUT_ROWS = [
    { Key: 'Checkout.Summary.heading', Value: 'Your Cart ({count})' },
    { Key: 'Checkout.Summary.Edit', Value: 'Edit' },
];

/**
 * The OLDER stub Demo Builder wrote before 2026-10-12: one bare sheet. Read 2026-10-22
 * from `placeholders/checkout.json` in two storefront repositories made from the B2B
 * template (no trailing newline).
 */
export const OLD_SINGLE_SHEET_STUB_JSON = `{
  "total": 1,
  "offset": 0,
  "limit": 1,
  "data": [
    {
      "Key": "_stub",
      "Value": "Label overrides are authored as DA.live /placeholders sheets; dropin defaults apply until then. This stub only keeps the browser console quiet."
    }
  ]
}`;
