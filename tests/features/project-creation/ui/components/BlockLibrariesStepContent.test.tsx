/**
 * BlockLibrariesStepContent Component Tests
 *
 * Tests for the extracted block libraries step sub-component that renders
 * native libraries, available libraries, and custom libraries sections.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BlockLibrariesStepContent } from '@/features/project-creation/ui/components/BlockLibrariesStepContent';
import type { BlockLibrary, CustomBlockLibrary } from '@/types/blockLibraries';

const nativeLib: BlockLibrary = {
    id: 'core-blocks',
    name: 'Core Blocks',
    description: 'Core block library',
    type: 'storefront',
    source: { owner: 'adobe', repo: 'core-blocks', branch: 'main' },
    stackTypes: ['eds-storefront'],
    nativeForPackages: ['citisignal'],
};

const availableLib: BlockLibrary = {
    id: 'commerce-blocks',
    name: 'Commerce Blocks',
    description: 'Commerce block library',
    type: 'standalone',
    source: { owner: 'adobe', repo: 'commerce-blocks', branch: 'main' },
    stackTypes: ['eds-storefront'],
};

const customLib: CustomBlockLibrary = {
    name: 'My Custom Lib',
    source: { owner: 'myorg', repo: 'my-blocks', branch: 'main' },
};

const customLib2: CustomBlockLibrary = {
    name: 'Another Custom Lib',
    source: { owner: 'otherorg', repo: 'other-blocks', branch: 'main' },
};

const noop = jest.fn();

describe('BlockLibrariesStepContent', () => {
    const defaultProps = {
        nativeBlockLibraries: [] as BlockLibrary[],
        availableBlockLibraries: [] as BlockLibrary[],
        selectedBlockLibraries: [] as string[],
        onBlockLibraryToggle: noop,
        customBlockLibraryDefaults: [] as CustomBlockLibrary[],
        customBlockLibraries: [] as CustomBlockLibrary[],
        onCustomLibraryToggle: noop,
        onOpenCustomSettings: noop,
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    // --- Header ---

    it('should render the header text', () => {
        render(<BlockLibrariesStepContent {...defaultProps} />);

        expect(screen.getByText('Which block libraries should be included?')).toBeInTheDocument();
    });

    it('should render the intro text about native blocks', () => {
        render(<BlockLibrariesStepContent {...defaultProps} />);

        expect(
            screen.getByText(/native blocks are always included/i)
        ).toBeInTheDocument();
    });

    // --- Native Libraries ---

    describe('native libraries', () => {
        it('should render native libraries as disabled checked checkboxes', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    nativeBlockLibraries={[nativeLib]}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Core Blocks/i });
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeDisabled();
        });

        it('should show "Included with your storefront" for native libraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    nativeBlockLibraries={[nativeLib]}
                />
            );

            expect(screen.getByText('Included with your storefront')).toBeInTheDocument();
        });
    });

    // --- Available Libraries ---

    describe('available libraries', () => {
        it('should render available libraries with checkboxes', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    availableBlockLibraries={[availableLib]}
                />
            );

            expect(screen.getByText('Commerce Blocks')).toBeInTheDocument();
            expect(screen.getByText('Commerce block library')).toBeInTheDocument();
        });

        it('should show library as checked when in selectedBlockLibraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    availableBlockLibraries={[availableLib]}
                    selectedBlockLibraries={['commerce-blocks']}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Commerce Blocks/i });
            expect(checkbox).toBeChecked();
        });

        it('should call onBlockLibraryToggle when library checkbox toggled', () => {
            const onBlockLibraryToggle = jest.fn();
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    availableBlockLibraries={[availableLib]}
                    onBlockLibraryToggle={onBlockLibraryToggle}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /Commerce Blocks/i });
            fireEvent.click(checkbox);
            expect(onBlockLibraryToggle).toHaveBeenCalledWith('commerce-blocks', true);
        });
    });

    // --- Custom Libraries ---

    describe('custom libraries', () => {
        it('should render custom libraries section when customBlockLibraryDefaults is non-empty', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                />
            );

            expect(screen.getByText('Custom Libraries')).toBeInTheDocument();
            expect(screen.getByText('My Custom Lib')).toBeInTheDocument();
        });

        it('should not render custom libraries section when customBlockLibraryDefaults is empty', () => {
            render(<BlockLibrariesStepContent {...defaultProps} />);

            expect(screen.queryByText('Custom Libraries')).not.toBeInTheDocument();
        });

        it('should show custom library source as description', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                />
            );

            expect(screen.getByText('myorg/my-blocks')).toBeInTheDocument();
        });

        it('should show custom library as checked when in customBlockLibraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    customBlockLibraries={[customLib]}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /My Custom Lib/i });
            expect(checkbox).toBeChecked();
        });

        it('should show custom library as unchecked when not in customBlockLibraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    customBlockLibraries={[]}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /My Custom Lib/i });
            expect(checkbox).not.toBeChecked();
        });

        it('should call onCustomLibraryToggle when custom library checkbox toggled', () => {
            const onCustomLibraryToggle = jest.fn();
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    onCustomLibraryToggle={onCustomLibraryToggle}
                />
            );

            const checkbox = screen.getByRole('checkbox', { name: /My Custom Lib/i });
            fireEvent.click(checkbox);
            expect(onCustomLibraryToggle).toHaveBeenCalledWith(customLib, true);
        });

        it('should render settings link for custom libraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                />
            );

            expect(screen.getByText('Configure custom libraries in Settings')).toBeInTheDocument();
        });

        it('should call onOpenCustomSettings when settings link is clicked', () => {
            const onOpenCustomSettings = jest.fn();
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    onOpenCustomSettings={onOpenCustomSettings}
                />
            );

            fireEvent.click(screen.getByText('Configure custom libraries in Settings'));
            expect(onOpenCustomSettings).toHaveBeenCalled();
        });

        it('should render multiple custom libraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib, customLib2]}
                />
            );

            expect(screen.getByText('My Custom Lib')).toBeInTheDocument();
            expect(screen.getByText('Another Custom Lib')).toBeInTheDocument();
        });
    });
});
