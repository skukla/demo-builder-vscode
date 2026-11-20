/**
 * A gift card's amounts, both ways (datapack-engine step 11). Commerce answers them twice (live,
 * 2026-10-30, `GIFT_CARD_6`): in `extension_attributes.giftcard_amounts` (`attribute_id`,
 * `website_id`, `value`, `website_value`) and among the custom attributes as `giftcard_amounts`,
 * with this store's `value_id` and `entity_id`, all as strings. The service's export strips the
 * custom attribute's `value_id` and `row_id` and keeps the rest.
 *
 * - **To the store**: sent once, in `extension_attributes.giftcard_amounts`, each on every website
 *   (`website_id` 0, which a store pricing per website or globally both take) with this store's
 *   `giftcard_amounts` attribute id (`GET products/attributes/giftcard_amounts`, captured). The
 *   custom-attribute copy is never sent: the sandbox's own gift card holds each amount twice, which
 *   is what sending both looks like (a lead, not measured). A row carrying amounts only there has
 *   them moved across.
 * - **To a pack**: each amount's value alone. The websites are left out, as a product's are.
 *
 * @module features/data-installer/services/demoBuilderEngine/giftCardAmounts
 */

import type { ProductLookups } from './productLookups';

export const AMOUNTS_CODE = 'giftcard_amounts';

type CustomAttribute = { attribute_code: string; value?: unknown };
type Amount = Record<string, unknown>;

const listOf = (value: unknown): Amount[] => (Array.isArray(value) ? (value as Amount[]) : []);

/** The custom attributes without the amounts' copy. */
export function withoutAmounts<T extends CustomAttribute>(attributes: readonly T[]): T[] {
    return attributes.filter((a) => a.attribute_code !== AMOUNTS_CODE);
}

/** The amounts a row carries: its extension attribute, else its custom attribute; none when neither. */
function rowAmounts(ext: Record<string, unknown>, attributes: readonly CustomAttribute[]): Amount[] | undefined {
    if (Array.isArray(ext[AMOUNTS_CODE])) return listOf(ext[AMOUNTS_CODE]);
    const copy = attributes.find((a) => a.attribute_code === AMOUNTS_CODE);
    return copy ? listOf(copy.value) : undefined;
}

/** The amounts as Commerce takes them, or undefined when the row has none. */
export async function amountsForStore(lk: ProductLookups, ext: Record<string, unknown>, attributes: readonly CustomAttribute[]): Promise<Amount[] | undefined> {
    const amounts = rowAmounts(ext, attributes);
    if (!amounts) return undefined;
    const attributeId = Number((await lk.attribute(AMOUNTS_CODE)).attribute_id);
    return amounts.map((a) => ({ attribute_id: attributeId, website_id: 0, value: Number(a.value) }));
}

/** The amounts as a pack holds them: each value alone. */
export function amountsForPack(amounts: unknown): Amount[] {
    return listOf(amounts).map((a) => ({ value: Number(a.value) }));
}
