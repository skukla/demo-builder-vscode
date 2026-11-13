/**
 * The styles the dialog design rules rest on, which every webview suite's mocks cannot see: a
 * problem note is small and takes its colour from the status class, a confirm's rows sit 8 apart,
 * and the progress window's spinner sits in a middle row with equal room above and below. A
 * browser measured those; this keeps the rules that produced the measurements.
 */

import { ruleFor } from '../../../helpers/cssRules';

describe('dialog styles', () => {
    it('a problem note is small, and has no colour of its own to beat the status class', () => {
        const rule = ruleFor('.dialog-problem');
        expect(rule).toMatch(/font-size:\s*12px/);
        expect(rule).not.toMatch(/(^|[^-])color:/);
    });

    it('CONTROL: a plain note is the muted one', () => {
        expect(ruleFor('.dialog-note')).toMatch(/color:\s*var\(--spectrum-global-color-gray-600\)/);
    });

    it("a confirm's lines sit 8 apart, the rules' spacing between rows", () => {
        expect(ruleFor('.dialog-rows')).toMatch(/gap:\s*8px/);
    });

    // Decisions Phase 1b (J1-3d growth): the status icon appearing at the end grew the title row
    // 3px (measured in the prototype); top-aligned, the row keeps its height.
    it('the title sits at the top of its line, so a status icon does not grow the title row', () => {
        expect(ruleFor('.modal-title')).toMatch(/vertical-align:\s*top/);
    });

    it('the progress window keeps equal rows above and below its spinner', () => {
        expect(ruleFor('.modal-wait-progress')).toMatch(/grid-template-rows:\s*1fr auto 1fr/);
        expect(ruleFor('.modal-wait-progress > [role="status"]')).toMatch(/grid-row:\s*2/);
    });
});
