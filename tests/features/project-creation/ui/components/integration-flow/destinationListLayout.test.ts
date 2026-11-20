/**
 * The project and workspace lists in the Add Integration dialog: as tall as their rows up to a cap,
 * with no box of their own. A definite height left two rows over about 360px of empty box. The
 * rules are scoped to the dialog, so the wizard's own use of the list keeps its frame: `SearchableList`
 * takes no prop for it.
 */

import { ruleFor } from '../../../../../helpers/cssRules';

describe('the destination list in the dialog', () => {
    const list = () => ruleFor('.intflow-destination .list-refresh-container');

    it('fits its rows up to a cap, rather than holding one height', () => {
        expect(list()).toMatch(/max-height:/);
        expect(list()).not.toMatch(/(^|[^-])height:/);
    });

    it('caps off the dialog\'s own limit, so the body never scrolls past the list', () => {
        expect(list()).toMatch(/84vh/);
    });

    it('draws no box border or background of its own', () => {
        const rows = ruleFor('.intflow-destination .list-refresh-container .flex-1');
        expect(rows).toMatch(/border:\s*none/);
        expect(rows).toMatch(/background:\s*transparent/);
    });
});
