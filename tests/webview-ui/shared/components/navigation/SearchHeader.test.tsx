/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('SearchHeader', () => {
    const defaultProps = {
        searchQuery: '',
        onSearchQueryChange: jest.fn(),
        totalCount: 10,
        filteredCount: 10,
        hasLoadedOnce: true,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('search field visibility', () => {
        it('should show search field when totalCount > threshold', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={6}
                    filteredCount={6}
                    searchThreshold={5}
                />
            );

            expect(
                screen.getByPlaceholderText(/type to filter/i)
            ).toBeInTheDocument();
        });

        it('should hide search field when totalCount <= threshold', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={5}
                    filteredCount={5}
                    searchThreshold={5}
                />
            );

            expect(
                screen.queryByPlaceholderText(/type to filter/i)
            ).not.toBeInTheDocument();
        });

        it('should use custom placeholder text', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={10}
                    searchPlaceholder="Filter projects..."
                />
            );

            expect(
                screen.getByPlaceholderText(/filter projects/i)
            ).toBeInTheDocument();
        });

        it('should call onSearchQueryChange when typing', () => {
            const onSearchQueryChange = jest.fn();
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={10}
                    onSearchQueryChange={onSearchQueryChange}
                />
            );

            const searchField = screen.getByPlaceholderText(/type to filter/i);
            fireEvent.change(searchField, { target: { value: 'test' } });

            expect(onSearchQueryChange).toHaveBeenCalledWith('test');
        });
    });

    describe('count display', () => {
        it('should show count when hasLoadedOnce is true', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={10}
                    hasLoadedOnce={true}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('10 items')).toBeInTheDocument();
        });

        it('should hide count when hasLoadedOnce is false', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={10}
                    hasLoadedOnce={false}
                />
            );

            expect(screen.queryByText(/items/i)).not.toBeInTheDocument();
        });

        it('should show filtered count when filtering', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    searchQuery="test"
                    totalCount={10}
                    filteredCount={3}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('Showing 3 of 10 items')).toBeInTheDocument();
        });

        it('should use singular noun when count is 1', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={1}
                    filteredCount={1}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('1 item')).toBeInTheDocument();
        });

        it('should use custom itemNoun', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={5}
                    filteredCount={5}
                    itemNoun="project"
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('5 projects')).toBeInTheDocument();
        });
    });

    describe('refresh button', () => {
        it('should show refresh button when onRefresh is provided', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    onRefresh={jest.fn()}
                />
            );

            expect(
                screen.getByRole('button', { name: /refresh/i })
            ).toBeInTheDocument();
        });

        it('should hide refresh button when onRefresh is not provided', () => {
            renderWithProvider(<SearchHeader {...defaultProps} />);

            expect(
                screen.queryByRole('button', { name: /refresh/i })
            ).not.toBeInTheDocument();
        });

        it('should call onRefresh when button is clicked', () => {
            const onRefresh = jest.fn();
            renderWithProvider(
                <SearchHeader {...defaultProps} onRefresh={onRefresh} />
            );

            fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

            expect(onRefresh).toHaveBeenCalledTimes(1);
        });

        it('should be disabled when isRefreshing is true', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    onRefresh={jest.fn()}
                    isRefreshing={true}
                />
            );

            expect(
                screen.getByRole('button', { name: /refresh/i })
            ).toBeDisabled();
        });

        it('should use custom refresh aria label', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    onRefresh={jest.fn()}
                    refreshAriaLabel="Reload projects"
                />
            );

            expect(
                screen.getByRole('button', { name: /reload projects/i })
            ).toBeInTheDocument();
        });
    });

    describe('alwaysShowCount', () => {
        it('should show count even with 0 items when alwaysShowCount is true', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={0}
                    filteredCount={0}
                    hasLoadedOnce={true}
                    alwaysShowCount={true}
                />
            );

            expect(screen.getByText('0 items')).toBeInTheDocument();
        });

        it('should hide count when 0 items and alwaysShowCount is false', () => {
            renderWithProvider(
                <SearchHeader
                    {...defaultProps}
                    totalCount={0}
                    filteredCount={0}
                    hasLoadedOnce={true}
                    alwaysShowCount={false}
                />
            );

            expect(screen.queryByText(/items/i)).not.toBeInTheDocument();
        });
    });
});
