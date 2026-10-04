/**
 * The one rule both the card and the handler read for "Save to GitHub" and its
 * undo (AB-1c), against the BUNDLED catalog, whose blank starter is
 * skukla/app-builder-shell.
 */

import { promotionVerbOf } from '@/features/app-builder/services/promotionEligibility';
import type { AppBuilderComponentState } from '@/types/base';

const SHELL = { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' };

function state(overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState {
    return { kind: 'integration', status: 'deployed', source: { ...SHELL }, ...overrides };
}

describe('promotionVerbOf', () => {
    it('offers the save on a named blank-starter app', () => {
        expect(promotionVerbOf('order-sync', state())).toEqual({ verb: 'save' });
    });

    it('offers the undo once Demo Builder saved it', () => {
        const saved = state({
            source: { owner: 'steve', repo: 'order-sync' },
            promotion: { from: SHELL, at: '2026-10-05T00:00:00.000Z' },
        });
        expect(promotionVerbOf('order-sync', saved)).toEqual({ verb: 'undo' });
    });

    it.each([
        ['the catalog entry itself, whose redeploy would put the starter back', 'app-builder-shell', state(), /named copy/],
        ['a copy of a pre-built kind', 'erp-x', state({ catalogId: 'app-builder-shell' }), /named copy/],
        ['an imported repository', 'sync', state({ source: { owner: 'acme', repo: 'sync' } }), /own repository, acme\/sync/],
        ['a fork of the starter', 'mine', state({ source: { owner: 'acme', repo: 'app-builder-shell' } }), /own repository/],
        ['the mesh', 'mesh', state({ kind: 'mesh' }), /Only an integration/],
    ])('offers nothing on %s', (_label, id, component, why) => {
        const result = promotionVerbOf(id, component);
        expect(result).toEqual({ refusal: expect.stringMatching(why) });
    });
});
