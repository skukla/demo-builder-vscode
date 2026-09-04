/**
 * commerceSections — the decisions the base suite left unconstrained.
 *
 * Its sibling covers ordering, the ACCS gate and the config-step chain. This one
 * covers what a mutation run showed nothing was holding: which lock reason a gated
 * step names (sign-in, not connection), the backend label lookup and its raw-id
 * fallback, that the label maps are populated for every displayed sub-step,
 * firstOpenSection's current-beats-position precedence and its end-of-list
 * fallback, and the provisional stack when a brand offers no eds candidate.
 */

import {
    commerceSectionStates,
    firstOpenSection,
    provisionalStackForBackend,
    ROW_LABELS,
    SECTION_TITLES,
    type CommerceSectionId,
    type CommerceSectionState,
} from '@/features/project-creation/ui/steps/commerceSections';
import type { DemoPackage } from '@/types/demoPackages';
import { ACCS, PAAS, pkg, state, STACKS } from './commerceSections.testUtils';

describe('firstOpenSection — precedence and the end-of-list fallback', () => {
    function sec(
        id: CommerceSectionId,
        status: CommerceSectionState['status'],
    ): CommerceSectionState {
        return { id, status };
    }

    it('prefers a later `current` section over an earlier openable one', () => {
        // `current` wins on status, not on position: the upcoming Connection sits
        // FIRST, so a plain first-openable scan would answer with it.
        const sections = [sec('connection', 'upcoming'), sec('catalog', 'current')];
        expect(firstOpenSection(sections)).toBe('catalog');
    });

    it('skips a leading locked section when nothing is current', () => {
        const sections = [sec('connection', 'locked'), sec('catalog', 'upcoming')];
        expect(firstOpenSection(sections)).toBe('catalog');
    });

    it('skips a leading done section when nothing is current', () => {
        const sections = [sec('backend', 'done'), sec('connection', 'upcoming')];
        expect(firstOpenSection(sections)).toBe('connection');
    });

    it('falls back to the LAST section when every section is done or locked', () => {
        // Nothing is openable, so there is no id to answer with except the final
        // one — the branch that runs when the walk falls off the end.
        const sections = [
            sec('backend', 'done'),
            sec('connection', 'done'),
            sec('catalog', 'locked'),
        ];
        expect(firstOpenSection(sections)).toBe('catalog');
    });
});

describe('commerceSectionStates — the backend label lookup', () => {
    it('shows the human label for a known backend, not the raw id', () => {
        const sections = commerceSectionStates(state({ selectedBackend: PAAS }), {
            isAccs: false,
            signedIn: false,
        });
        expect(sections.find((s) => s.id === 'backend')?.value).toBe('Adobe Commerce (PaaS)');
    });

    it('shows the human label for ACCS too', () => {
        const sections = commerceSectionStates(state({ selectedBackend: ACCS }), {
            isAccs: true,
            signedIn: true,
        });
        expect(sections.find((s) => s.id === 'backend')?.value).toBe(
            'Adobe Commerce (ACCS / SaaS)',
        );
    });

    it('falls back to the raw id for a backend with no label', () => {
        // A catalog-added backend with no BACKEND_LABELS row must still show
        // SOMETHING — the summary row reads "Not set" on an undefined value.
        const sections = commerceSectionStates(state({ selectedBackend: 'future-backend' }), {
            isAccs: false,
            signedIn: false,
        });
        expect(sections.find((s) => s.id === 'backend')?.value).toBe('future-backend');
    });
});

describe('ROW_LABELS / SECTION_TITLES — every displayed section has a label', () => {
    // ACCS shows all six sub-steps, so this walks the full id set.
    const allSections = commerceSectionStates(state({ selectedBackend: ACCS }), {
        isAccs: true,
        signedIn: false,
    });

    it('gives every displayed section a summary-row label', () => {
        expect(allSections).toHaveLength(6);
        for (const s of allSections) {
            expect(typeof ROW_LABELS[s.id]).toBe('string');
            expect(ROW_LABELS[s.id].length).toBeGreaterThan(0);
        }
    });

    it('gives every displayed section a step-list title', () => {
        for (const s of allSections) {
            expect(typeof SECTION_TITLES[s.id]).toBe('string');
            expect(SECTION_TITLES[s.id].length).toBeGreaterThan(0);
        }
    });
});

describe('commerceSectionStates — a gated step names the sign-in, not the connection', () => {
    it('locks business-structure and catalog on the SIGN-IN reason while gated', () => {
        const sections = commerceSectionStates(state({ selectedBackend: ACCS }), {
            isAccs: true,
            signedIn: false,
        });
        expect(sections.find((s) => s.id === 'business-structure')?.lockReason).toBe(
            'Sign in to Adobe first',
        );
        expect(sections.find((s) => s.id === 'catalog')?.lockReason).toBe(
            'Sign in to Adobe first',
        );
    });

    it('keeps the sign-in reason even when a connection verdict is already true', () => {
        // A persisted connectValid from an earlier signed-in session must not
        // downgrade the reason to "Connect to Commerce first" — the user cannot act
        // on the connection while the sign-in gate is shut.
        const sections = commerceSectionStates(
            state({ selectedBackend: ACCS, commerceConnectValid: true }),
            { isAccs: true, signedIn: false },
        );
        expect(sections.find((s) => s.id === 'business-structure')?.lockReason).toBe(
            'Sign in to Adobe first',
        );
        expect(sections.find((s) => s.id === 'catalog')?.lockReason).toBe(
            'Sign in to Adobe first',
        );
    });

    it('leaves business-structure upcoming — not done — while no store view is chosen', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceConnectValid: true }),
            { isAccs: false, signedIn: false },
        );
        const business = sections.find((s) => s.id === 'business-structure');
        expect(business?.status).toBe('upcoming');
        expect(business?.value).toBeUndefined();
    });
});

describe('provisionalStackForBackend — no eds candidate', () => {
    it('falls back to the first candidate when the brand offers no eds stack', () => {
        const citisignal = pkg('citisignal');
        const headlessOnly: DemoPackage = {
            ...citisignal,
            storefronts: { 'headless-paas': citisignal.storefronts['headless-paas'] },
        };
        expect(provisionalStackForBackend(STACKS, headlessOnly, PAAS)).toBe('headless-paas');
    });
});
