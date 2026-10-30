/**
 * Gift cards (datapack-engine step 11). A gift card is a product (`type_id: giftcard`), made with
 * `POST products` as the Data Installer's `GiftCardImportProcessor` makes it, so the `giftcards`
 * kind rides the products kind's install, update and removal, recorded under its own kind so a
 * repeat install finds its rows under `giftcards`. What is its own is its amounts:
 *
 * - sent once, in `extension_attributes.giftcard_amounts`, on every website (`website_id` 0) with
 *   this store's `giftcard_amounts` attribute id, never in `custom_attributes` with another
 *   store's `value_id` and `entity_id`;
 * - in pack form, each amount's value alone.
 *
 * Store answers are the ones captured 2026-10-30 (`GIFT_CARD_6`, `GIFTCARD_AMOUNTS_ATTRIBUTE`).
 * Luma's own `giftcards` rows could not be read (see the fixtures file), so the pack row here is
 * CitiSignal's store gift card in pack form, as a capture would write it.
 */

import { packedFingerprint } from '@/features/data-installer/services/demoBuilderEngine/storeCopies';
import { productPackForm } from '@/features/data-installer/services/demoBuilderEngine/packForm';
import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import {
    GIFT_CARD_KIND,
    installProducts,
    parseProductRows,
    toCommerceProduct,
} from '@/features/data-installer/services/demoBuilderEngine/productsKind';
import { GIFT_CARD_6, GIFTCARD_AMOUNTS_ATTRIBUTE } from '../../../../helpers/commerceSalesRuleFixtures';
import { by, fakeContext, page } from './demoBuilderEngine.testUtils';

const WEBSITE = 5;

/** The gift card as a pack row: its set by name, its category by url key. */
const GIFT_CARD_ROW = {
    product: {
        sku: 'mastercard-giftcard',
        name: 'MasterCard Gift Card',
        attribute_set_id: 'Gift Cards',
        type_id: 'giftcard',
        extension_attributes: { category_links: [{ position: -1, category_id: 'gift-cards' }], giftcard_amounts: [{ value: 50 }] },
        custom_attributes: [
            { attribute_code: 'giftcard_type', value: '0' },
            { attribute_code: 'giftcard_amounts', value: [{ value_id: '3', website_id: '0', value: '50.0000', entity_id: '6', attribute_id: '134', website_value: 50 }] },
        ],
    },
};

const reads = {
    'products/attributes/giftcard_amounts': GIFTCARD_AMOUNTS_ATTRIBUTE,
    'products/attributes/giftcard_type': { attribute_id: 140, frontend_input: 'select', is_user_defined: false },
    [page('categories/list', by('url_key', 'gift-cards'))]: { items: [{ id: 5, path: '1/2/5' }], total_count: 1 },
};

async function store() {
    const ctx = await fakeContext(reads);
    ctx.session.websiteId = WEBSITE;
    ctx.session.setIds.set('Gift Cards', 12);
    return ctx;
}

describe('gift cards install', () => {
    it("sends the amounts once, on every website, with this store's attribute id, and none among the custom attributes", async () => {
        const ctx = await store();

        const { product } = (await toCommerceProduct(productLookups(ctx), parseProductRows([GIFT_CARD_ROW])[0], WEBSITE)) as { product: Record<string, unknown> };

        expect((product.extension_attributes as Record<string, unknown>).giftcard_amounts).toEqual([{ attribute_id: 134, website_id: 0, value: 50 }]);
        expect((product.custom_attributes as Array<{ attribute_code: string }>).map((a) => a.attribute_code)).toEqual(['giftcard_type']);
        expect(product.attribute_set_id).toBe(12);
        expect((product.extension_attributes as Record<string, unknown>).website_ids).toEqual([WEBSITE]);
    });

    it('takes the amounts from the custom attributes when that is the only place a row carries them', async () => {
        const ctx = await store();
        const { giftcard_amounts: _amounts, ...ext } = GIFT_CARD_ROW.product.extension_attributes;
        const row = { product: { ...GIFT_CARD_ROW.product, extension_attributes: ext } };

        const { product } = (await toCommerceProduct(productLookups(ctx), parseProductRows([row])[0], WEBSITE)) as { product: { extension_attributes: Record<string, unknown> } };

        expect(product.extension_attributes.giftcard_amounts).toEqual([{ attribute_id: 134, website_id: 0, value: 50 }]);
    });

    it('makes a gift card with POST products and records it under the giftcards kind', async () => {
        const ctx = await store();

        await installProducts(ctx, parseProductRows([GIFT_CARD_ROW]), GIFT_CARD_KIND);

        expect(ctx.sent.map((c) => `${c.method} ${c.path}`)).toEqual(['POST products']);
        expect(ctx.recorder.created).toEqual([{ kind: GIFT_CARD_KIND, id: 'mastercard-giftcard' }]);
    });
});

describe('gift cards pack form', () => {
    it("keeps each amount's value alone, and drops the custom-attribute copy with this store's ids", async () => {
        const ctx = await fakeContext({ 'categories/5': { id: 5, name: 'Gift Cards', custom_attributes: [{ attribute_code: 'url_key', value: 'gift-cards' }] } });

        const { product } = await productPackForm(productLookups(ctx), GIFT_CARD_6);

        expect(product.extension_attributes?.giftcard_amounts).toEqual([{ value: 50 }, { value: 50 }]);
        expect(product.custom_attributes?.some((a) => a.attribute_code === 'giftcard_amounts')).toBe(false);
    });

    it('is hashed whole, so a changed amount in the pack is brought to the store', () => {
        const changed = { product: { ...GIFT_CARD_ROW.product, extension_attributes: { ...GIFT_CARD_ROW.product.extension_attributes, giftcard_amounts: [{ value: 75 }] } } };

        expect(packedFingerprint(GIFT_CARD_KIND, changed)).not.toBe(packedFingerprint(GIFT_CARD_KIND, GIFT_CARD_ROW));
    });
});
