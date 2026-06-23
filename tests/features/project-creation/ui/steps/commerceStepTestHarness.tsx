/**
 * Shared test harness for CommerceStep tests (Project Builder v7).
 *
 * Extracted verbatim from CommerceStep.test.tsx so the rendering/layout suite and the
 * Backend→stack bridge suite share one harness with zero duplication. This module owns
 * the child mock-factory functions, the config-driven fixtures, the WizardState factory,
 * the `setup()` render helper, and the DOM-contract query helpers.
 *
 * NOTE on jest.mock: `jest.mock(...)` is hoisted to the top of each test FILE, ABOVE the
 * import of this harness. A hoisted factory therefore cannot reference any imported binding
 * (it would not be initialized yet). So each test file declares its own `jest.mock(...)`
 * calls with INLINE factory bodies for the child stubs (ConnectStoreStepContent /
 * AdobeAuthStep) and the service mocks (vscode-api / blockLibraryLoader / demoPackageLoader).
 * This harness owns the non-hoisted bulk: fixtures, the WizardState factory, the `setup()`
 * render helper, and the DOM-contract query helpers.
 */

import { render } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { CommerceStep } from '@/features/project-creation/ui/steps/CommerceStep';
import { COMPONENT_IDS } from '@/core/constants';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

// ---------------------------------------------------------------------------
// Fixtures (config-driven: backends derive from stacks ∩ pkg.storefronts)
// ---------------------------------------------------------------------------

export const PAAS = 'adobe-commerce-paas';
export const ACCS = 'adobe-commerce-accs';

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

const edsPaas: Stack = {
    id: 'eds-paas',
    name: 'Edge Delivery + PaaS',
    description: 'EDS with PaaS backend',
    frontend: 'eds-storefront',
    backend: PAAS,
    dependencies: [],
    optionalDependencies: [COMPONENT_IDS.EDS_COMMERCE_MESH],
    optionalAddons: [],
};

const edsAccs: Stack = {
    id: 'eds-accs',
    name: 'Edge Delivery + ACCS',
    description: 'EDS with ACCS backend',
    frontend: 'eds-storefront',
    backend: ACCS,
    dependencies: [],
    optionalDependencies: [COMPONENT_IDS.EDS_COMMERCE_MESH],
    optionalAddons: [],
};

const headlessPaas: Stack = {
    id: 'headless-paas',
    name: 'Headless + PaaS',
    description: 'Headless with PaaS backend',
    frontend: 'headless',
    backend: PAAS,
    dependencies: [],
    optionalDependencies: [],
    optionalAddons: [],
};

export const STACKS = [headlessPaas, edsPaas, edsAccs];

// citisignal: PaaS ambiguous (eds-paas + headless-paas); ACCS unique (eds-accs).
const citisignal: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    storefronts: {
        'headless-paas': { name: 'CS Headless', description: '', source: mockGitSource },
        'eds-paas': { name: 'CS EDS PaaS', description: '', source: mockGitSource },
        'eds-accs': { name: 'CS EDS ACCS', description: '', source: mockGitSource },
    },
};

// isle5: PaaS unique (eds-paas); ACCS unique (eds-accs).
const isle5: DemoPackage = {
    id: 'isle5',
    name: 'Isle5',
    description: 'A test package',
    storefronts: {
        'eds-paas': { name: 'I5 EDS PaaS', description: '', source: mockGitSource },
        'eds-accs': { name: 'I5 EDS ACCS', description: '', source: mockGitSource },
    },
};

// buildright: PaaS only (eds-paas unique); ACCS disabled.
const buildright: DemoPackage = {
    id: 'buildright',
    name: 'BuildRight',
    description: 'A test package',
    storefronts: {
        'eds-paas': { name: 'BR EDS PaaS', description: '', source: mockGitSource },
    },
};

export const PACKAGES = [citisignal, isle5, buildright];

export function baseState(initial: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'build-your-project',
        projectName: '',
        selectedPackage: 'citisignal',
        adobeAuth: { isAuthenticated: false, isChecking: false },
        ...initial,
    } as WizardState;
}

/** Render the step with a controlled, mutable WizardState (Spectrum-wrapped). */
export function setup(initial: Partial<WizardState> = {}) {
    const stateRef = { current: baseState(initial) };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });
    const setCanProceed = jest.fn();

    const renderUi = () => (
        <Provider theme={defaultTheme}>
            <CommerceStep
                state={stateRef.current}
                updateState={updateState}
                setCanProceed={setCanProceed}
                packages={PACKAGES}
                stacks={STACKS}
            />
        </Provider>
    );

    const utils = render(renderUi());
    const rerender = () => utils.rerender(renderUi());

    return { ...utils, rerender, updateState, setCanProceed, stateRef };
}

// ---------------------------------------------------------------------------
// DOM contract helpers (VerticalStepList + CommerceSummary render for real).
// A step's button is `[data-step="<id>"]` (aria-disabled="true" when locked); the
// active step's body lives in `.step-view`.
// ---------------------------------------------------------------------------

/** The step button for a step (by its stable data-step id). */
export function stepTab(id: string): HTMLButtonElement {
    const el = document.querySelector(`[data-step="${id}"]`);
    if (!el) throw new Error(`step [data-step="${id}"] not found`);
    return el as HTMLButtonElement;
}

/** Whether a step's tab is locked (aria-disabled). */
export function isLocked(id: string): boolean {
    return stepTab(id).getAttribute('aria-disabled') === 'true';
}

/** The dedicated active-step view container. */
export function stepView(): HTMLElement {
    const el = document.querySelector('.step-view');
    if (!el) throw new Error('dedicated .step-view not found');
    return el as HTMLElement;
}

/** The derived architecture line in the summary column. */
export function architectureLine(): HTMLElement {
    const el = document.querySelector('.sum-arch');
    if (!el) throw new Error('summary architecture line not found');
    return el as HTMLElement;
}
