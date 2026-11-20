/**
 * The record kinds whose objects are products, by SKU: a product, and a gift card (step 11), which is
 * made and removed as a product is but recorded under its own kind so a repeat install finds its rows
 * under `giftcards`. Kept apart from `productsKind.ts` so the import route (`productExportKind.ts`) can
 * name them without an import loop.
 *
 * @module features/data-installer/services/demoBuilderEngine/productKinds
 */

export const PRODUCT_KIND = 'products';

/**
 * Gift cards (step 11): products of `type_id` giftcard, made and removed as products are (the
 * service's `GiftCardImportProcessor` posts them to `products` too), recorded under their own kind
 * so a repeat install finds their rows under `giftcards`.
 */
export const GIFT_CARD_KIND = 'giftcards';

/** The kinds whose recorded objects are products, by SKU. */
export const PRODUCT_KINDS: readonly string[] = [PRODUCT_KIND, GIFT_CARD_KIND];
