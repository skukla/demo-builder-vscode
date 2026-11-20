/**
 * The import window draws its rows in `INSTALL_ORDER`; the engine installs in `INSTALLABLE_KINDS`.
 * A data type added to one and not the other would sit in the wrong place, or last.
 */

import {
    INSTALL_ORDER,
    inInstallOrder,
} from '@/features/data-installer/services/demoBuilderEngine/installOrder';
import { INSTALLABLE_KINDS } from '@/features/data-installer/services/demoBuilderEngine/runPack';

describe('INSTALL_ORDER', () => {
    it('is the order the engine installs in', () => {
        expect(INSTALL_ORDER).toEqual(INSTALLABLE_KINDS);
    });
});

describe('inInstallOrder', () => {
    it('puts the kinds asked for in install order, whatever order they were asked in', () => {
        expect(inInstallOrder(['products', 'customer_groups', 'attribute_sets'])).toEqual([
            'attribute_sets',
            'customer_groups',
            'products',
        ]);
    });

    it('puts a kind it does not know last', () => {
        expect(inInstallOrder(['someday_kind', 'products'])).toEqual(['products', 'someday_kind']);
    });
});
