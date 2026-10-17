/**
 * BlockLibrariesStepContent Component Tests
 *
 * The block libraries render as selection CARDS (the blue-check family) — multi-select
 * toggle buttons (`aria-pressed`); native libraries are locked, always-selected (disabled)
 * cards. Tests pin that contract for native, available, and custom libraries.
 *
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

/** Same repo NAME as customLib, different owner — a different library. */
const sameRepoOtherOwner: CustomBlockLibrary = {
    name: 'Their My-Blocks',
    source: { owner: 'otherorg', repo: 'my-blocks', branch: 'main' },
};

/** Same owner as customLib, different repo — also a different library. */
const sameOwnerOtherRepo: CustomBlockLibrary = {
    name: 'My Other Blocks',
    source: { owner: 'myorg', repo: 'other-blocks', branch: 'main' },
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

    // --- Native Libraries ---

    describe('native libraries', () => {
        it('should render native libraries as disabled, selected cards', () => {
            render(
                <BlockLibrariesStepContent {...defaultProps} nativeBlockLibraries={[nativeLib]} />
            );

            const card = screen.getByRole('button', { name: /Core Blocks/i });
            expect(card).toBeDisabled();
            expect(card).toHaveAttribute('aria-pressed', 'true');
        });

        it('should show "Included with your storefront" for native libraries', () => {
            render(
                <BlockLibrariesStepContent {...defaultProps} nativeBlockLibraries={[nativeLib]} />
            );

            expect(screen.getByText('Included with your storefront')).toBeInTheDocument();
        });
    });

    // --- Available Libraries ---

    describe('available libraries', () => {
        it('should render available libraries with name + description', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    availableBlockLibraries={[availableLib]}
                />
            );

            expect(screen.getByText('Commerce Blocks')).toBeInTheDocument();
            expect(screen.getByText('Commerce block library')).toBeInTheDocument();
        });

        it('should mark a library selected (aria-pressed) when in selectedBlockLibraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    availableBlockLibraries={[availableLib]}
                    selectedBlockLibraries={['commerce-blocks']}
                />
            );

            expect(screen.getByRole('button', { name: /Commerce Blocks/i })).toHaveAttribute(
                'aria-pressed',
                'true',
            );
        });

        it('should call onBlockLibraryToggle when a library card is clicked', () => {
            const onBlockLibraryToggle = jest.fn();
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    availableBlockLibraries={[availableLib]}
                    onBlockLibraryToggle={onBlockLibraryToggle}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /Commerce Blocks/i }));
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

        it('should mark a custom library selected when in customBlockLibraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    customBlockLibraries={[customLib]}
                />
            );

            expect(screen.getByRole('button', { name: /My Custom Lib/i })).toHaveAttribute(
                'aria-pressed',
                'true',
            );
        });

        it('should mark a custom library unselected when not in customBlockLibraries', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    customBlockLibraries={[]}
                />
            );

            expect(screen.getByRole('button', { name: /My Custom Lib/i })).toHaveAttribute(
                'aria-pressed',
                'false',
            );
        });

        // A card is selected only when BOTH halves of its source match. Half a match
        // is a different library, and showing it as selected would tell the SC a
        // library is going into the storefront when a different one is.
        it('should stay unselected when only the repo name matches a selection', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    customBlockLibraries={[sameRepoOtherOwner]}
                />
            );

            expect(screen.getByRole('button', { name: /My Custom Lib/i })).toHaveAttribute(
                'aria-pressed',
                'false',
            );
        });

        it('should stay unselected when only the owner matches a selection', () => {
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    customBlockLibraries={[sameOwnerOtherRepo]}
                />
            );

            expect(screen.getByRole('button', { name: /My Custom Lib/i })).toHaveAttribute(
                'aria-pressed',
                'false',
            );
        });

        it('should call onCustomLibraryToggle when a custom library card is clicked', () => {
            const onCustomLibraryToggle = jest.fn();
            render(
                <BlockLibrariesStepContent
                    {...defaultProps}
                    customBlockLibraryDefaults={[customLib]}
                    onCustomLibraryToggle={onCustomLibraryToggle}
                />
            );

            fireEvent.click(screen.getByRole('button', { name: /My Custom Lib/i }));
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
