/**
 * BrandGallery Component Tests
 *
 * Tests for the coming-soon package status feature and
 * custom block library checkbox UX (settings-based selection).
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrandGallery } from '@/features/project-creation/ui/components/BrandGallery';
import { DemoPackage, GitSource } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

// Mock vscode API to prevent errors from postMessage calls
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

// Import the mock for assertions
import { vscode as mockVscode } from '@/core/ui/utils/vscode-api';

// Mock blockLibraryLoader used by ArchitectureModal
jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getAvailableBlockLibraries: jest.fn(() => []),
    getNativeBlockLibraries: jest.fn(() => []),
    getDefaultBlockLibraryIds: jest.fn(() => []),
    getBlockLibraryName: jest.fn((id: string) => id),
}));

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

const mockStacks: Stack[] = [
    {
        id: 'eds-paas',
        name: 'EDS + PaaS',
        description: 'Edge Delivery with PaaS backend',
        icon: 'eds',
        frontend: 'eds',
        backend: 'paas',
        dependencies: [],
        features: [],
    },
];

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

const activePackage: DemoPackage = {
    id: 'active-brand',
    name: 'Active Brand',
    description: 'An active brand',
    configDefaults: {},
    storefronts: {
        'eds-paas': {
            name: 'Active EDS + PaaS',
            description: 'Active storefront',
            source: mockGitSource,
        },
    },
};

const comingSoonPackage: DemoPackage = {
    id: 'soon-brand',
    name: 'Soon Brand',
    description: 'A coming soon brand',
    status: 'coming-soon',
    configDefaults: {},
    storefronts: {},
};

/**
 * Helper: click the active card to open the architecture modal,
 * select the EDS stack, then click "Next" to reach block-libraries step.
 * Uses fake timers to handle the 200ms step transition.
 */
function openBlockLibrariesStep(props: Record<string, unknown> = {}) {
    jest.useFakeTimers();

    const onPackageSelect = jest.fn();
    const onStackSelect = jest.fn();
    const onAddonsChange = jest.fn();
    const onBlockLibrariesChange = jest.fn();
    const onCustomBlockLibrariesChange = jest.fn();

    const result = render(
        <BrandGallery
            packages={[activePackage]}
            stacks={[edsStack]}
            selectedPackage="active-brand"
            selectedStack="eds-paas"
            onPackageSelect={onPackageSelect}
            onStackSelect={onStackSelect}
            onAddonsChange={onAddonsChange}
            onBlockLibrariesChange={onBlockLibrariesChange}
            onCustomBlockLibrariesChange={onCustomBlockLibrariesChange}
            {...props}
        />,
    );

    // Click the active card to open the modal
    const card = screen.getByTestId('package-card');
    fireEvent.click(card);

    // Select EDS stack in the modal (use the radio role to avoid ambiguity with card text)
    const stackRadio = screen.getByRole('radio');
    fireEvent.click(stackRadio);

    // Click "Next" to go to block-libraries step
    const nextButton = screen.getByText('Next');
    fireEvent.click(nextButton);

    // Advance timers to complete the 200ms step transition
    act(() => {
        jest.advanceTimersByTime(250);
    });

    jest.useRealTimers();

    return {
        ...result,
        onCustomBlockLibrariesChange,
        onBlockLibrariesChange,
    };
}

describe('BrandGallery', () => {
    const defaultProps = {
        packages: [activePackage, comingSoonPackage],
        stacks: mockStacks,
        onPackageSelect: jest.fn(),
        onStackSelect: jest.fn(),
        onAddonsChange: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('coming-soon packages', () => {
        it('should render coming-soon card with aria-disabled and badge text', () => {
            render(<BrandGallery {...defaultProps} />);

            const cards = screen.getAllByTestId('package-card');
            const comingSoonCard = cards[1]; // second package

            expect(comingSoonCard).toHaveAttribute('aria-disabled', 'true');
            expect(comingSoonCard).toHaveClass('coming-soon');
            expect(screen.getByText('Coming Soon')).toBeInTheDocument();
        });

        it('should not have aria-disabled on active packages', () => {
            render(<BrandGallery {...defaultProps} />);

            const cards = screen.getAllByTestId('package-card');
            const activeCard = cards[0];

            expect(activeCard).not.toHaveAttribute('aria-disabled');
            expect(activeCard).not.toHaveClass('coming-soon');
        });

        it('should not call onPackageSelect when clicking a coming-soon card', () => {
            render(<BrandGallery {...defaultProps} />);

            const cards = screen.getAllByTestId('package-card');
            fireEvent.click(cards[1]);

            expect(defaultProps.onPackageSelect).not.toHaveBeenCalled();
        });

        it('should call onPackageSelect when clicking an active card', () => {
            render(<BrandGallery {...defaultProps} />);

            const cards = screen.getAllByTestId('package-card');
            fireEvent.click(cards[0]);

            expect(defaultProps.onPackageSelect).toHaveBeenCalledWith('active-brand');
        });
    });

    describe('custom block libraries (checkbox UX)', () => {
        const mockCustomDefaults: CustomBlockLibrary[] = [
            { name: 'Acme Blocks', source: { owner: 'acme', repo: 'custom-blocks', branch: 'main' } },
            { name: 'Beta Lib', source: { owner: 'beta-org', repo: 'beta-blocks', branch: 'main' } },
        ];

        it('should show custom section when customBlockLibraryDefaults has entries', () => {
            openBlockLibrariesStep({ customBlockLibraryDefaults: mockCustomDefaults });

            expect(screen.getByText('Custom Libraries')).toBeInTheDocument();
        });

        it('should hide custom section when customBlockLibraryDefaults is empty', () => {
            openBlockLibrariesStep({ customBlockLibraryDefaults: [] });

            expect(screen.queryByText('Custom Libraries')).not.toBeInTheDocument();
        });

        it('should show settings link in custom section', () => {
            openBlockLibrariesStep({ customBlockLibraryDefaults: mockCustomDefaults });

            expect(screen.getByText('Configure custom libraries in Settings')).toBeInTheDocument();
        });

        it('should send open-block-library-settings message when settings link is clicked', () => {
            openBlockLibrariesStep({ customBlockLibraryDefaults: mockCustomDefaults });

            const settingsLink = screen.getByText('Configure custom libraries in Settings');
            fireEvent.click(settingsLink);

            expect(mockVscode.postMessage).toHaveBeenCalledWith(
                'open-block-library-settings',
            );
        });

        it('should render each custom library default as a checkbox', () => {
            openBlockLibrariesStep({ customBlockLibraryDefaults: mockCustomDefaults });

            // Each library should appear as a checkbox with its name
            expect(screen.getByText('Acme Blocks')).toBeInTheDocument();
            expect(screen.getByText('Beta Lib')).toBeInTheDocument();
            // Should also show owner/repo as description
            expect(screen.getByText('acme/custom-blocks')).toBeInTheDocument();
            expect(screen.getByText('beta-org/beta-blocks')).toBeInTheDocument();
        });

        it('should toggle individual custom library on check/uncheck', () => {
            const { onCustomBlockLibrariesChange } = openBlockLibrariesStep({
                customBlockLibraryDefaults: mockCustomDefaults,
                customBlockLibraries: [mockCustomDefaults[0]],
            });

            // Find the checkbox for Acme Blocks inside the modal (may appear in card too)
            const acmeElements = screen.getAllByText('Acme Blocks');
            // Get the one inside a label (checkbox) - the modal checkbox
            const acmeInCheckbox = acmeElements.find(el => el.closest('label'));
            expect(acmeInCheckbox).toBeTruthy();
            fireEvent.click(acmeInCheckbox!.closest('label')!);

            // Should have been called with the library removed
            expect(onCustomBlockLibrariesChange).toHaveBeenCalledWith([]);
        });

        it('should pre-select custom defaults when modal opens with no existing selections', () => {
            openBlockLibrariesStep({
                customBlockLibraryDefaults: mockCustomDefaults,
                // No customBlockLibraries passed = empty, should fall back to defaults
            });

            // Both defaults should be pre-checked (names visible as checked checkboxes)
            const acmeText = screen.getByText('Acme Blocks');
            const betaText = screen.getByText('Beta Lib');
            expect(acmeText).toBeInTheDocument();
            expect(betaText).toBeInTheDocument();

            // The checkboxes should be selected (defaults used as initial value)
            // Find the checkbox inputs within the custom section
            const acmeCheckbox = acmeText.closest('label')?.querySelector('input[type="checkbox"]');
            const betaCheckbox = betaText.closest('label')?.querySelector('input[type="checkbox"]');
            expect(acmeCheckbox).toBeChecked();
            expect(betaCheckbox).toBeChecked();
        });

        it('should sync selected custom libraries to parent on Done', () => {
            const { onCustomBlockLibrariesChange } = openBlockLibrariesStep({
                customBlockLibraryDefaults: mockCustomDefaults,
                // Defaults will be pre-selected (fallback behavior)
            });

            // Click Done on the block-libraries step
            const doneButton = screen.getByText('Done');
            fireEvent.click(doneButton);

            // Custom libraries should be synced to parent
            expect(onCustomBlockLibrariesChange).toHaveBeenCalledWith(mockCustomDefaults);
        });
    });
});
