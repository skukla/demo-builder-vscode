/**
 * BrandGallery Component Tests
 *
 * Tests for the coming-soon package status feature.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandGallery } from '@/features/project-creation/ui/components/BrandGallery';
import { DemoPackage, GitSource } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';

const mockGitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true, recursive: false },
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
});
