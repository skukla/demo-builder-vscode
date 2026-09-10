/**
 * areaSubSteps — the WALK: which sub-step opens, what Continue and Back move to, and
 * what entering an area from either end sets.
 *
 * The registry's sibling suite covers WHICH driver an area gets and what each driver
 * lists. This one covers the generic machinery underneath both of them — `firstOpen`,
 * `nextOf`, `prevOf` — which is where an off-by-one puts the SC on the wrong sub-step
 * with every list still rendering correctly.
 *
 * The Commerce driver is the vehicle because its statuses are reachable from plain
 * wizard state: a fresh project opens on `backend` (current), a chosen backend leaves
 * `backend` done with `connection` the first OPEN one, and a fully configured project
 * has no open sub-step at all — the three shapes the generic helpers branch on.
 */

import {
    areaSubSteps,
    requireAreaSubSteps,
} from '@/features/project-creation/ui/steps/areaSubSteps';
import type { WizardState } from '@/types/webview';
import {
    ACCS_BACKEND,
    ALL_DONE,
    BACKEND_CHOSEN,
    FRESH,
    state,
} from './areaSubSteps.testUtils';

const commerce = requireAreaSubSteps('commerce');

describe('areaSubSteps — which sub-step opens', () => {
    it('opens the one marked current, even when it is not first in the list', () => {
        expect(commerce.subSteps(FRESH).map((s) => s.status)[0]).toBe('current');
        expect(commerce.active(FRESH)).toBe('backend');
    });

    it('opens the first OPEN one when nothing is current — skipping what is done', () => {
        // `backend` is done and `business-structure` / `catalog` are locked, so the
        // first sub-step that can actually be worked on is Connection.
        expect(commerce.subSteps(BACKEND_CHOSEN).map((s) => s.status)).toEqual([
            'done',
            'upcoming',
            'locked',
            'locked',
            'done',
        ]);
        expect(commerce.active(BACKEND_CHOSEN)).toBe('connection');
    });

    it('falls back to the LAST sub-step when none is open', () => {
        expect(commerce.subSteps(ALL_DONE).every((s) => s.status === 'done')).toBe(true);
        expect(commerce.active(ALL_DONE)).toBe('sample-data');
    });

    it('prefers the sub-step the SC is actually on over any of that', () => {
        expect(commerce.active(state({ ...BACKEND_CHOSEN, activeCommerceStep: 'catalog' }))).toBe(
            'catalog',
        );
    });
});

describe('areaSubSteps — Continue and Back', () => {
    const on = (id: WizardState['activeCommerceStep']) =>
        state({ ...BACKEND_CHOSEN, activeCommerceStep: id });

    it('moves to the sub-step after the active one, not to the second in the list', () => {
        expect(commerce.next(on('connection'))).toBe('business-structure');
        expect(commerce.next(on('business-structure'))).toBe('catalog');
    });

    it('stops at the end rather than running off it', () => {
        expect(commerce.next(on('sample-data'))).toBeNull();
    });

    it('moves to the sub-step before the active one', () => {
        expect(commerce.prev(on('connection'))).toBe('backend');
        expect(commerce.prev(on('catalog'))).toBe('business-structure');
    });

    it('stops at the start rather than running off it', () => {
        expect(commerce.prev(on('backend'))).toBeNull();
    });

    it('answers null for a sub-step id that is not in the list at all', () => {
        const stray = state({
            ...BACKEND_CHOSEN,
            activeCommerceStep: 'signin' as WizardState['activeCommerceStep'],
        });
        // 'signin' only exists for the ACCS backend; on PaaS it is not a sub-step.
        expect(commerce.next(stray)).toBeNull();
        expect(commerce.prev(stray)).toBeNull();
    });
});

describe('areaSubSteps — entering an area from either end', () => {
    it('enters at the first open sub-step going forwards', () => {
        expect(commerce.entry(BACKEND_CHOSEN, false)).toEqual({
            activeCommerceStep: 'connection',
        });
    });

    it('enters at the LAST sub-step coming back into the area', () => {
        expect(commerce.entry(BACKEND_CHOSEN, true)).toEqual({
            activeCommerceStep: 'sample-data',
        });
    });
});

describe('areaSubSteps — the ACCS sign-in sub-step', () => {
    it('adds it for the ACCS backend and leaves it out for PaaS', () => {
        const accs = state({ selectedBackend: ACCS_BACKEND });

        expect(commerce.subSteps(accs).map((s) => s.id)).toEqual([
            'backend',
            'signin',
            'connection',
            'business-structure',
            'catalog',
            'sample-data',
        ]);
        expect(commerce.subSteps(BACKEND_CHOSEN).map((s) => s.id)).not.toContain('signin');
    });

    it('locks the Commerce steps behind it until the SC has signed in', () => {
        const accs = state({ selectedBackend: ACCS_BACKEND });

        const connection = commerce.subSteps(accs).find((s) => s.id === 'connection');
        expect(connection?.status).toBe('locked');
        expect(connection?.lockReason).toBe('Sign in to Adobe first');
    });
});

describe('areaSubSteps — the Commerce commit ledger', () => {
    it('gates each sub-step on its own state', () => {
        expect(commerce.isComplete(FRESH, 'backend')).toBe(false);
        expect(commerce.isComplete(BACKEND_CHOSEN, 'backend')).toBe(true);
        expect(commerce.isComplete(BACKEND_CHOSEN, 'connection')).toBe(false);
        expect(commerce.isComplete(ALL_DONE, 'connection')).toBe(true);
    });

    it('drops the target and everything after it when the SC walks back', () => {
        const committed = state({
            ...BACKEND_CHOSEN,
            committedCommerceSteps: ['backend', 'connection', 'business-structure'],
        } as Partial<WizardState>);
        const order = ['backend', 'connection', 'business-structure', 'catalog', 'sample-data'];

        expect(commerce.uncommit(committed, order, 'connection')).toEqual({
            committedCommerceSteps: ['backend'],
        });
    });
});

describe('requireAreaSubSteps', () => {
    it('returns the driver for an area that has one', () => {
        expect(requireAreaSubSteps('storefront')).toBe(areaSubSteps('storefront'));
    });

    it('fails fast for an area that has none, rather than handing back a null', () => {
        expect(() => requireAreaSubSteps('integrations')).toThrow(/integrations/);
    });
});
