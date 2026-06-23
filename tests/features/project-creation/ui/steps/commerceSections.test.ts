/**
 * commerceSections tests (v6 Commerce slice — Step 1)
 *
 * Pure module covering (a) backend→stack resolution against a brand's allowed
 * stacks (unique / ambiguous / 0-candidate + provisional), (b) the ordered set
 * of backends a brand offers, and (c) the ordered Commerce section-state model
 * transcribed from the prototype's renderCommerce() (current/done/upcoming/locked
 * + lock reasons + values). Side-effect-free; derives from persisted wizard state.
 */

import stacksConfig from '@/features/project-creation/config/stacks.json';
import demoPackagesConfig from '@/features/project-creation/config/demo-packages.json';
import {
    resolveStackForBackend,
    provisionalStackForBackend,
    availableBackendsForPackage,
    commerceSectionStates,
    type CommerceSectionId,
} from '@/features/project-creation/ui/steps/commerceSections';
import type { DemoPackage, DemoPackagesConfig } from '@/types/demoPackages';
import type { StacksConfig } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

const STACKS = (stacksConfig as StacksConfig).stacks;
const PACKAGES = (demoPackagesConfig as DemoPackagesConfig).packages;

const PAAS = 'adobe-commerce-paas';
const ACCS = 'adobe-commerce-accs';

function pkg(id: string): DemoPackage {
    const found = PACKAGES.find(p => p.id === id);
    if (!found) throw new Error(`test package not found: ${id}`);
    return found;
}

function state(overrides: Partial<WizardState> = {}): WizardState {
    return overrides as WizardState;
}

describe('resolveStackForBackend', () => {
    it('resolves a unique stack for citisignal + ACCS (only eds-accs)', () => {
        const result = resolveStackForBackend(STACKS, pkg('citisignal'), ACCS);
        expect(result).toEqual({ stackId: 'eds-accs', candidates: ['eds-accs'], ambiguous: false });
    });

    it('is ambiguous for citisignal + PaaS (headless-paas + eds-paas)', () => {
        const result = resolveStackForBackend(STACKS, pkg('citisignal'), PAAS);
        expect(result.stackId).toBeNull();
        expect(result.ambiguous).toBe(true);
        expect(result.candidates.sort()).toEqual(['eds-paas', 'headless-paas']);
    });

    it('returns 0 candidates (not ambiguous) for buildright + ACCS', () => {
        const result = resolveStackForBackend(STACKS, pkg('buildright'), ACCS);
        expect(result).toEqual({ stackId: null, candidates: [], ambiguous: false });
    });

    it('resolves uniquely for buildright + PaaS (only eds-paas)', () => {
        const result = resolveStackForBackend(STACKS, pkg('buildright'), PAAS);
        expect(result).toEqual({ stackId: 'eds-paas', candidates: ['eds-paas'], ambiguous: false });
    });

    it('resolves uniquely for isle5 + PaaS (only eds-paas)', () => {
        const result = resolveStackForBackend(STACKS, pkg('isle5'), PAAS);
        expect(result).toEqual({ stackId: 'eds-paas', candidates: ['eds-paas'], ambiguous: false });
    });

    it('narrows the ambiguous case to a unique stack when a frontend is supplied', () => {
        const result = resolveStackForBackend(STACKS, pkg('citisignal'), PAAS, 'eds-storefront');
        expect(result).toEqual({ stackId: 'eds-paas', candidates: ['eds-paas'], ambiguous: false });
    });

    it('narrows to headless when the headless frontend is supplied', () => {
        const result = resolveStackForBackend(STACKS, pkg('citisignal'), PAAS, 'headless');
        expect(result).toEqual({
            stackId: 'headless-paas',
            candidates: ['headless-paas'],
            ambiguous: false,
        });
    });
});

describe('provisionalStackForBackend', () => {
    it('returns the unique stack id when unambiguous', () => {
        expect(provisionalStackForBackend(STACKS, pkg('citisignal'), ACCS)).toBe('eds-accs');
    });

    it('prefers the eds-storefront candidate when ambiguous (citisignal + PaaS)', () => {
        expect(provisionalStackForBackend(STACKS, pkg('citisignal'), PAAS)).toBe('eds-paas');
    });

    it('returns null when the backend is unavailable for the brand', () => {
        expect(provisionalStackForBackend(STACKS, pkg('buildright'), ACCS)).toBeNull();
    });
});

describe('availableBackendsForPackage', () => {
    it('offers [paas, accs] for citisignal', () => {
        expect(availableBackendsForPackage(STACKS, pkg('citisignal'))).toEqual([PAAS, ACCS]);
    });

    it('offers [paas, accs] for isle5', () => {
        expect(availableBackendsForPackage(STACKS, pkg('isle5'))).toEqual([PAAS, ACCS]);
    });

    it('offers only [paas] for buildright', () => {
        expect(availableBackendsForPackage(STACKS, pkg('buildright'))).toEqual([PAAS]);
    });

    it('returns unique backend ids (no duplicates)', () => {
        const backends = availableBackendsForPackage(STACKS, pkg('citisignal'));
        expect(new Set(backends).size).toBe(backends.length);
    });
});

describe('commerceSectionStates — ordering and base (PaaS, no sign-in)', () => {
    it('omits the sign-in section for PaaS and orders the rest', () => {
        const sections = commerceSectionStates(state(), { isAccs: false, signedIn: false });
        expect(sections.map(s => s.id)).toEqual([
            'backend',
            'connection',
            'business-structure',
            'catalog',
        ] as CommerceSectionId[]);
    });

    it('marks backend current when no backend chosen yet', () => {
        const sections = commerceSectionStates(state(), { isAccs: false, signedIn: false });
        expect(sections.find(s => s.id === 'backend')?.status).toBe('current');
    });

    it('marks backend done with a value once selectedBackend is set', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS }),
            { isAccs: false, signedIn: false },
        );
        const backend = sections.find(s => s.id === 'backend');
        expect(backend?.status).toBe('done');
        expect(backend?.value).toBeTruthy();
    });
});

describe('commerceSectionStates — ACCS sign-in gate', () => {
    it('includes a current sign-in section when ACCS and not signed in', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: ACCS }),
            { isAccs: true, signedIn: false },
        );
        const signin = sections.find(s => s.id === 'signin');
        expect(signin?.status).toBe('current');
    });

    it('locks connection, business-structure, and catalog until signed in', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: ACCS }),
            { isAccs: true, signedIn: false },
        );
        for (const id of ['connection', 'business-structure', 'catalog'] as CommerceSectionId[]) {
            const sec = sections.find(s => s.id === id);
            expect(sec?.status).toBe('locked');
            expect(sec?.lockReason).toBeTruthy();
        }
    });

    it('omits the sign-in section once signed in (ACCS)', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: ACCS }),
            { isAccs: true, signedIn: true },
        );
        expect(sections.find(s => s.id === 'signin')).toBeUndefined();
    });
});

describe('commerceSectionStates — connection / business / catalog progression', () => {
    it('marks connection done when commerceConnectValid is true', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceConnectValid: true }),
            { isAccs: false, signedIn: false },
        );
        expect(sections.find(s => s.id === 'connection')?.status).toBe('done');
    });

    it('marks business-structure done when commerceStoreViewChosen is true', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceStoreViewChosen: true }),
            { isAccs: false, signedIn: false },
        );
        expect(sections.find(s => s.id === 'business-structure')?.status).toBe('done');
    });

    it('locks catalog with a reason until a store view is chosen', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS }),
            { isAccs: false, signedIn: false },
        );
        const catalog = sections.find(s => s.id === 'catalog');
        expect(catalog?.status).toBe('locked');
        expect(catalog?.lockReason).toBe('Choose a store view first');
    });

    it('unlocks catalog once a store view is chosen', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceStoreViewChosen: true }),
            { isAccs: false, signedIn: false },
        );
        expect(sections.find(s => s.id === 'catalog')?.status).not.toBe('locked');
    });
});
