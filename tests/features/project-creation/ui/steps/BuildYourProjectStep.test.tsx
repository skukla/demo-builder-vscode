/**
 * BuildYourProjectStep Tests (Nested Builder — Slice 1, step 4)
 *
 * The "Build Your Project" step shell. It derives the ordered, VISIBLE areas via
 * {@link buildYourProjectAreas}, resolves the active area from
 * `state.activeBuildArea` (defaulting to the first visible area), and routes ONLY
 * that area's existing body component (CommerceStep / StorefrontStep /
 * IntegrationsStep) — reused as-is. The STEP owns the Continue gate over ALL
 * REQUIRED areas (commerce always; storefront when visible; integrations
 * optional), so it hands a NO-OP `setCanProceed` to the body it renders (the body
 * still persists its validity to wizard state, which feeds buildYourProjectAreas).
 *
 * The three body components are mocked to lightweight stubs that surface which one
 * rendered and capture their `setCanProceed` prop, so the tests assert the SHELL's
 * routing + gate wiring rather than re-testing the bodies (covered by their own
 * suites).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { BuildYourProjectStep } from '@/features/project-creation/ui/steps/BuildYourProjectStep';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

// ---------------------------------------------------------------------------
// Body stubs — surface which area rendered + capture its setCanProceed prop.
// ---------------------------------------------------------------------------

const capturedSetCanProceed: Record<string, (v: boolean) => void> = {};

jest.mock('@/features/project-creation/ui/steps/CommerceStep', () => ({
    CommerceStep: (props: { setCanProceed: (v: boolean) => void }) => {
        capturedSetCanProceed.commerce = props.setCanProceed;
        return <div data-testid="commerce-body">Commerce body</div>;
    },
}));

jest.mock('@/features/project-creation/ui/steps/StorefrontStep', () => ({
    StorefrontStep: (props: { setCanProceed: (v: boolean) => void }) => {
        capturedSetCanProceed.storefront = props.setCanProceed;
        return <div data-testid="storefront-body">Storefront body</div>;
    },
}));

jest.mock('@/features/project-creation/ui/steps/IntegrationsStep', () => ({
    IntegrationsStep: (props: { setCanProceed: (v: boolean) => void }) => {
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
            />
        </Provider>,
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

describe('BuildYourProjectStep — Continue gate over the CURRENT area', () => {
    // Area progression now walks the areas one at a time via the wizard's
    // Continue/Back; the STEP gates Continue on the ACTIVE area's completion so
    // you can't leave an incomplete required area (commerce/storefront), while
    // the optional area (integrations) is always passable.

    it('is false when the active area (commerce) is not configured', () => {
        const { setCanProceed } = setup({ selectedStack: 'eds-paas' });
        expect(setCanProceed).toHaveBeenLastCalledWith(false);
    });

    it('is true when the active area (commerce) is configured', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-paas',
            commerceConnectValid: true,
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

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
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    it('is true when the active area is integrations (optional) regardless of completion', () => {
        const { setCanProceed } = setup({
            selectedStack: 'eds-paas',
            activeBuildArea: 'integrations',
            // Nothing else configured — integrations is optional → gate still true.
        });
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });
});

describe('BuildYourProjectStep — body receives a NO-OP setCanProceed', () => {
    it('does not hand the body the step\'s real setCanProceed', () => {
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
