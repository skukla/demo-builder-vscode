/**
 * The integration flyout's labels: small, muted, sentence case, never capitals (dialog design
 * rules). Asserted against the stylesheet: the source already says "Demo setup" and "Deployed", and
 * the capitals only ever came from `text-transform`, which jsdom does not apply.
 */

import { ruleFor } from '../../../../../helpers/cssRules';

describe('the flyout writes its labels in sentence case', () => {
    it('section labels ("Demo setup", "Actions") carry no capitals', () => {
        const rule = ruleFor('.integration-panel-section-label');

        expect(rule).not.toMatch(/text-transform/);
        expect(rule).not.toMatch(/letter-spacing/);
        expect(rule).toMatch(/font-size:\s*12px/);
    });

    it('the status in its health line carries none either', () => {
        const rule = ruleFor('.integration-panel-health .integration-card-status');

        expect(rule).toMatch(/text-transform:\s*none/);
        expect(rule).toMatch(/letter-spacing:\s*normal/);
    });

    it('CONTROL: the card keeps the house capitals it shares with the project card', () => {
        expect(ruleFor('.integration-card-status')).toMatch(/text-transform:\s*uppercase/);
    });
});
