/**
 * datapackProgressLine — the one line an agent's chat and the background notification read.
 *
 * Walk F161 (owner, 2026-11-16): an uninstall says what it does now and how far, as its window does.
 * Its data types stay pending until it ends, so the line said only "Uninstalling the datapack".
 */

import { datapackProgressLine } from '@/features/data-installer/handlers/importJobWatch';
import type { ImportJobRecord } from '@/features/data-installer/types';

const UNINSTALL: ImportJobRecord = {
    activationId: 'demo-builder-1',
    datapackName: 'luma',
    version: 'main',
    operation: 'reset',
    commerceInstance: 'instance',
    dataTypes: ['products', 'categories'],
    startedAt: '2026-11-16T17:00:00.000Z',
    outcome: 'watching',
    perType: { products: 'pending', categories: 'pending' },
};

describe('datapackProgressLine, for an uninstall', () => {
    it('says it is reading what to take back', () => {
        expect(datapackProgressLine({ ...UNINSTALL, detail: 'Reading what to take back' })).toBe(
            'Uninstalling the datapack: Reading what to take back'
        );
    });

    it('names the data type it takes out and that type’s count', () => {
        expect(datapackProgressLine({ ...UNINSTALL, detail: '1,200 of 2,046 products' })).toBe(
            'Uninstalling the datapack: Uninstalling Products, 1,200 of 2,046'
        );
    });
});
