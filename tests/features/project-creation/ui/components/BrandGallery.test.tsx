/**
 * BrandGallery Component Tests
 *
 * Tests for the coming-soon package status feature and
 * custom block library URL input.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrandGallery } from '@/features/project-creation/ui/components/BrandGallery';
import { DemoPackage, GitSource } from '@/types/demoPackages';
import { Stack } from '@/types/stacks';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

// Mock vscode API to prevent errors from postMessage calls
jest.mock('@/core/ui/utils/vscode-api', () => ({
    vscode: { postMessage: jest.fn(), request: jest.fn() },
}));

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

    describe('custom block libraries', () => {
        it('should show URL and name inputs in block libraries step for EDS stacks', () => {
            openBlockLibrariesStep();

            // Custom block library section should have URL and Name inputs
            expect(screen.getByPlaceholderText('https://github.com/owner/repo')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Library Name')).toBeInTheDocument();
        });

        it('should auto-fill name field when valid URL is entered', () => {
            openBlockLibrariesStep();

            const urlInput = screen.getByPlaceholderText('https://github.com/owner/repo');
            fireEvent.change(urlInput, { target: { value: 'https://github.com/acme/my-blocks' } });

            const nameInput = screen.getByPlaceholderText('Library Name') as HTMLInputElement;
            expect(nameInput.value).toBe('My Blocks');
        });

        it('should allow editing the auto-filled name', () => {
            openBlockLibrariesStep();

            const urlInput = screen.getByPlaceholderText('https://github.com/owner/repo');
            fireEvent.change(urlInput, { target: { value: 'https://github.com/acme/my-blocks' } });

            const nameInput = screen.getByPlaceholderText('Library Name');
            fireEvent.change(nameInput, { target: { value: 'Custom Name' } });

            expect((nameInput as HTMLInputElement).value).toBe('Custom Name');
        });

        it('should add entry when Add button is clicked with valid URL and name', () => {
            const { onCustomBlockLibrariesChange } = openBlockLibrariesStep();

            const urlInput = screen.getByPlaceholderText('https://github.com/owner/repo');
            fireEvent.change(urlInput, { target: { value: 'https://github.com/acme/my-blocks' } });

            const nameInput = screen.getByPlaceholderText('Library Name');
            fireEvent.change(nameInput, { target: { value: 'My Blocks' } });

            const addButton = screen.getByText('Add');
            fireEvent.click(addButton);

            expect(onCustomBlockLibrariesChange).toHaveBeenCalledWith([
                { name: 'My Blocks', source: { owner: 'acme', repo: 'my-blocks', branch: 'main' } },
            ]);
        });

        it('should show validation error for invalid URL', () => {
            openBlockLibrariesStep();

            const urlInput = screen.getByPlaceholderText('https://github.com/owner/repo');
            fireEvent.change(urlInput, { target: { value: 'https://gitlab.com/acme/repo' } });

            expect(screen.getByText('Enter a valid GitHub URL')).toBeInTheDocument();
        });

        it('should show duplicate error when repo is already added', () => {
            const existingLibraries: CustomBlockLibrary[] = [
                { name: 'Existing', source: { owner: 'acme', repo: 'my-blocks', branch: 'main' } },
            ];

            openBlockLibrariesStep({ customBlockLibraries: existingLibraries });

            const urlInput = screen.getByPlaceholderText('https://github.com/owner/repo');
            fireEvent.change(urlInput, { target: { value: 'https://github.com/acme/my-blocks' } });

            const nameInput = screen.getByPlaceholderText('Library Name');
            fireEvent.change(nameInput, { target: { value: 'Duplicate' } });

            const addButton = screen.getByText('Add');
            fireEvent.click(addButton);

            expect(screen.getByText('This repository is already added')).toBeInTheDocument();
        });

        it('should disable Add button when name is empty', () => {
            openBlockLibrariesStep();

            const urlInput = screen.getByPlaceholderText('https://github.com/owner/repo');
            fireEvent.change(urlInput, { target: { value: 'https://github.com/acme/my-blocks' } });

            // Clear the auto-filled name
            const nameInput = screen.getByPlaceholderText('Library Name');
            fireEvent.change(nameInput, { target: { value: '' } });

            const addButton = screen.getByText('Add');
            expect(addButton).toBeDisabled();
        });

        it('should remove custom library when remove button is clicked', () => {
            const existingLibraries: CustomBlockLibrary[] = [
                { name: 'My Blocks', source: { owner: 'acme', repo: 'my-blocks', branch: 'main' } },
            ];

            const { onCustomBlockLibrariesChange } = openBlockLibrariesStep({
                customBlockLibraries: existingLibraries,
            });

            // Find the remove button for the existing library
            const removeButton = screen.getByTestId('remove-custom-library-0');
            fireEvent.click(removeButton);

            expect(onCustomBlockLibrariesChange).toHaveBeenCalledWith([]);
        });

        it('should pass custom libraries through on modal done', () => {
            const existingLibraries: CustomBlockLibrary[] = [
                { name: 'My Blocks', source: { owner: 'acme', repo: 'my-blocks', branch: 'main' } },
            ];

            const { onCustomBlockLibrariesChange } = openBlockLibrariesStep({
                customBlockLibraries: existingLibraries,
            });

            // Click "Done" on the block-libraries step
            const doneButton = screen.getByText('Done');
            fireEvent.click(doneButton);

            // Custom libraries should be synced to parent
            expect(onCustomBlockLibrariesChange).toHaveBeenCalled();
        });
    });
});
