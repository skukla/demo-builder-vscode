/**
 * CommerceStep Tests (R1b — tile + focused modal)
 *
 * Commerce is now a single "Backend" {@link ConfigTile}; clicking it opens a
 * focused {@link Modal} whose body is the EXISTING Commerce content
 * (ArchitectureStepContent + ConnectStoreStepContent), unchanged. The step's
 * Continue gate derives from {@link isCommerceConfigured} (selectedStack set AND
 * commerceConnectValid true), and the connect form's validity verdict persists to
 * wizard state via updateState({ commerceConnectValid }) so it survives the modal
 * closing and back/forward navigation.
 *
 * The two content panels are mocked to lightweight stubs so the tests assert the
 * STEP's wiring (tile status, modal open/close, which handlers fire, how the gate
 * combines) rather than re-testing the panels (covered by their own suites). The
 * services consumed by useProjectBuilder are mocked so the real hook runs unchanged.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { CommerceStep } from '@/features/project-creation/ui/steps/CommerceStep';
import { COMPONENT_IDS } from '@/core/constants';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

// ---------------------------------------------------------------------------
// Mocks: services consumed by useProjectBuilder (real hook runs)
// ---------------------------------------------------------------------------

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: jest.fn(() => []),
    getNativeBlockLibraries: jest.fn(() => []),
    getDefaultBlockLibraryIds: jest.fn(() => []),
}));

jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    // Default: mesh NOT required (non-mesh package) → optional deps reset to [].
    getResolvedMeshRequirement: jest.fn(() => false),
}));

// Lightweight panel stubs — capture the props each panel receives so the test
// can drive the step's wired handlers without rendering the real panels.
type ArchProps = {
    stackSelection: { onStackClick: (id: string) => void };
    addonSelection: {
        onAddonToggle: (id: string, isSelected: boolean) => void;
        requiredAddonIds?: string[];
        displayAddons: { id: string }[];
    };
};
type ConnectProps = {
    selectedStackId: string;
    onValidationChange: (valid: boolean) => void;
};

jest.mock('@/features/project-creation/ui/components/ArchitectureStepContent', () => ({
    ArchitectureStepContent: (props: ArchProps) => (
        <div data-testid="architecture-panel">
            <button
                type="button"
                data-testid="select-stack"
                onClick={() => props.stackSelection.onStackClick('venia-paas')}
            >
                select stack
            </button>
            <button
                type="button"
                data-testid="toggle-addon"
                onClick={() => props.addonSelection.onAddonToggle('analytics', true)}
            >
                toggle addon
            </button>
            <span data-testid="required-addons">
                {(props.addonSelection.requiredAddonIds ?? []).join(',')}
            </span>
            <span data-testid="display-addons">
                {props.addonSelection.displayAddons.map(a => a.id).join(',')}
            </span>
        </div>
    ),
}));

jest.mock('@/features/project-creation/ui/components/ConnectStoreStepContent', () => ({
    ConnectStoreStepContent: (props: ConnectProps) => (
        <div data-testid="connect-store-panel" data-stack-id={props.selectedStackId}>
            <button
                type="button"
                data-testid="connect-valid"
                onClick={() => props.onValidationChange(true)}
            >
                mark valid
            </button>
            <button
                type="button"
                data-testid="connect-invalid"
                onClick={() => props.onValidationChange(false)}
            >
                mark invalid
            </button>
        </div>
    ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

const veniaStack: Stack = {
    id: 'venia-paas',
    name: 'Venia + PaaS',
    description: 'Venia with PaaS backend',
    frontend: 'venia',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [],
    optionalAddons: [
        { id: 'analytics', default: false },
    ],
};

const edsStack: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [COMPONENT_IDS.EDS_COMMERCE_MESH],
    optionalAddons: [],
};

const citisignal: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    storefronts: {
        'venia-paas': { name: 'CS Venia', description: '', source: mockGitSource },
        'eds-paas': { name: 'CS EDS', description: '', source: mockGitSource },
    },
    addons: { analytics: 'required' },
};

const PACKAGES = [citisignal];
const STACKS = [veniaStack, edsStack];

function baseState(initial: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'commerce',
        projectName: '',
        selectedPackage: 'citisignal',
        adobeAuth: { isAuthenticated: false, isChecking: false },
        ...initial,
    } as WizardState;
}

/** Render the step with a controlled, mutable WizardState (Spectrum-wrapped). */
function setup(initial: Partial<WizardState> = {}) {
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

/** Open the focused modal by pressing the Backend tile. */
function openModal() {
    act(() => {
        fireEvent.click(screen.getByTestId('backend-tile'));
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CommerceStep', () => {
    describe('tile', () => {
        it('should render a Backend tile', () => {
            setup();
            expect(screen.getByTestId('backend-tile')).toBeInTheDocument();
        });

        it('should show needs-setup status when no stack is selected', () => {
            setup();
            expect(screen.getByTestId('backend-tile')).toHaveAttribute(
                'data-status',
                'needs-setup',
            );
        });

        it('should show needs-setup when a stack exists but connect is not valid', () => {
            setup({ selectedStack: 'venia-paas' });
            expect(screen.getByTestId('backend-tile')).toHaveAttribute(
                'data-status',
                'needs-setup',
            );
        });

        it('should show configured when a stack is selected AND connect is valid', () => {
            setup({ selectedStack: 'venia-paas', commerceConnectValid: true });
            expect(screen.getByTestId('backend-tile')).toHaveAttribute(
                'data-status',
                'configured',
            );
        });

        it('should NOT render the modal content until the tile is pressed', () => {
            setup({ selectedStack: 'venia-paas' });
            expect(screen.queryByTestId('architecture-panel')).not.toBeInTheDocument();
            expect(screen.queryByTestId('connect-store-panel')).not.toBeInTheDocument();
        });
    });

    describe('modal', () => {
        it('should open the modal with both panels when the tile is pressed', () => {
            setup({ selectedStack: 'venia-paas' });
            openModal();
            expect(screen.getByTestId('architecture-panel')).toBeInTheDocument();
            expect(screen.getByTestId('connect-store-panel')).toBeInTheDocument();
        });

        it('should pass the selected stack id to the connect panel', () => {
            setup({ selectedStack: 'venia-paas' });
            openModal();
            expect(screen.getByTestId('connect-store-panel')).toHaveAttribute(
                'data-stack-id',
                'venia-paas',
            );
        });
    });

    describe('stack selection (useProjectBuilder)', () => {
        it('should write selectedStack via the hook when the panel selects a stack', () => {
            const { updateState } = setup({ selectedStack: 'eds-paas' });
            openModal();
            fireEvent.click(screen.getByTestId('select-stack'));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedStack: 'venia-paas' }),
            );
        });

        it('should reset selectedOptionalDependencies for a non-mesh package on stack select', () => {
            // Pre-seed stale optional deps; selecting a non-mesh stack must clear them.
            const { updateState } = setup({
                selectedStack: 'eds-paas',
                selectedOptionalDependencies: [COMPONENT_IDS.EDS_COMMERCE_MESH],
            });
            openModal();
            fireEvent.click(screen.getByTestId('select-stack'));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedOptionalDependencies: [] }),
            );
        });
    });

    describe('addon selection', () => {
        it('should route addon toggles through the hook (onAddonsChange)', () => {
            const { updateState } = setup({ selectedStack: 'venia-paas', selectedAddons: [] });
            openModal();
            fireEvent.click(screen.getByTestId('toggle-addon'));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({
                    selectedAddons: expect.arrayContaining(['analytics']),
                }),
            );
        });

        it('should mark package-required addons as required (pre-checked/disabled upstream)', () => {
            setup({ selectedStack: 'venia-paas' });
            openModal();
            expect(screen.getByTestId('required-addons')).toHaveTextContent('analytics');
        });
    });

    describe('connect validity persistence', () => {
        it('should persist commerceConnectValid via updateState when connect reports valid', () => {
            const { updateState } = setup({ selectedStack: 'venia-paas' });
            openModal();
            fireEvent.click(screen.getByTestId('connect-valid'));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ commerceConnectValid: true }),
            );
        });

        it('should persist commerceConnectValid=false when connect reports invalid', () => {
            const { updateState } = setup({
                selectedStack: 'venia-paas',
                commerceConnectValid: true,
            });
            openModal();
            fireEvent.click(screen.getByTestId('connect-invalid'));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ commerceConnectValid: false }),
            );
        });
    });

    describe('continue gate (isCommerceConfigured)', () => {
        it('should be false when no stack is selected', () => {
            const { setCanProceed } = setup();
            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should be false when a stack exists but connect is not valid', () => {
            const { setCanProceed } = setup({ selectedStack: 'venia-paas' });
            expect(setCanProceed).toHaveBeenLastCalledWith(false);
        });

        it('should be true when a stack is selected AND commerceConnectValid is true', () => {
            const { setCanProceed } = setup({
                selectedStack: 'venia-paas',
                commerceConnectValid: true,
            });
            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });
    });
});
