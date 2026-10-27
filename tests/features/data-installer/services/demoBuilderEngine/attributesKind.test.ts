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
import { fakeContext } from './demoBuilderEngine.testUtils';

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

    it('refuses a swatch attribute rather than half-installing it', async () => {
        const ctx = await fakeContext();
        const row = { attribute: { ...FABRIC.attribute, frontend_input: 'swatch_visual' } };

        await expect(installAttributes(ctx, parseAttributeRows([row]))).rejects.toThrow(/swatch/);
        expect(ctx.sent).toStrictEqual([]);
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
