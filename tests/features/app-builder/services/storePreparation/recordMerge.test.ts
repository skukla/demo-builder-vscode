/**
 * recordMerge — a step applied again keeps its first record and adds the new one (AB-77). For
 * the warehouse, that includes the sources it switched back on and each source's hash as the
 * latest apply left it (step 06), which the undo reads to decide whether to switch it off.
 */

import { mergedStepRecord } from '@/features/app-builder/services/storePreparation/recordMerge';
import type { WarehouseStepRecord } from '@/types/storePreparation';

describe('mergedStepRecord, warehouse', () => {
    const FIRST: WarehouseStepRecord = {
        kind: 'warehouse',
        createdSources: ['justrite_warehouse'],
        createdStock: { id: 7, name: 'acme Stock' },
        links: [{ stockId: 7, sourceCode: 'justrite_warehouse' }],
        sourceFingerprints: { justrite_warehouse: 'first' },
    };

    it('keeps the sources switched back on and the latest hash of each source', () => {
        const next: WarehouseStepRecord = {
            kind: 'warehouse',
            createdSources: [],
            links: [{ stockId: 7, sourceCode: 'test_warehouse' }],
            enabledSources: ['justrite_warehouse', 'test_warehouse'],
            sourceFingerprints: { justrite_warehouse: 'again', test_warehouse: 'test' },
        };
        expect(mergedStepRecord(FIRST, next)).toEqual({
            kind: 'warehouse',
            createdSources: ['justrite_warehouse'],
            createdStock: { id: 7, name: 'acme Stock' },
            links: [
                { stockId: 7, sourceCode: 'justrite_warehouse' },
                { stockId: 7, sourceCode: 'test_warehouse' },
            ],
            enabledSources: ['justrite_warehouse', 'test_warehouse'],
            sourceFingerprints: { justrite_warehouse: 'again', test_warehouse: 'test' },
        });
    });

    it('adds no empty lists to a record that had none', () => {
        const { sourceFingerprints: _h, ...plain } = FIRST;
        expect(mergedStepRecord(plain, { kind: 'warehouse', createdSources: [], links: [] })).toEqual(plain);
    });
});
