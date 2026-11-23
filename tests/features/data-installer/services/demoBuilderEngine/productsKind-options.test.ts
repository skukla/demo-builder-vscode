/**
 * A select value that is a number: an option's label first, an id only when no option has it.
 *
 * Luma's export writes a size as "32"; a number used to be taken as an option id outright, so it set
 * whichever option had id 32 (live, 2026-11-06, about 500 bottoms). Options are as an ACCS store
 * answers `GET products/attributes/{code}` (`options: [{ label, value }]`).
 */

import { productLookups } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { parseProductRows, toCommerceProduct } from '@/features/data-installer/services/demoBuilderEngine/productsKind';
import { fakeContext } from './demoBuilderEngine.testUtils';

const SIZE = { attribute_id: 144, attribute_code: 'size', frontend_input: 'select', is_user_defined: true, options: [{ label: 'XS', value: '166' }, { label: '32', value: '178' }] };

async function sizeOf(value: string) {
    const ctx = await fakeContext({ 'products/attributes/size': SIZE });
    ctx.session.setIds.set('Bottom', 9);
    const row = parseProductRows([{ product: { sku: 'MP01-32-Black', name: 'Caesar Warm-Up Pant', attribute_set_id: 'Bottom', type_id: 'simple', custom_attributes: [{ attribute_code: 'size', value }] } }])[0];
    const { product } = (await toCommerceProduct(productLookups(ctx), row, 1)) as { product: { custom_attributes: Array<{ attribute_code: string; value: unknown }> } };
    return product.custom_attributes.find((a) => a.attribute_code === 'size')?.value;
}

describe('a number as a select value', () => {
    it("is the option labelled with it, when there is one", async () => {
        await expect(sizeOf('32')).resolves.toBe('178');
    });

    it("is the option whose id it is, when no option is labelled with it", async () => {
        await expect(sizeOf('166')).resolves.toBe('166');
    });

    it('goes as it is when the attribute has no option of either', async () => {
        await expect(sizeOf('7')).resolves.toBe('7');
    });
});

/**
 * A yes/no attribute written as words. Venia's pack says has_video "No" or "Yes" (all 1,162 products);
 * the Import API takes the words, but a product made over REST was refused: "The "No" value's type is
 * invalid. The "int" type was expected" (live, 2026-11-06, 63 products). As ACCS answers
 * `GET products/attributes/has_video`: frontend_input boolean, backend_type int.
 */
describe('a yes/no attribute written as a word', () => {
    const HAS_VIDEO = { attribute_id: 210, attribute_code: 'has_video', frontend_input: 'boolean', backend_type: 'int', is_user_defined: true };

    async function hasVideo(value: string) {
        const ctx = await fakeContext({ 'products/attributes/has_video': HAS_VIDEO });
        ctx.session.setIds.set('Bottom', 9);
        const row = parseProductRows([{ product: { sku: 'VP08', name: 'Pants', attribute_set_id: 'Bottom', type_id: 'simple', custom_attributes: [{ attribute_code: 'has_video', value }] } }])[0];
        const { product } = (await toCommerceProduct(productLookups(ctx), row, 1)) as { product: { custom_attributes: Array<{ attribute_code: string; value: unknown }> } };
        return product.custom_attributes.find((a) => a.attribute_code === 'has_video')?.value;
    }

    it('goes as 1 or 0, whatever its case', async () => {
        await expect(hasVideo('No')).resolves.toBe('0');
        await expect(hasVideo('yes')).resolves.toBe('1');
    });

    it('CONTROL: a number goes as it is', async () => {
        await expect(hasVideo('1')).resolves.toBe('1');
    });
});
