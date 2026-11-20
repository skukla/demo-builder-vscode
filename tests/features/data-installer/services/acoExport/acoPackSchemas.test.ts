/**
 * Every ACO kind is checked against the service's own schema before it is saved, as the
 * service checks it (`AcoCatalogExportProcessor.js`, e.g. L298-312). The schemas are its files,
 * copied verbatim (`config/aco-schemas/`).
 */

import { acoRowsProblem } from '@/features/data-installer/services/acoExport/acoPackSchemas';
import type { AcoCategoryRow, AcoPriceBookRow } from '@/types/acoPack';

describe('acoRowsProblem', () => {
    it("passes rows the service's schema accepts", () => {
        const rows: AcoPriceBookRow[] = [
            { priceBookId: 'base', name: 'Main Website', currency: 'USD' },
            { priceBookId: 'base:general', parentId: 'base', name: 'General (Main Website)' },
        ];
        expect(acoRowsProblem('aco_price_books', rows)).toBeUndefined();
    });

    it('names what the schema refused, and where', () => {
        const rows: AcoCategoryRow[] = [
            {
                slug: 'men',
                source: { locale: 'default' },
                name: 'x'.repeat(129),
                description: null,
            },
        ];

        expect(acoRowsProblem('aco_categories', rows)).toMatch(
            /^\/0\/name must NOT have more than 128 characters/u
        );
    });

    it('refuses a root book with no currency, as the schema requires one', () => {
        const rows = [
            { priceBookId: 'base', name: 'Main Website' },
        ] as unknown as AcoPriceBookRow[];
        expect(acoRowsProblem('aco_price_books', rows)).toMatch(/currency/u);
    });
});
