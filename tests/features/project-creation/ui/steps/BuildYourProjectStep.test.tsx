/**
 * BuildYourProjectStep Tests (Nested Builder — Slice 1, step 4)
 *
 * The "Build Your Project" step shell. It derives the ordered, VISIBLE areas via
 * {@link buildYourProjectAreas}, resolves the active area from
 * `state.activeBuildArea` (defaulting to the first visible area), and routes ONLY
 * that area's existing body component (CommerceStep / StorefrontStep /
 * IntegrationsStep) — reused as-is. The STEP owns the Continue gate over ALL
 * REQUIRED areas (commerce always; storefront when visible; integrations
 * CONDITIONALLY — blocked only when Mesh is On but unconfigured, via
 * isIntegrationsComplete), so it hands a NO-OP `setCanProceed` to the body it
 * renders (the body still persists its validity to wizard state, which feeds
 * buildYourProjectAreas).
 *
 * The three body components are mocked to lightweight stubs that surface which one
 * rendered and capture their `setCanProceed` prop, so the tests assert the SHELL's
 * routing + gate wiring rather than re-testing the bodies (covered by their own
 * suites).
 *
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { BuildYourProjectStep } from '@/features/project-creation/ui/steps/BuildYourProjectStep';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

// ---------------------------------------------------------------------------
// Body stubs — surface which area rendered + capture its setCanProceed prop.
// ---------------------------------------------------------------------------

const capturedSetCanProceed: Record<string, (v: boolean) => void> = {};

/** Body props the shell FORWARDS; surfaced so the catalog defaults are observable. */
interface StubBodyProps {
    setCanProceed: (v: boolean) => void;
    packages?: { id: string }[];
    stacks?: { id: string }[];
}

jest.mock('@/features/project-creation/ui/steps/CommerceStep', () => ({
    CommerceStep: (props: StubBodyProps) => {
        capturedSetCanProceed.commerce = props.setCanProceed;
        return (
            <div
                data-testid="commerce-body"
                data-packages={(props.packages ?? []).map((p) => p.id).join(',')}
                data-stacks={(props.stacks ?? []).map((s) => s.id).join(',')}
                data-package-count={String((props.packages ?? []).length)}
                data-stack-count={String((props.stacks ?? []).length)}
            >
                Commerce body
            </div>
        );
    },
}));

jest.mock('@/features/project-creation/ui/steps/StorefrontStep', () => ({
    StorefrontStep: (props: StubBodyProps) => {
        capturedSetCanProceed.storefront = props.setCanProceed;
        return <div data-testid="storefront-body">Storefront body</div>;
    },
}));

jest.mock('@/features/project-creation/ui/steps/IntegrationsStep', () => ({
    IntegrationsStep: (props: StubBodyProps) => {
        capturedSetCanProceed.integrations = props.setCanProceed;
        return <div data-testid="integrations-body">Integrations body</div>;
    },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function stack(overrides: Partial<Stack> = {}): Stack {
    return {
        id: 'fixture-stack',
        name: 'Fixture Stack',
        description: '',
        frontend: 'headless-storefront',
        backend: 'adobe-commerce-paas',
        dependencies: [],
        ...overrides,
    };
}

const EDS_STACK = stack({
    id: 'eds-paas',
    frontend: 'eds-storefront',
    requiresGitHub: true,
    requiresDaLive: true,
});

const NON_EDS_STACK = stack({ id: 'headless-paas', frontend: 'headless-storefront' });

const STACKS: Stack[] = [EDS_STACK, NON_EDS_STACK];

// Real-id package so the real catalog resolves a mesh for eds-storefront + PaaS,
// exercising the Integrations gate (isIntegrationsComplete).
const PACKAGES = [{ id: 'citisignal', name: 'Citisignal' }] as unknown as DemoPackage[];

const EDS_AUTHED = {
    githubAuth: { isAuthenticated: true },
    daLiveAuth: { isAuthenticated: true },
};

function baseState(initial: Partial<WizardState> = {}): WizardState {
    return { currentStep: 'build-your-project', ...initial } as WizardState;
}

function setup(initial: Partial<WizardState> = {}) {
    const setCanProceed = jest.fn();
    const updateState = jest.fn();
    const utils = render(
        <Provider theme={defaultTheme}>
            <BuildYourProjectStep
                state={baseState(initial)}
                updateState={updateState}
                setCanProceed={setCanProceed}
                stacks={STACKS}
                packages={PACKAGES}
            />
        </Provider>
    );
    return { ...utils, setCanProceed, updateState };
}

beforeEach(() => {
    jest.clearAllMocks();
    delete capturedSetCanProceed.commerce;
    delete capturedSetCanProceed.storefront;
    delete capturedSetCanProceed.integrations;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuildYourProjectStep — active-area routing', () => {
    it('renders the first visible area (commerce) when activeBuildArea is unset', () => {
        setup({ selectedStack: 'eds-paas' });
        expect(screen.getByTestId('commerce-body')).toBeInTheDocument();
        expect(screen.queryByTestId('storefront-body')).not.toBeInTheDocument();
        expect(screen.queryByTestId('integrations-body')).not.toBeInTheDocument();
    });

    it('renders StorefrontStep when activeBuildArea is storefront on an EDS stack', () => {
        setup({ selectedStack: 'eds-paas', activeBuildArea: 'storefront' });
        expect(screen.getByTestId('storefront-body')).toBeInTheDocument();
        expect(screen.queryByTestId('commerce-body')).not.toBeInTheDocument();
    });

    it('renders IntegrationsStep when activeBuildArea is integrations', () => {
        setup({ selectedStack: 'eds-paas', activeBuildArea: 'integrations' });
        expect(screen.getByTestId('integrations-body')).toBeInTheDocument();
        expect(screen.queryByTestId('commerce-body')).not.toBeInTheDocument();
    });

    it('falls back to the first visible area when activeBuildArea points at a hidden area', () => {
        // storefront is hidden on a non-EDS stack → fall back to commerce.
        setup({ selectedStack: 'headless-paas', activeBuildArea: 'storefront' });
        expect(screen.getByTestId('commerce-body')).toBeInTheDocument();
        expect(screen.queryByTestId('storefront-body')).not.toBeInTheDocument();
    });
});

describe('BuildYourProjectStep — catalog data reaching the body and the summary', () => {
    // packages/stacks are optional props. Their defaults have to be EMPTY and stable:
    // anything with entries in it resolves against undefined state fields (a catalog
    // find on `p.id === state.selectedPackage` matches an id-less entry when nothing
    // is selected), which invents a package and a stack the project does not have.
    it('forwards empty catalogs to the body when neither prop is supplied', () => {
        render(
            <Provider theme={defaultTheme}>
                <BuildYourProjectStep
                    state={baseState()}
                    updateState={jest.fn()}
                    setCanProceed={jest.fn()}
                />
            </Provider>
        );
        const body = screen.getByTestId('commerce-body');
        // COUNT, not ids: an entry with no `id` joins to the same empty string an
        // empty array does, so only the length tells a real default from a stray one.
        expect(body).toHaveAttribute('data-package-count', '0');
        expect(body).toHaveAttribute('data-stack-count', '0');
    });

    it('forwards the supplied catalogs to the body unchanged', () => {
        setup({ selectedStack: 'eds-paas' });
        const body = screen.getByTestId('commerce-body');
        expect(body).toHaveAttribute('data-packages', 'citisignal');
        expect(body).toHaveAttribute('data-stacks', 'eds-paas,headless-paas');
        expect(body).toHaveAttribute('data-package-count', '1');
        expect(body).toHaveAttribute('data-stack-count', '2');
    });

    // The summary column carries one group per VISIBLE area, which is what makes it
    // persist across area switches — it is keyed off the area ids, not off which body
    // happens to be rendered.
    it('renders a summary group for each visible area (EDS: commerce + storefront)', () => {
        setup({ selectedStack: 'eds-paas' });
        const summary = document.querySelector('.commerce-summary-content');
        expect(summary?.textContent).toContain('Commerce');
        expect(summary?.textContent).toContain('Storefront');
    });

    it('drops the storefront group on a non-EDS stack, where the area is hidden', () => {
        setup({ selectedStack: 'headless-paas' });
        const summary = document.querySelector('.commerce-summary-content');
        expect(summary?.textContent).toContain('Commerce');
        expect(summary?.textContent).not.toContain('Storefront');
    });

    // The visible areas are memoised on (state, stacks, packages). A stack change
    // makes the storefront area appear, and the shell has to notice: the persisted
    // activeBuildArea only resolves against the CURRENT area list.
    it('recomputes the visible areas when the stack changes', () => {
        const view = (selectedStack: string) => (
            <Provider theme={defaultTheme}>
                <BuildYourProjectStep
                    state={baseState({ selectedStack, activeBuildArea: 'storefront' })}
                    updateState={jest.fn()}
                    setCanProceed={jest.fn()}
                    stacks={STACKS}
                    packages={PACKAGES}
                />
            </Provider>
        );
        const { rerender } = render(view('headless-paas'));
        expect(screen.getByTestId('commerce-body')).toBeInTheDocument();

        rerender(view('eds-paas'));
        expect(screen.getByTestId('storefront-body')).toBeInTheDocument();
        expect(screen.queryByTestId('commerce-body')).not.toBeInTheDocument();
    });
});

describe('BuildYourProjectStep — Continue gate over the CURRENT Commerce SUB-STEP', () => {
    // The Commerce area is walked SUB-STEP by SUB-STEP via the wizard's
    // Continue/Back; the STEP gates Continue on the ACTIVE Commerce sub-step's
    // done-condition (Backend → a backend chosen; Sign in → signed in; Connection →
    // connect valid; Business → store view chosen; Catalog → always). Non-commerce
    // areas keep their area-complete/optional gate.

    it('is false on the Backend sub-step until a backend is chosen', () => {
        // activeCommerceStep unset → firstOpenSection lands on backend (current).
        const { setCanProceed } = setup({ selectedStack: 'eds-paas' });
        expect(setCanProceed).toHaveBeenLastCalledWith(false);
    });

    it('is true on the Backend sub-step once a backend is chosen', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-paas',
            selectedBackend: 'adobe-commerce-paas',
            activeCommerceStep: 'backend',
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    it('is false on the Connection sub-step until the connect form reports valid', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-paas',
            selectedBackend: 'adobe-commerce-paas',
            activeCommerceStep: 'connection',
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(false);
    });

    it('is true on the Connection sub-step once the connect form reports valid', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-paas',
            selectedBackend: 'adobe-commerce-paas',
            activeCommerceStep: 'connection',
            commerceConnectValid: true,
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    it('is false on the Sign in sub-step until signed in (ACCS)', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-accs',
            selectedBackend: 'adobe-commerce-accs',
            activeCommerceStep: 'signin',
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(false);
    });

    it('is true on the Sign in sub-step once signed in (ACCS)', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-accs',
            selectedBackend: 'adobe-commerce-accs',
            activeCommerceStep: 'signin',
            adobeAuth: { isAuthenticated: true, isChecking: false } as WizardState['adobeAuth'],
            adobeOrg: { id: 'org-1', name: 'Org One' } as WizardState['adobeOrg'],
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    it('is true on the Catalog sub-step (terminal — always passes)', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-paas',
            selectedBackend: 'adobe-commerce-paas',
            activeCommerceStep: 'catalog',
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });
});

describe('BuildYourProjectStep — Continue gate over non-commerce areas', () => {
    it('is false when the active area is an incomplete storefront (EDS)', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-paas',
            activeBuildArea: 'storefront',
            // commerce done but storefront not → active (storefront) gates false.
            commerceConnectValid: true,
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(false);
    });

    it('is true when the active area (storefront) is completed (EDS)', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-paas',
            activeBuildArea: 'storefront',
            edsConfig: EDS_AUTHED as WizardState['edsConfig'],
            storefrontRepoValid: true,
            storefrontCodeSyncValid: true,
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    // Integrations has NO sub-step driver (results-only area): its Continue gate is
    // the area-status fallback — `activeArea.status === 'completed'`, which is
    // isIntegrationsComplete (optional when nothing deployable is selected; blocked
    // when a deployable is selected without a committed destination).

    it('is true when the active area is integrations with nothing selected (optional)', () => {
        const { setCanProceed } = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            activeBuildArea: 'integrations',
            // Mesh available but not selected → integrations is optional → gate true.
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    it('is false with a deployable selected but no committed destination (blocks Continue)', () => {
        const { setCanProceed } = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedBackend: 'adobe-commerce-accs',
            activeBuildArea: 'integrations',
            selectedAppBuilderComponents: ['commerce-paas-mesh'],
            // No adobeProject/adobeWorkspace → area status is not 'completed'.
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(false);
    });

    it('is true with a deployable selected, signed in, and the destination committed', () => {
        const { setCanProceed } = setup({
            selectedPackage: 'citisignal',
            selectedStack: 'eds-paas',
            selectedBackend: 'adobe-commerce-accs',
            activeBuildArea: 'integrations',
            selectedAppBuilderComponents: ['commerce-paas-mesh'],
            adobeAuth: { isAuthenticated: true, isChecking: false } as WizardState['adobeAuth'],
            adobeOrg: { id: 'o', name: 'Acme' } as WizardState['adobeOrg'],
            adobeProject: { id: 'p1', name: 'proj' } as WizardState['adobeProject'],
            adobeWorkspace: { id: 'w1', name: 'ws' } as WizardState['adobeWorkspace'],
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });
});

describe('BuildYourProjectStep — body receives a NO-OP setCanProceed', () => {
    it("does not hand the body the step's real setCanProceed", () => {
        const { setCanProceed } = setup({ selectedStack: 'eds-paas' });
        expect(capturedSetCanProceed.commerce).toBeDefined();
        expect(capturedSetCanProceed.commerce).not.toBe(setCanProceed);
    });

    it('calling the body setCanProceed(true) does not flip the step gate', () => {
        // Commerce unconfigured → step gate is false. The body calling its no-op
        // with `true` must NOT cause the step's real setCanProceed to be called true.
        const { setCanProceed } = setup({ selectedStack: 'eds-paas' });
        setCanProceed.mockClear();
        capturedSetCanProceed.commerce(true);
        expect(setCanProceed).not.toHaveBeenCalled();
    });
});
