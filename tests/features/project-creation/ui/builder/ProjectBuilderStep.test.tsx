/**
 * ProjectBuilderStep Tests (Slice 2 — Step 5)
 *
 * The hub-and-spoke wizard step: a fixed LEFT rail (ProjectBuilderRail) plus a
 * RIGHT pane that swaps to the active area's existing panel
 * (Architecture / App Builder Components / Block Libraries), wired in place via
 * useProjectBuilder. Tests cover the default architecture pane, area switching
 * through the rail (stack-gated), the setCanProceed effect, and that a mesh
 * App Builder component toggle drives the dual-flow hook (mesh component id
 * mirror-written into selectedOptionalDependencies).
 *
 * The three panel components are mocked to lightweight stubs so the tests assert
 * the STEP's wiring (which panel renders, which props/handlers it receives)
 * rather than re-testing the panels (covered by their own suites).
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProjectBuilderStep } from '@/features/project-creation/ui/builder/ProjectBuilderStep';
import { COMPONENT_IDS } from '@/core/constants';
import type { DemoPackage, GitSource } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

// ---------------------------------------------------------------------------
// Mocks: services consumed by buildBuilderAreas + the panel data wiring
// ---------------------------------------------------------------------------

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: jest.fn(() => []),
    getNativeBlockLibraries: jest.fn(() => []),
    // Used by useProjectBuilder.onStackSelect to seed default block libraries.
    getDefaultBlockLibraryIds: jest.fn(() => []),
}));

jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    getResolvedMeshRequirement: jest.fn(() => 'optional'),
}));

jest.mock('@/features/project-creation/services/appBuilderComponentSelection', () => ({
    getSelectableAppBuilderComponents: jest.fn(() => []),
}));

// Lightweight panel stubs — capture the props each panel receives so the test
// can drive the step's wired handlers without rendering the real panels.
type ArchProps = { stackSelection: { onStackClick: (id: string) => void } };
type AppBuilderProps = {
    onAppBuilderComponentToggle: (id: string, isSelected: boolean) => void;
    showCustomDoor?: boolean;
};

jest.mock('@/features/project-creation/ui/components/ArchitectureStepContent', () => ({
    ArchitectureStepContent: (props: ArchProps) => (
        <div data-testid="architecture-panel">
            <button
                type="button"
                data-testid="select-stack"
                onClick={() => props.stackSelection.onStackClick('eds-paas')}
            >
                select stack
            </button>
        </div>
    ),
}));

jest.mock('@/features/project-creation/ui/components/AppBuilderComponentsStepContent', () => ({
    AppBuilderComponentsStepContent: (props: AppBuilderProps) => (
        <div
            data-testid="app-builder-panel"
            data-show-custom-door={String(props.showCustomDoor)}
        >
            <button
                type="button"
                data-testid="toggle-mesh"
                onClick={() => props.onAppBuilderComponentToggle('commerce-paas-mesh', true)}
            >
                toggle mesh
            </button>
        </div>
    ),
}));

jest.mock('@/features/project-creation/ui/components/BlockLibrariesStepContent', () => ({
    BlockLibrariesStepContent: () => <div data-testid="block-libraries-panel" />,
}));

import { getSelectableAppBuilderComponents } from '@/features/project-creation/services/appBuilderComponentSelection';

const mockGetSelectable = getSelectableAppBuilderComponents as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
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

const veniaStack: Stack = {
    id: 'venia-paas',
    name: 'Venia + PaaS',
    description: 'Venia with PaaS backend',
    frontend: 'venia',
    backend: 'adobe-commerce-paas',
    dependencies: [],
    optionalDependencies: [],
    optionalAddons: [],
};

const citisignal: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    storefronts: {
        'eds-paas': { name: 'CS EDS', description: '', source: mockGitSource },
        'venia-paas': { name: 'CS Venia', description: '', source: mockGitSource },
    },
};

const PACKAGES = [citisignal];
const STACKS = [edsStack, veniaStack];

function baseState(initial: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'welcome',
        projectName: '',
        selectedPackage: 'citisignal',
        adobeAuth: { isAuthenticated: false, isChecking: false },
        ...initial,
    } as WizardState;
}

/** Render the step with a controlled, mutable WizardState. */
function setup(
    initial: Partial<WizardState> = {},
    onArchitectureChange?: (oldStackId: string, newStackId: string) => void,
) {
    const stateRef = { current: baseState(initial) };
    const updateState = jest.fn((partial: Partial<WizardState>) => {
        stateRef.current = { ...stateRef.current, ...partial };
    });
    const setCanProceed = jest.fn();

    const utils = render(
        <ProjectBuilderStep
            state={stateRef.current}
            updateState={updateState}
            setCanProceed={setCanProceed}
            packages={PACKAGES}
            stacks={STACKS}
            onArchitectureChange={onArchitectureChange}
        />,
    );

    const rerender = () =>
        utils.rerender(
            <ProjectBuilderStep
                state={stateRef.current}
                updateState={updateState}
                setCanProceed={setCanProceed}
                packages={PACKAGES}
                stacks={STACKS}
                onArchitectureChange={onArchitectureChange}
            />,
        );

    return { ...utils, rerender, updateState, setCanProceed, stateRef };
}

/** Locate a rail row button by its area id. */
function railRow(areaId: string): HTMLElement {
    const row = document.querySelector(`[data-area-id="${areaId}"]`);
    if (!row) throw new Error(`No rail row for area "${areaId}"`);
    return row as HTMLElement;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSelectable.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectBuilderStep', () => {
    describe('default layout', () => {
        it('should render the rail', () => {
            setup({ selectedStack: 'eds-paas' });
            expect(railRow('architecture')).toBeInTheDocument();
        });

        it('should render the architecture panel by default', () => {
            setup({ selectedStack: 'eds-paas' });
            expect(screen.getByTestId('architecture-panel')).toBeInTheDocument();
        });

        it('should not render the app-builder panel by default', () => {
            setup({ selectedStack: 'eds-paas' });
            expect(screen.queryByTestId('app-builder-panel')).not.toBeInTheDocument();
        });

        it('should render the architecture panel even when no stack is selected', () => {
            setup();
            expect(screen.getByTestId('architecture-panel')).toBeInTheDocument();
        });
    });

    describe('area switching via the rail', () => {
        it('should swap to the app-builder panel when its ready row is selected', () => {
            setup({ selectedStack: 'eds-paas' });
            fireEvent.click(railRow('app-builder-components'));
            expect(screen.getByTestId('app-builder-panel')).toBeInTheDocument();
            expect(screen.queryByTestId('architecture-panel')).not.toBeInTheDocument();
        });

        it('should swap to the block-libraries panel for an EDS stack', () => {
            setup({ selectedStack: 'eds-paas' });
            fireEvent.click(railRow('block-libraries'));
            expect(screen.getByTestId('block-libraries-panel')).toBeInTheDocument();
        });

        it('should not offer a block-libraries row for a non-EDS stack', () => {
            setup({ selectedStack: 'venia-paas' });
            expect(document.querySelector('[data-area-id="block-libraries"]')).toBeNull();
        });

        it('should keep the architecture panel when app-builder is gated (no stack)', () => {
            setup();
            // The row is disabled (not ready); clicking must not switch panes.
            fireEvent.click(railRow('app-builder-components'));
            expect(screen.getByTestId('architecture-panel')).toBeInTheDocument();
            expect(screen.queryByTestId('app-builder-panel')).not.toBeInTheDocument();
        });
    });

    describe('setCanProceed', () => {
        it('should call setCanProceed(false) when no stack is selected', () => {
            const { setCanProceed } = setup();
            expect(setCanProceed).toHaveBeenCalledWith(false);
        });

        it('should call setCanProceed(true) when a stack is selected', () => {
            const { setCanProceed } = setup({ selectedStack: 'eds-paas' });
            expect(setCanProceed).toHaveBeenCalledWith(true);
        });

        it('should re-evaluate setCanProceed(true) after a stack is chosen via the panel', () => {
            const { setCanProceed, rerender } = setup();
            act(() => {
                fireEvent.click(screen.getByTestId('select-stack'));
            });
            rerender();
            expect(setCanProceed).toHaveBeenLastCalledWith(true);
        });
    });

    describe('selection wiring (useProjectBuilder)', () => {
        it('should write selectedStack via the hook when the architecture panel selects a stack', () => {
            const { updateState } = setup();
            fireEvent.click(screen.getByTestId('select-stack'));
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ selectedStack: 'eds-paas' }),
            );
        });

        it('should mirror-write the mesh component id into selectedOptionalDependencies on mesh toggle', () => {
            const { updateState } = setup({ selectedStack: 'eds-paas' });
            // Navigate to the app-builder panel, then toggle the mesh row.
            fireEvent.click(railRow('app-builder-components'));
            fireEvent.click(screen.getByTestId('toggle-mesh'));
            expect(updateState).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    selectedOptionalDependencies: expect.arrayContaining([
                        COMPONENT_IDS.EDS_COMMERCE_MESH,
                    ]),
                }),
            );
        });

        it('should also record the toggled component in selectedAppBuilderComponents', () => {
            const { updateState } = setup({ selectedStack: 'eds-paas' });
            fireEvent.click(railRow('app-builder-components'));
            fireEvent.click(screen.getByTestId('toggle-mesh'));
            expect(updateState).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    selectedAppBuilderComponents: expect.arrayContaining(['commerce-paas-mesh']),
                }),
            );
        });
    });

    describe('onArchitectureChange threading', () => {
        it('should fire onArchitectureChange when the panel changes the stack', () => {
            const onArchitectureChange = jest.fn();
            // Start with a different stack so selecting eds-paas is a CHANGE.
            setup({ selectedStack: 'venia-paas' }, onArchitectureChange);
            fireEvent.click(screen.getByTestId('select-stack'));
            expect(onArchitectureChange).toHaveBeenCalledWith('venia-paas', 'eds-paas');
        });

        it('should NOT fire onArchitectureChange on the initial stack selection', () => {
            const onArchitectureChange = jest.fn();
            setup({}, onArchitectureChange);
            fireEvent.click(screen.getByTestId('select-stack'));
            expect(onArchitectureChange).not.toHaveBeenCalled();
        });
    });

    describe('custom App Builder component door', () => {
        it('should hide the custom-URL door in the builder (showCustomDoor=false)', () => {
            setup({ selectedStack: 'eds-paas' });
            fireEvent.click(railRow('app-builder-components'));
            expect(screen.getByTestId('app-builder-panel')).toHaveAttribute(
                'data-show-custom-door',
                'false',
            );
        });
    });
});
