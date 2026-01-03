/**
 * SearchField Component Tests
 *
 * Tests the SearchField form component built with React Aria
 * for accessibility and CSS Modules for styling.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SearchField } from '@/core/ui/components/aria/forms';

describe('SearchField', () => {
    describe('basic rendering', () => {
        it('should render input element', () => {
            // Given: SearchField component
            render(<SearchField aria-label="Search" />);

            // Then: Input exists with search semantics
            expect(screen.getByRole('searchbox')).toBeInTheDocument();
        });

        it('should display placeholder', () => {
            // Given: SearchField with placeholder
            render(<SearchField placeholder="Type to filter..." aria-label="Search" />);

            // Then: Input has placeholder
            const input = screen.getByRole('searchbox');
            expect(input).toHaveAttribute('placeholder', 'Type to filter...');
        });
    });

    describe('value handling', () => {
        it('should handle value and onChange', async () => {
            // Given: SearchField with onChange handler
            const user = userEvent.setup();
            const onChange = jest.fn();
            render(<SearchField value="" onChange={onChange} aria-label="Search" />);

            // When: User types
            const input = screen.getByRole('searchbox');
            await user.type(input, 'test');

            // Then: onChange called
            expect(onChange).toHaveBeenCalled();
        });
    });

    describe('clear button', () => {
        it('should show clear button when has value', () => {
            // Given: SearchField with value
            render(<SearchField value="search term" aria-label="Search" />);

            // Then: Clear button is visible
            expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
        });

        it('should hide clear button when empty', () => {
            // Given: Empty SearchField
            render(<SearchField value="" aria-label="Search" />);

            // Then: Clear button is NOT visible
            expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
        });

        it('should clear value on clear button click', async () => {
            // Given: SearchField with value and onChange
            const user = userEvent.setup();
            const onChange = jest.fn();
            render(
                <SearchField value="search term" onChange={onChange} aria-label="Search" />
            );

            // When: Clear button is clicked
            const clearButton = screen.getByRole('button', { name: /clear/i });
            await user.click(clearButton);

            // Then: onChange called with empty string
            expect(onChange).toHaveBeenCalledWith('');
        });

        it('should clear value on Escape key', async () => {
            // Given: SearchField with value and onChange
            const user = userEvent.setup();
            const onChange = jest.fn();
            render(
                <SearchField value="search term" onChange={onChange} aria-label="Search" />
            );

            // When: Escape key is pressed
            const input = screen.getByRole('searchbox');
            await user.click(input);
            await user.keyboard('{Escape}');

            // Then: onChange called with empty string
            expect(onChange).toHaveBeenCalledWith('');
        });
    });

    describe('isQuiet variant', () => {
        it('should support isQuiet prop', () => {
            // Given: SearchField with isQuiet
            const { container } = render(
                <SearchField isQuiet aria-label="Search" />
            );

            // Then: Has quiet styling
            const searchField = container.querySelector('[class*="searchField"]');
            expect(searchField).toHaveClass('quiet');
        });
    });

    describe('width prop', () => {
        it('should support width prop', () => {
            // Given: SearchField with width
            const { container } = render(
                <SearchField width="100%" aria-label="Search" />
            );

            // Then: Has width style
            const searchField = container.querySelector('[class*="searchField"]');
            expect(searchField).toHaveStyle({ width: '100%' });
        });
    });

    describe('autoFocus', () => {
        it('should support autoFocus prop', () => {
            // Given: SearchField with autoFocus
            render(<SearchField autoFocus aria-label="Search" />);

            // Then: Input is focused
            const input = screen.getByRole('searchbox');
            expect(input).toHaveFocus();
        });
    });

    describe('accessibility', () => {
        it('should support aria-label', () => {
            // Given: SearchField with aria-label
            render(<SearchField aria-label="Filter projects" />);

            // Then: Input has aria-label
            const input = screen.getByRole('searchbox', { name: 'Filter projects' });
            expect(input).toBeInTheDocument();
        });

        it('should have accessible search icon', () => {
            // Given: SearchField component
            const { container } = render(<SearchField aria-label="Search" />);

            // Then: Search icon has aria-hidden
            const searchIcon = container.querySelector('[aria-hidden="true"]');
            expect(searchIcon).toBeInTheDocument();
        });
    });

    describe('isDisabled', () => {
        it('should support isDisabled prop', () => {
            // Given: Disabled SearchField
            render(<SearchField isDisabled aria-label="Search" />);

            // Then: Input is disabled
            const input = screen.getByRole('searchbox');
            expect(input).toBeDisabled();
        });
    });

    describe('ref forwarding', () => {
        it('should forward ref to input element', () => {
            // Given: Ref object
            const ref = React.createRef<HTMLInputElement>();

            // When: Render with ref
            render(<SearchField ref={ref} aria-label="Search" />);

            // Then: Ref points to input
            expect(ref.current).toBeInstanceOf(HTMLInputElement);
        });
    });

    describe('displayName', () => {
        it('should have displayName set for DevTools', () => {
            // Then: Component has displayName
            expect(SearchField.displayName).toBe('SearchField');
        });
    });
});
