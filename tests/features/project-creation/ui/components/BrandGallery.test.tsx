/**
 * BrandGallery Component Tests (Slice 2 — Step 7)
 *
 * The gallery is now package-select ONLY (mark-and-Continue): clicking a card
 * selects the package and the wizard advances to the Project Builder step where
 * the stack + components + block libraries are chosen. The ArchitectureModal and
 * its modal-local state are retired — there is no dialog here anymore.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandGallery } from '@/features/project-creation/ui/components/BrandGallery';
import { DemoPackage, GitSource } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';

// Mock vscode API to prevent errors from postMessage calls
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
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

    describe('package selection (mark-and-Continue)', () => {
        it('calls onPackageSelect when clicking an active card', () => {
            render(<BrandGallery {...defaultProps} />);

            const cards = screen.getAllByTestId('package-card');
            fireEvent.click(cards[0]);

            expect(defaultProps.onPackageSelect).toHaveBeenCalledWith('active-brand');
        });

        it('does NOT open a dialog/modal when a card is clicked', () => {
            render(<BrandGallery {...defaultProps} />);

            const cards = screen.getAllByTestId('package-card');
            fireEvent.click(cards[0]);

            // Architecture selection moved to the Project Builder step.
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('does NOT call onStackSelect on a card click (stack chosen on next step)', () => {
            render(<BrandGallery {...defaultProps} />);

            const cards = screen.getAllByTestId('package-card');
            fireEvent.click(cards[0]);

            expect(defaultProps.onStackSelect).not.toHaveBeenCalled();
        });
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
    });

    describe('empty state', () => {
        it('renders an empty-state message when no packages are available', () => {
            render(<BrandGallery {...defaultProps} packages={[]} />);
            expect(screen.getByText(/no packages available/i)).toBeInTheDocument();
        });
    });
});
