/**
 * commerceSections tests (v6 Commerce slice — Step 1)
 *
 * Pure module covering (a) backend→stack resolution against a brand's allowed
 * stacks (unique / ambiguous / 0-candidate + provisional), (b) the ordered set
 * of backends a brand offers, and (c) the ordered Commerce section-state model
 * transcribed from the prototype's renderCommerce() (current/done/upcoming/locked
 * + lock reasons + values). Side-effect-free; derives from persisted wizard state.
 */

import {
    resolveStackForBackend,
    provisionalStackForBackend,
    availableBackendsForPackage,
    commerceSectionStates,
    firstOpenSection,
    nextSubStep,
    prevSubStep,
    isCommerceStepComplete,
    type CommerceSectionId,
} from '@/features/project-creation/ui/steps/commerceSections';
import type { WizardState } from '@/types/webview';
import { ACCS, PAAS, pkg, state, STACKS } from './commerceSections.testUtils';

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
        expect(sections.map((s) => s.id)).toEqual([
            'backend',
            'connection',
            'business-structure',
            'catalog',
            // Last, and never gated — it seeds the backend the rest configure.
            'sample-data',
        ] as CommerceSectionId[]);
    });

    it('marks backend current when no backend chosen yet', () => {
        const sections = commerceSectionStates(state(), { isAccs: false, signedIn: false });
        expect(sections.find((s) => s.id === 'backend')?.status).toBe('current');
    });

    it('marks backend done with a value once selectedBackend is set', () => {
        const sections = commerceSectionStates(state({ selectedBackend: PAAS }), {
            isAccs: false,
            signedIn: false,
        });
        const backend = sections.find((s) => s.id === 'backend');
        expect(backend?.status).toBe('done');
        expect(backend?.value).toBeTruthy();
    });
});

describe('commerceSectionStates — ACCS sign-in gate', () => {
    it('includes a current sign-in section when ACCS and not signed in', () => {
        const sections = commerceSectionStates(state({ selectedBackend: ACCS }), {
            isAccs: true,
            signedIn: false,
        });
        const signin = sections.find((s) => s.id === 'signin');
        expect(signin?.status).toBe('current');
    });

    it('locks connection, business-structure, and catalog until signed in', () => {
        const sections = commerceSectionStates(state({ selectedBackend: ACCS }), {
            isAccs: true,
            signedIn: false,
        });
        for (const id of ['connection', 'business-structure', 'catalog'] as CommerceSectionId[]) {
            const sec = sections.find((s) => s.id === id);
            expect(sec?.status).toBe('locked');
            expect(sec?.lockReason).toBeTruthy();
        }
    });

    it('keeps the sign-in section as done (with the org name) once signed in (ACCS)', () => {
        // The Sign-in sub-step must PERSIST so the footer can land on it to show the
        // "Connected" result and the sub-step walk reaches Connection next.
        const sections = commerceSectionStates(
            state({ selectedBackend: ACCS, adobeOrg: { id: 'org-1', name: 'Org One', code: 'ORG1' } }),
            { isAccs: true, signedIn: true }
        );
        const signin = sections.find((s) => s.id === 'signin');
        expect(signin?.status).toBe('done');
        expect(signin?.value).toBe('Org One');
    });

    it('falls back to a plain "Signed in" value when no org name is present (ACCS)', () => {
        const sections = commerceSectionStates(state({ selectedBackend: ACCS }), {
            isAccs: true,
            signedIn: true,
        });
        const signin = sections.find((s) => s.id === 'signin');
        expect(signin?.status).toBe('done');
        expect(signin?.value).toBe('Signed in');
    });

    it('unlocks connection once signed in but keeps business/catalog locked until connection (ACCS)', () => {
        const sections = commerceSectionStates(state({ selectedBackend: ACCS }), {
            isAccs: true,
            signedIn: true,
        });
        expect(sections.find((s) => s.id === 'connection')?.status).not.toBe('locked');
        // Config-step chain: Business Structure / Catalog stay locked until Connection is done.
        for (const id of ['business-structure', 'catalog'] as CommerceSectionId[]) {
            const sec = sections.find((s) => s.id === id);
            expect(sec?.status).toBe('locked');
            expect(sec?.lockReason).toBe('Connect to Commerce first');
        }
    });

    it('omits the sign-in section entirely for PaaS (not ACCS)', () => {
        const sections = commerceSectionStates(state({ selectedBackend: PAAS }), {
            isAccs: false,
            signedIn: true,
        });
        expect(sections.find((s) => s.id === 'signin')).toBeUndefined();
    });
});

describe('commerceSectionStates — connection / business / catalog progression', () => {
    it('marks connection done when commerceConnectValid is true', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceConnectValid: true }),
            { isAccs: false, signedIn: false }
        );
        expect(sections.find((s) => s.id === 'connection')?.status).toBe('done');
    });

    it('marks business-structure done when connection is done and a store view is chosen', () => {
        const sections = commerceSectionStates(
            state({
                selectedBackend: PAAS,
                commerceConnectValid: true,
                commerceStoreViewChosen: true,
            }),
            { isAccs: false, signedIn: false }
        );
        expect(sections.find((s) => s.id === 'business-structure')?.status).toBe('done');
    });

    it('keeps business-structure locked until connection, even with a store view chosen', () => {
        // A package-seeded store-view code must NOT make Business Structure show done
        // before Connection — the config-step chain locks it on connection.
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceStoreViewChosen: true }),
            { isAccs: false, signedIn: false }
        );
        const business = sections.find((s) => s.id === 'business-structure');
        expect(business?.status).toBe('locked');
        expect(business?.lockReason).toBe('Connect to Commerce first');
    });

    it('locks catalog with "Connect to Commerce first" until connection is done', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceStoreViewChosen: true }),
            { isAccs: false, signedIn: false }
        );
        const catalog = sections.find((s) => s.id === 'catalog');
        expect(catalog?.status).toBe('locked');
        expect(catalog?.lockReason).toBe('Connect to Commerce first');
    });

    it('locks catalog with a reason until a store view is chosen (connection done)', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceConnectValid: true }),
            { isAccs: false, signedIn: false }
        );
        const catalog = sections.find((s) => s.id === 'catalog');
        expect(catalog?.status).toBe('locked');
        expect(catalog?.lockReason).toBe('Choose a store view first');
    });

    it('unlocks catalog once connection is done and a store view is chosen', () => {
        const sections = commerceSectionStates(
            state({
                selectedBackend: PAAS,
                commerceConnectValid: true,
                commerceStoreViewChosen: true,
            }),
            { isAccs: false, signedIn: false }
        );
        expect(sections.find((s) => s.id === 'catalog')?.status).not.toBe('locked');
    });
});

describe('commerceSectionStates — summary values for connection / business / catalog', () => {
    const allDone = {
        selectedBackend: PAAS,
        commerceConnectValid: true,
        commerceStoreViewChosen: true,
    };

    it('gives Connection a "Connected" value once done', () => {
        const sections = commerceSectionStates(
            state({ selectedBackend: PAAS, commerceConnectValid: true }),
            { isAccs: false, signedIn: false }
        );
        const connection = sections.find((s) => s.id === 'connection');
        expect(connection?.status).toBe('done');
        expect(connection?.value).toBe('Connected');
    });

    it('gives Business Structure a general "Selected" value once done', () => {
        const sections = commerceSectionStates(state(allDone), { isAccs: false, signedIn: false });
        const business = sections.find((s) => s.id === 'business-structure');
        expect(business?.status).toBe('done');
        expect(business?.value).toBe('Selected');
    });

    it('marks Catalog done with a "Configured" value once connection + store view are done', () => {
        const sections = commerceSectionStates(state(allDone), { isAccs: false, signedIn: false });
        const catalog = sections.find((s) => s.id === 'catalog');
        expect(catalog?.status).toBe('done');
        expect(catalog?.value).toBe('Configured');
    });

    it('carries NO value while a config step is not yet done (so the summary reads "Not set")', () => {
        const sections = commerceSectionStates(state({ selectedBackend: PAAS }), {
            isAccs: false,
            signedIn: false,
        });
        // Connection upcoming → no value; business locked (chain) → no value.
        expect(sections.find((s) => s.id === 'connection')?.value).toBeUndefined();
        expect(sections.find((s) => s.id === 'business-structure')?.value).toBeUndefined();
    });
});

describe('nextSubStep / prevSubStep — linear walk over the displayed sections', () => {
    // PaaS, no sign-in → display order: backend, connection, business-structure, catalog.
    const paasSections = commerceSectionStates(state({ selectedBackend: PAAS }), {
        isAccs: false,
        signedIn: false,
    });
    // ACCS, not signed in → display order includes signin (current) after backend.
    const accsSections = commerceSectionStates(state({ selectedBackend: ACCS }), {
        isAccs: true,
        signedIn: false,
    });
    // ACCS, signed in → signin PERSISTS (done) so the walk still reaches it.
    const accsSignedIn = commerceSectionStates(state({ selectedBackend: ACCS }), {
        isAccs: true,
        signedIn: true,
    });

    it('returns the next id in display order (PaaS: backend → connection)', () => {
        expect(nextSubStep(paasSections, 'backend')).toBe('connection');
    });

    it('returns the next id across the middle (connection → business-structure)', () => {
        expect(nextSubStep(paasSections, 'connection')).toBe('business-structure');
    });

    it('walks past catalog into sample data', () => {
        expect(nextSubStep(paasSections, 'catalog')).toBe('sample-data');
    });

    it('returns null at the last display step (sample-data)', () => {
        expect(nextSubStep(paasSections, 'sample-data')).toBeNull();
    });

    it('walks through the ACCS sign-in step (backend → signin → connection)', () => {
        expect(nextSubStep(accsSections, 'backend')).toBe('signin');
        expect(nextSubStep(accsSections, 'signin')).toBe('connection');
    });

    it('returns null when current is not in the displayed sections', () => {
        // signin is not displayed for PaaS.
        expect(nextSubStep(paasSections, 'signin')).toBeNull();
    });

    it('returns the previous id in display order (connection → backend)', () => {
        expect(prevSubStep(paasSections, 'connection')).toBe('backend');
    });

    it('returns the previous id across the middle (catalog → business-structure)', () => {
        expect(prevSubStep(paasSections, 'catalog')).toBe('business-structure');
    });

    it('returns null at the first display step (backend)', () => {
        expect(prevSubStep(paasSections, 'backend')).toBeNull();
    });

    it('walks backward through the ACCS sign-in step (connection → signin → backend)', () => {
        expect(prevSubStep(accsSections, 'connection')).toBe('signin');
        expect(prevSubStep(accsSections, 'signin')).toBe('backend');
    });

    it('still walks forward signin → connection once signed in (ACCS)', () => {
        // The PM-F5 bug: when signin was omitted on sign-in, nextSubStep('signin')
        // returned null and Continue skipped Connection. It must reach connection.
        expect(nextSubStep(accsSignedIn, 'signin')).toBe('connection');
    });

    it('still walks backward connection → signin once signed in (ACCS)', () => {
        expect(prevSubStep(accsSignedIn, 'connection')).toBe('signin');
    });
});

describe('isCommerceStepComplete — per-step done conditions', () => {
    const PAAS_CTX = { isAccs: false, signedIn: false };
    const ACCS_OUT = { isAccs: true, signedIn: false };
    const ACCS_IN = { isAccs: true, signedIn: true };

    it('backend complete only once selectedBackend is set', () => {
        expect(isCommerceStepComplete(state(), 'backend', PAAS_CTX)).toBe(false);
        expect(isCommerceStepComplete(state({ selectedBackend: PAAS }), 'backend', PAAS_CTX)).toBe(
            true
        );
    });

    it('signin complete only when signed in (ACCS)', () => {
        expect(isCommerceStepComplete(state({ selectedBackend: ACCS }), 'signin', ACCS_OUT)).toBe(
            false
        );
        expect(isCommerceStepComplete(state({ selectedBackend: ACCS }), 'signin', ACCS_IN)).toBe(
            true
        );
    });

    it('connection complete only when commerceConnectValid is true', () => {
        expect(isCommerceStepComplete(state(), 'connection', PAAS_CTX)).toBe(false);
        expect(
            isCommerceStepComplete(state({ commerceConnectValid: true }), 'connection', PAAS_CTX)
        ).toBe(true);
    });

    it('business-structure complete only when commerceStoreViewChosen is true', () => {
        expect(isCommerceStepComplete(state(), 'business-structure', PAAS_CTX)).toBe(false);
        expect(
            isCommerceStepComplete(
                state({ commerceStoreViewChosen: true }),
                'business-structure',
                PAAS_CTX
            )
        ).toBe(true);
    });

    it('business-structure NOT complete while store discovery is loading, even with a view chosen', () => {
        expect(
            isCommerceStepComplete(
                state({ commerceStoreViewChosen: true, commerceStoreLoading: true }),
                'business-structure',
                PAAS_CTX
            )
        ).toBe(false);
    });

    it('catalog is always complete (terminal)', () => {
        expect(isCommerceStepComplete(state(), 'catalog', PAAS_CTX)).toBe(true);
    });
});

describe('firstOpenSection — re-exported pure helper', () => {
    it('returns the first current section (backend when nothing chosen)', () => {
        const sections = commerceSectionStates(state(), { isAccs: false, signedIn: false });
        expect(firstOpenSection(sections)).toBe('backend');
    });

    it('returns the first openable (non-done, non-locked) section', () => {
        // Backend done, connection upcoming → first openable is connection.
        const sections = commerceSectionStates(state({ selectedBackend: PAAS }), {
            isAccs: false,
            signedIn: false,
        });
        expect(firstOpenSection(sections)).toBe('connection');
    });
});

/**
 * The PaaS deadlock, asserted where the user meets it.
 *
 * `ADOBE_CATALOG_API_KEY` and `ADOBE_COMMERCE_ENVIRONMENT_ID` are required on
 * PaaS, have no default, are seeded by no demo package, and render ONLY in the
 * Catalog sub-step. While one whole-form verdict answered for every section,
 * their emptiness made Connection incomplete — and Catalog is locked until
 * Connection completes. A locked rail tab is not clickable and Continue reads the
 * same verdict, so the only place to fill them was unreachable.
 */
describe('commerceSectionStates — Catalog is reachable while its own fields are empty', () => {
    const connectedButCatalogEmpty = state({
        selectedBackend: PAAS,
        commerceConnectValid: true,
        commerceStoreViewChosen: true,
        commerceCatalogValid: false,
    });

    it('unlocks Catalog so its required fields can be filled', () => {
        const sections = commerceSectionStates(connectedButCatalogEmpty, {
            isAccs: false,
            signedIn: false,
        });

        expect(sections.find((s) => s.id === 'catalog')?.status).not.toBe('locked');
    });

    it('still refuses to call Catalog complete — the gate moved, it did not vanish', () => {
        // Otherwise unblocking the deadlock would let a user walk past required
        // fields and generate a .env with blanks.
        expect(
            isCommerceStepComplete(connectedButCatalogEmpty, 'catalog', {
                isAccs: false,
                signedIn: false,
            }),
        ).toBe(false);
    });

    it('calls Catalog complete once its fields are valid — control', () => {
        expect(
            isCommerceStepComplete(
                state({
                    selectedBackend: PAAS,
                    commerceConnectValid: true,
                    commerceStoreViewChosen: true,
                    commerceCatalogValid: true,
                }),
                'catalog',
                { isAccs: false, signedIn: false },
            ),
        ).toBe(true);
    });

    it('stays permissive when no verdict has been reported yet', () => {
        // ACCS has an empty catalog-service group and the body may not have
        // mounted; an unknown verdict must not block Continue.
        expect(
            isCommerceStepComplete(
                state({ selectedBackend: PAAS, commerceConnectValid: true }),
                'catalog',
                { isAccs: false, signedIn: false },
            ),
        ).toBe(true);
    });
});

/**
 * Sample data is a Commerce sub-step, not an area of its own.
 *
 * It had its own rail slot and full-width body, and the body could never load:
 * it asks the Data Installer's `find-datapacks`, registered only by the Data
 * Installer panel's command, so in the wizard the request had no handler and the
 * area rendered nothing but an apology.
 *
 * Placement follows the data. A pack seeds the COMMERCE backend, so the choice
 * belongs beside the backend it targets.
 *
 * The one rule worth pinning: it is NEVER LOCKED. Every other config sub-step
 * chains — Business Structure needs Connection, Catalog needs a store view —
 * because each reads through the live connection. This one does not. The catalog
 * of packs comes from the Data Installer service, not from the instance, and
 * nothing is installed during the wizard at all. Locking it behind a reachable
 * backend would gate a choice that has no dependency on one.
 */
describe('commerceSectionStates — the sample data sub-step', () => {
    const ctx = { isAccs: false, signedIn: false };

    function sampleOf(over: Partial<WizardState> = {}) {
        return commerceSectionStates(
            state({ selectedBackend: PAAS, ...over }),
            ctx,
        ).find((s) => s.id === 'sample-data');
    }

    it('comes last, after catalog', () => {
        const ids = commerceSectionStates(state({ selectedBackend: PAAS }), ctx).map((s) => s.id);

        expect(ids[ids.length - 1]).toBe('sample-data');
        expect(ids.indexOf('sample-data')).toBeGreaterThan(ids.indexOf('catalog'));
    });

    /** The rule this section exists to keep. */
    it('is never locked, even with nothing connected', () => {
        expect(sampleOf()?.status).not.toBe('locked');
    });

    it('is not locked behind an Adobe sign-in either', () => {
        const sample = commerceSectionStates(state({ selectedBackend: ACCS }), {
            isAccs: true,
            signedIn: false,
        }).find((s) => s.id === 'sample-data');

        expect(sample?.status).not.toBe('locked');
    });

    it('carries the chosen pack as its summary value', () => {
        expect(sampleOf({ datapack: { name: 'bodea', version: 'main' } })).toMatchObject({
            status: 'done',
            value: 'bodea',
        });
    });

    /** Choosing nothing is a real answer, not an unfinished one. */
    it('reads as None rather than empty when no pack is chosen', () => {
        expect(sampleOf()).toMatchObject({ value: 'None' });
    });

    it('never blocks Continue, chosen or not', () => {
        expect(isCommerceStepComplete(state({ selectedBackend: PAAS }), 'sample-data', ctx)).toBe(
            true,
        );
        expect(
            isCommerceStepComplete(
                state({ selectedBackend: PAAS, datapack: { name: 'bodea', version: 'main' } }),
                'sample-data',
                ctx,
            ),
        ).toBe(true);
    });
});
