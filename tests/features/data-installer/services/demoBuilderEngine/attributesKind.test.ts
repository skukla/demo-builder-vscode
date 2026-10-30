/**
 * The product_attributes kind: create what the store lacks, add only missing options to what it
 * has, never delete an existing attribute, and record exactly what was made (DI-5).
 */

import {
    ATTRIBUTE_KIND,
    ATTRIBUTE_OPTION_KIND,
    installAttributes,
    parseAttributeRows,
    removeAttribute,
    removeAttributeOption,
} from '@/features/data-installer/services/demoBuilderEngine/attributesKind';
import { attributePackForm } from '@/features/data-installer/services/demoBuilderEngine/packForm';
import type { StoreAttribute } from '@/features/data-installer/services/demoBuilderEngine/productLookups';
import { type SentCall, fakeContext } from './demoBuilderEngine.testUtils';

const FABRIC = {
    attribute: {
        attribute_code: 'bodea_fabric',
        frontend_input: 'select',
        options: [{ label: 'Canvas' }, { label: 'Nylon' }],
        frontend_labels: [{ store_id: 7, label: 'Fabric' }],
    },
};

describe('parseAttributeRows', () => {
    it('accepts the rows a pack holds', () => {
        expect(parseAttributeRows([FABRIC])).toHaveLength(1);
    });

    it('refuses a crafted attribute code before anything reaches Commerce', () => {
        const row = { attribute: { ...FABRIC.attribute, attribute_code: '../../customers/5' } };

        expect(() => parseAttributeRows([row])).toThrow(/not a Commerce attribute code/);
    });

        it('refuses a row with no attribute code', () => {
        expect(() => parseAttributeRows([{ attribute: { frontend_input: 'text' } }])).toThrow(/product attributes/);
    });
});

describe('installAttributes', () => {
    it('creates an attribute the store lacks, with its labels on this store, and records it', async () => {
        const ctx = await fakeContext();

        await installAttributes(ctx, parseAttributeRows([FABRIC]));

        expect(ctx.sent).toEqual([
            {
                method: 'POST',
                path: 'products/attributes',
                body: { attribute: { ...FABRIC.attribute, frontend_labels: [{ store_id: 1, label: 'Fabric' }] } },
            },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: ATTRIBUTE_KIND, id: 'bodea_fabric' }]);
    });

    it('never sends the source store\'s attribute id', async () => {
        const ctx = await fakeContext();
        const row = { attribute: { ...FABRIC.attribute, attribute_id: 912 } };

        await installAttributes(ctx, parseAttributeRows([row]));

        expect(ctx.sent[0].body).not.toHaveProperty('attribute.attribute_id');
    });

    it('leaves an existing attribute alone, adding and recording only the options it lacks', async () => {
        let options = [{ label: ' ', value: '' }, { label: 'canvas', value: '50' }];
        const ctx = await fakeContext(
            {
                'products/attributes/bodea_fabric': { attribute_code: 'bodea_fabric' },
                'products/attributes/bodea_fabric/options': () => options,
            },
            (call) => {
                if (call.path.endsWith('/options')) options = [...options, { label: 'Nylon', value: '51' }];
                return '51';
            },
        );

        await installAttributes(ctx, parseAttributeRows([FABRIC]));

        expect(ctx.sent).toEqual([
            { method: 'POST', path: 'products/attributes/bodea_fabric/options', body: { option: { label: 'Nylon' } } },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: ATTRIBUTE_OPTION_KIND, id: 'bodea_fabric/51' }]);
        expect(ctx.sent.some((c) => c.method === 'DELETE')).toBe(false);
    });

    it('fails when Commerce does not keep an option it was sent', async () => {
        const ctx = await fakeContext({
            'products/attributes/bodea_fabric': { attribute_code: 'bodea_fabric' },
            'products/attributes/bodea_fabric/options': [{ label: 'Canvas', value: '50' }],
        });

        await expect(installAttributes(ctx, parseAttributeRows([FABRIC]))).rejects.toThrow(
            'Commerce did not keep the option "Nylon" on bodea_fabric.',
        );
    });

    it('on a re-run, skips an attribute it created last time', async () => {
        const ctx = await fakeContext({ 'products/attributes/bodea_fabric': { attribute_code: 'bodea_fabric' } });
        await ctx.recorder.record({ kind: ATTRIBUTE_KIND, id: 'bodea_fabric' });

        await installAttributes(ctx, parseAttributeRows([FABRIC]));

        expect(ctx.sent).toStrictEqual([]);
    });

});

/**
 * Swatches, in the service's two steps (`ProductAttributeImportProcessor.js` L338-352, L475-525):
 * the attribute without its options or default, then each option through the options route,
 * whose `value` is the swatch (a colour or a text), not an option id. The row is the service's own
 * test row (`ProductAttributeImportProcessor.test.js` L260-306); no kept pack is known to carry one.
 */
describe('swatch attributes', () => {
    const COLOR = {
        attribute: {
            attribute_code: 'cs_color',
            frontend_input: 'swatch_visual',
            default_frontend_label: 'Color',
            default_value: '14',
            options: [
                { label: 'Black', value: '#1d1d1d', sort_order: 0, is_default: true },
                { label: 'Blue', value: '#286785', sort_order: 1, is_default: false },
            ],
        },
    };

    it('makes the attribute without its options, records it, then adds each option with its swatch', async () => {
        const ctx = await fakeContext();

        await installAttributes(ctx, parseAttributeRows([COLOR]));

        expect(ctx.sent).toEqual<SentCall[]>([
            { method: 'POST', path: 'products/attributes', body: { attribute: { attribute_code: 'cs_color', frontend_input: 'swatch_visual', default_frontend_label: 'Color' } } },
            { method: 'POST', path: 'products/attributes/cs_color/options', body: { option: { label: 'Black', value: '#1d1d1d', sort_order: 0, is_default: true } } },
            { method: 'POST', path: 'products/attributes/cs_color/options', body: { option: { label: 'Blue', value: '#286785', sort_order: 1, is_default: false } } },
        ]);
        // Its options go with it on removal, so only the attribute is recorded.
        expect(ctx.recorder.created).toEqual([{ kind: ATTRIBUTE_KIND, id: 'cs_color' }]);
    });

    it('adds the options a store\'s own swatch lacks with their swatch, and records each', async () => {
        let options = [{ label: 'Black', value: '60' }];
        const ctx = await fakeContext(
            {
                'products/attributes/cs_color': { attribute_code: 'cs_color', frontend_input: 'swatch_visual' },
                'products/attributes/cs_color/options': () => options,
            },
            (call) => {
                if (call.path.endsWith('/options')) options = [...options, { label: 'Blue', value: '61' }];
                return '61';
            },
        );

        await installAttributes(ctx, parseAttributeRows([COLOR]));

        expect(ctx.sent).toEqual<SentCall[]>([
            { method: 'POST', path: 'products/attributes/cs_color/options', body: { option: { label: 'Blue', value: '#286785', sort_order: 1, is_default: false } } },
        ]);
        expect(ctx.recorder.created).toEqual([{ kind: ATTRIBUTE_OPTION_KIND, id: 'cs_color/61' }]);
    });

    // What Commerce answers as a swatch's `frontend_input` is not captured in this repo, so both
    // forms our save could write are pinned: a swatch input, or the plain dropdown it is stored as.
    it('reinstalls a swatch our save wrote, whichever input Commerce answered it with', async () => {
        const stored: StoreAttribute = {
            attribute_id: 93,
            attribute_code: 'cs_color',
            frontend_input: 'swatch_text',
            is_user_defined: true,
            options: [{ label: ' ', value: '' }, { label: 'Black', value: '60' }],
        };
        const asSwatch = await fakeContext();
        const asDropdown = await fakeContext();

        await installAttributes(asSwatch, parseAttributeRows([attributePackForm(stored)]));
        await installAttributes(asDropdown, parseAttributeRows([attributePackForm({ ...stored, frontend_input: 'select' })]));

        expect(asSwatch.sent.map((c) => c.path)).toEqual(['products/attributes', 'products/attributes/cs_color/options']);
        expect(asSwatch.sent[1].body).toEqual({ option: { label: 'Black', value: 'Black', sort_order: 0, is_default: false } });
        expect(asDropdown.sent.map((c) => c.path)).toEqual(['products/attributes']);
        expect(asDropdown.recorder.created).toEqual([{ kind: ATTRIBUTE_KIND, id: 'cs_color' }]);
    });
});

describe('removal', () => {
    it('deletes an attribute it created', async () => {
        const ctx = await fakeContext();

        await removeAttribute(ctx.send, 'bodea_fabric');

        expect(ctx.sent).toEqual([{ method: 'DELETE', path: 'products/attributes/bodea_fabric', body: undefined }]);
    });

    it('deletes only the option it added', async () => {
        const ctx = await fakeContext();

        await removeAttributeOption(ctx.send, 'bodea_fabric/51');

        expect(ctx.sent).toEqual([
            { method: 'DELETE', path: 'products/attributes/bodea_fabric/options/51', body: undefined },
        ]);
    });
});
