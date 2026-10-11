/**
 * Every setup step's `fix` in the bundled catalog validates against the schema's `fix`
 * (AB-77): a settings fix as data, or a named handler. The schema is the only thing that
 * says what a config fix may carry, so a JSON-only fix on a second entry is checked here
 * before any code reads it. With a positive control: a malformed fix is refused.
 */

import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_DIR = path.join(__dirname, '../../../../src/features/components/config');
const schema = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'app-builder-components.schema.json'), 'utf-8'));
const catalog = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'app-builder-components.json'), 'utf-8'));

const fixSchema = schema.definitions.appBuilderComponent.properties.setupSteps.items.properties.fix;
const validateFix = new Ajv({ strict: false }).compile(fixSchema);
const validateCatalog = new Ajv({ strict: false }).compile(schema);

interface Step {
    id: string;
    fix?: unknown;
}
interface Entry {
    id: string;
    setupSteps?: Step[];
}

const stepsWithFix = (catalog.appBuilderComponents as Entry[]).flatMap((entry) =>
    (entry.setupSteps ?? []).filter((step) => step.fix !== undefined).map((step) => [`${entry.id}/${step.id}`, step.fix] as const),
);

describe('setup step fixes in the bundled catalog', () => {
    it('the whole catalog validates against its schema', () => {
        expect(validateCatalog(catalog) ? [] : validateCatalog.errors).toStrictEqual([]);
    });

    it('every declared fix validates, and the ERP integration declares the nine-step set', () => {
        expect(stepsWithFix.length).toBeGreaterThan(0);
        for (const [where, fix] of stepsWithFix) {
            expect({ where, errors: validateFix(fix) ? [] : validateFix.errors }).toEqual({ where, errors: [] });
        }
        const erp = (catalog.appBuilderComponents as Entry[]).find((entry) => entry.id === 'erp-integration');
        const byId = Object.fromEntries((erp?.setupSteps ?? []).map((step) => [step.id, step.fix]));
        expect(byId).toEqual({
            'confirmed-status': undefined,
            'company-catalogs': { kind: 'handler', handler: 'company-shared-catalogs' },
            'price-scope-website': { kind: 'config', items: [{ path: 'catalog/price/scope', value: '1', scope: 'default' }] },
            'second-source': { kind: 'handler', handler: 'erp-warehouse-in-website-stock' },
            'erp-attributes': { kind: 'handler', handler: 'create-erp-attributes' },
            'partially-held-status': undefined,
            'payment-on-account': { kind: 'config', items: [{ path: 'payment/companycredit/active', value: '1', scope: 'website' }] },
            'storefront-returns': { kind: 'config', items: [{ path: 'sales/magento_rma/enabled', value: '1', scope: 'website' }] },
            'card-payments': {
                kind: 'config',
                items: [{ path: 'payment/payment_services/active', value: '1', scope: 'website' }],
                manual: expect.stringContaining('PayPal sandbox'),
            },
        });
    });

    it('CONTROL: a malformed fix is refused', () => {
        expect(validateFix({ kind: 'config', items: [{ path: 'no-slashes', value: '1', scope: 'default' }] })).toBe(false);
        expect(validateFix({ kind: 'config', items: [{ path: 'a/b/c', value: 1, scope: 'default' }] })).toBe(false);
        expect(validateFix({ kind: 'handler', handler: 'add-erp-owner-to-attribute-sets' })).toBe(false);
        expect(validateFix('add-erp-owner-to-attribute-sets')).toBe(false);
    });
});
