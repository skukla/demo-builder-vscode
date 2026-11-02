/**
 * Assign products: the body has no height of its own, so it fits the table, and the table's height
 * (set by `AssignProductList`) is capped by the room the window leaves. One fixed height left three
 * rows over 290px of empty space.
 */

import { ruleFor } from '../../../../helpers/cssRules';

describe('the Assign products body', () => {
    const body = () => ruleFor('.assign-products-body');

    it('holds no height of its own', () => {
        expect(body()).not.toMatch(/(^|[^-])height:/);
    });

    it('gives the table a cap, off the dialog\'s own limit', () => {
        expect(body()).toMatch(/--assign-list-cap:\s*calc\(min\(640px, 84vh - 185px\) - 128px\)/);
    });

    it('leaves room in the cap for the attribute-set warning', () => {
        expect(ruleFor('.assign-products-body:has(.assign-sets-note)')).toMatch(/- 184px/);
    });

    it('keeps the warning\'s link at body size, so it reads easily', () => {
        expect(ruleFor('.assign-sets-note .inline-action-link')).toMatch(/font-size:\s*14px/);
    });
});
