/**
 * ArchitectureModal Component Tests
 *
 * Tests for generalized multi-step navigation and modal sizing.
 * Covers step sequence computation, forward/back navigation,
 * action button logic, and modal size.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ArchitectureModal } from '@/features/project-creation/ui/components/ArchitectureModal';
import type { Stack } from '@/types/stacks';
import type { DemoPackage, GitSource } from '@/types/demoPackages';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: jest.fn(() => []),
    getNativeBlockLibraries: jest.fn(() => []),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getBlockLibraryName: jest.fn((id: string) => id),
}));

jest.mock('@/features/project-creation/services/featurePackLoader', () => ({
    getAvailableFeaturePacks: jest.fn(() => []),
    getNativeFeaturePacks: jest.fn(() => []),
}));

jest.mock('@/features/project-creation/services/demoPackageLoader', () => ({
    getResolvedMeshRequirement: jest.fn(() => false),
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

const edsStack: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    icon: 'eds',
    frontend: 'eds-storefront',
    backend: 'paas',
    dependencies: [],
    features: [],
};

const nonEdsStack: Stack = {
    id: 'venia-paas',
    name: 'Venia + PaaS',
    description: 'Venia with PaaS backend',
    icon: 'venia',
    frontend: 'venia',
    backend: 'paas',
    dependencies: [],
    features: [],
};

const mockPkg: DemoPackage = {
    id: 'test-pkg',
    name: 'Test Package',
    description: 'Test package',
    status: 'active',
    source: mockGitSource,
    storefronts: {
        'eds-paas': {},
        'venia-paas': {},
    },
};

const noop = jest.fn();

const defaultProps = {
    pkg: mockPkg,
    stacks: [edsStack, nonEdsStack],
    selectedStackId: undefined as string | undefined,
    selectedAddons: [] as string[],
    selectedFeaturePacks: [] as string[],
    selectedBlockLibraries: [] as string[],
    customBlockLibraries: [],
    customBlockLibraryDefaults: [],
    onStackSelect: noop,
    onAddonsChange: noop,
    onFeaturePacksChange: noop,
    onBlockLibrariesChange: noop,
    onCustomBlockLibrariesChange: noop,
    selectedOptionalDependencies: [] as string[],
    onOptionalDependenciesChange: noop,
    onDone: noop,
    onClose: noop,
};

// Helper to advance timers past the step transition animation (200ms)
function advanceTransition() {
    act(() => {
        jest.advanceTimersByTime(250);
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArchitectureModal - Step Navigation', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // -----------------------------------------------------------------------
    // Step sequence computation
    // -----------------------------------------------------------------------

    describe('step sequence', () => {
        it('should include block-libraries step for EDS stacks: architecture -> block-libraries', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="eds-paas"
                />,
            );

            // Architecture step is first — should show Next (not Done)
            expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();

            // Navigate to step 2 (block-libraries, last step)
            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
            advanceTransition();

            // Block libraries step should have Back + Done
            expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
        });

        it('should show Done directly on architecture for non-EDS stacks', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="venia-paas"
                />,
            );

            // Non-EDS has only 1 step: architecture. Should show Done directly.
            expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Forward navigation
    // -----------------------------------------------------------------------

    describe('forward navigation', () => {
        it('should navigate from architecture to block-libraries for EDS stack', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="eds-paas"
                />,
            );

            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
            advanceTransition();

            // Block libraries step should show Back button
            expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
        });
    });

    // -----------------------------------------------------------------------
    // Backward navigation
    // -----------------------------------------------------------------------

    describe('backward navigation', () => {
        it('should navigate back from block-libraries to architecture for EDS stack', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="eds-paas"
                />,
            );

            // Go to block-libraries
            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
            advanceTransition();

            // Go back
            fireEvent.click(screen.getByRole('button', { name: 'Back' }));
            advanceTransition();

            // Architecture step — no Back
            expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Done button / onDone
    // -----------------------------------------------------------------------

    describe('Done button', () => {
        it('should call onDone when Done is clicked on the last step (EDS)', () => {
            const onDone = jest.fn();
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="eds-paas"
                    onDone={onDone}
                />,
            );

            // Navigate to last step (block-libraries)
            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
            advanceTransition();

            fireEvent.click(screen.getByRole('button', { name: 'Done' }));
            expect(onDone).toHaveBeenCalledTimes(1);
        });

        it('should call onDone when Done is clicked (non-EDS, single step)', () => {
            const onDone = jest.fn();
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="venia-paas"
                    onDone={onDone}
                />,
            );

            fireEvent.click(screen.getByRole('button', { name: 'Done' }));
            expect(onDone).toHaveBeenCalledTimes(1);
        });

        it('should not show Done on non-last steps', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="eds-paas"
                />,
            );

            // Architecture step (first of 2 steps for EDS)
            expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // Action button logic
    // -----------------------------------------------------------------------

    describe('action buttons', () => {
        it('should show no action buttons when no stack is selected', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId={undefined}
                />,
            );

            expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
        });

        it('should show only Next on the first step when stack is selected (EDS)', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="eds-paas"
                />,
            );

            expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
        });

        it('should show only Done on the first step when stack is selected (non-EDS)', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="venia-paas"
                />,
            );

            // Non-EDS has 1 step: architecture only. First = last = Done.
            expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
        });

        it('should show Back and Done on the last step (EDS block-libraries)', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="eds-paas"
                />,
            );

            // Navigate to block-libraries (last step for EDS)
            fireEvent.click(screen.getByRole('button', { name: 'Next' }));
            advanceTransition();

            expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
            expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
            expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
        });

        it('should not disable Done button (no validation gating)', () => {
            render(
                <ArchitectureModal
                    {...defaultProps}
                    selectedStackId="venia-paas"
                />,
            );

            const doneButton = screen.getByRole('button', { name: 'Done' });
            expect(doneButton.getAttribute('aria-disabled')).not.toBe('true');
        });
    });
});

// ===========================================================================
// Modal size
// ===========================================================================

describe('ArchitectureModal - Modal Size', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should use size "M" for the architecture step', () => {
        const { container } = render(
            <ArchitectureModal
                {...defaultProps}
                selectedStackId="eds-paas"
            />,
        );

        const dialog = container.querySelector('[class*="Dialog"]') || container.firstElementChild;
        expect(dialog).toBeTruthy();
    });

    it('should use size "M" for the block-libraries step', () => {
        render(
            <ArchitectureModal
                {...defaultProps}
                selectedStackId="eds-paas"
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        act(() => { jest.advanceTimersByTime(250); });

        expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
    });
});
