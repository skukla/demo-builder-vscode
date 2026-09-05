/**
 * The view-mode toggle, and everything the shared Spectrum mock hides.
 *
 * This suite exists because of what it mocks. The repo-wide Spectrum mock
 * (`tests/__mocks__/@adobe/react-spectrum.tsx`) strips `UNSAFE_className`,
 * `UNSAFE_style` and `autoFocus` before anything reaches the DOM — so which
 * button LOOKS selected, and whether the search field takes focus, are
 * invisible to every suite that uses it. The per-suite mock is the documented
 * convention for exactly this; here it forwards those three so the decisions
 * can be asserted.
 *
 * `UNSAFE_style` is surfaced as a data attribute rather than a real `style`,
 * because the value is a CSS custom property (`var(--spectrum-…)`) and jsdom
 * drops it from a colour declaration — the assertion would then pass on an
 * empty string whatever the component decided.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('@adobe/react-spectrum', () => ({
    Flex: ({ children, ...props }: any) => <div {...stripLayout(props)}>{children}</div>,
    Text: ({ children, UNSAFE_className }: any) => <span className={UNSAFE_className}>{children}</span>,
    SearchField: ({ value, onChange, autoFocus, placeholder, 'aria-label': ariaLabel }: any) => (
        <input
            type="search"
            placeholder={placeholder}
            aria-label={ariaLabel}
            value={value ?? ''}
            autoFocus={autoFocus}
            onChange={(e) => onChange?.(e.target.value)}
        />
    ),
    ActionButton: ({
        children,
        onPress,
        isDisabled,
        UNSAFE_className,
        UNSAFE_style,
        'aria-label': ariaLabel,
        'aria-pressed': ariaPressed,
    }: any) => (
        <button
            onClick={onPress}
            disabled={isDisabled}
            aria-label={ariaLabel}
            aria-pressed={ariaPressed}
            className={UNSAFE_className}
            data-unsafe-style={JSON.stringify(UNSAFE_style ?? null)}
        >
            {children}
        </button>
    ),
    Tooltip: ({ children }: any) => <>{children}</>,
    TooltipTrigger: ({ children }: any) => <>{children}</>,
    ProgressCircle: ({ 'aria-label': ariaLabel }: any) => <span role="progressbar" aria-label={ariaLabel} />,
}));

jest.mock('@spectrum-icons/workflow/Refresh', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-refresh" />,
}));
jest.mock('@spectrum-icons/workflow/ViewGrid', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-viewgrid" />,
}));
jest.mock('@spectrum-icons/workflow/ViewList', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-viewlist" />,
}));

/** Spectrum layout props the real components consume and never emit as DOM attributes. */
function stripLayout(props: Record<string, unknown>): Record<string, unknown> {
    const {
        gap: _gap,
        alignItems: _alignItems,
        justifyContent: _justifyContent,
        marginBottom: _marginBottom,
        ...rest
    } = props;
    return rest;
}

// Below the mocks on purpose: babel-plugin-jest-hoist lifts them above the
// imports of THIS module, and the component must bind to the stubs.
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import type { SearchHeaderProps } from '@/core/ui/components/navigation/SearchHeader';

const SELECTED_BACKGROUND = 'var(--spectrum-global-color-gray-200)';

const baseProps: SearchHeaderProps = {
    searchQuery: '',
    onSearchQueryChange: jest.fn(),
    totalCount: 10,
    filteredCount: 10,
    hasLoadedOnce: true,
};

function renderHeader(overrides: Partial<SearchHeaderProps> = {}) {
    return render(<SearchHeader {...baseProps} {...overrides} />);
}

const cardsButton = (): HTMLElement => screen.getByRole('button', { name: 'Card view' });
const rowsButton = (): HTMLElement => screen.getByRole('button', { name: 'List view' });

/** The UNSAFE_style object the component handed the button. */
function unsafeStyle(el: HTMLElement): Record<string, unknown> | null {
    return JSON.parse(el.getAttribute('data-unsafe-style') ?? 'null');
}

describe('SearchHeader view toggle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('when it renders at all', () => {
        it('renders both toggle buttons when a mode and a handler are given', () => {
            renderHeader({ viewMode: 'cards', onViewModeChange: jest.fn() });

            expect(cardsButton()).toBeInTheDocument();
            expect(rowsButton()).toBeInTheDocument();
        });

        it('renders nothing without a current mode', () => {
            renderHeader({ onViewModeChange: jest.fn() });

            expect(screen.queryByRole('button', { name: 'Card view' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'List view' })).not.toBeInTheDocument();
        });

        it('renders nothing without a change handler', () => {
            // A toggle nothing listens to would look live and do nothing.
            renderHeader({ viewMode: 'cards' });

            expect(screen.queryByRole('button', { name: 'Card view' })).not.toBeInTheDocument();
        });
    });

    describe('which mode each button asks for', () => {
        it('asks for cards from the grid button', () => {
            const onViewModeChange = jest.fn();
            renderHeader({ viewMode: 'rows', onViewModeChange });

            fireEvent.click(cardsButton());

            expect(onViewModeChange).toHaveBeenCalledWith('cards');
        });

        it('asks for rows from the list button', () => {
            const onViewModeChange = jest.fn();
            renderHeader({ viewMode: 'cards', onViewModeChange });

            fireEvent.click(rowsButton());

            expect(onViewModeChange).toHaveBeenCalledWith('rows');
        });
    });

    describe('which button reads as the current one', () => {
        it('marks only the active mode as pressed', () => {
            renderHeader({ viewMode: 'cards', onViewModeChange: jest.fn() });

            expect(cardsButton()).toHaveAttribute('aria-pressed', 'true');
            expect(rowsButton()).toHaveAttribute('aria-pressed', 'false');
        });

        it('moves the pressed state with the mode', () => {
            renderHeader({ viewMode: 'rows', onViewModeChange: jest.fn() });

            expect(cardsButton()).toHaveAttribute('aria-pressed', 'false');
            expect(rowsButton()).toHaveAttribute('aria-pressed', 'true');
        });

        it('adds is-selected to the active button only', () => {
            renderHeader({ viewMode: 'cards', onViewModeChange: jest.fn() });

            expect(cardsButton().getAttribute('class')).toBe('cursor-pointer is-selected');
            expect(rowsButton().getAttribute('class')).toBe('cursor-pointer');
        });

        it('adds is-selected to the list button when rows is active', () => {
            renderHeader({ viewMode: 'rows', onViewModeChange: jest.fn() });

            expect(rowsButton().getAttribute('class')).toBe('cursor-pointer is-selected');
            expect(cardsButton().getAttribute('class')).toBe('cursor-pointer');
        });

        it('fills only the active button, and rounds both', () => {
            renderHeader({ viewMode: 'cards', onViewModeChange: jest.fn() });

            expect(unsafeStyle(cardsButton())).toEqual({
                backgroundColor: SELECTED_BACKGROUND,
                borderRadius: '4px',
            });
            expect(unsafeStyle(rowsButton())).toEqual({ borderRadius: '4px' });
        });

        it('moves the fill with the mode', () => {
            renderHeader({ viewMode: 'rows', onViewModeChange: jest.fn() });

            expect(unsafeStyle(rowsButton())?.backgroundColor).toBe(SELECTED_BACKGROUND);
            expect(unsafeStyle(cardsButton())?.backgroundColor).toBeUndefined();
        });
    });
});

describe('SearchHeader action-button group', () => {
    it('renders a lone action with no refresh and no toggle', () => {
        renderHeader({ action: <button type="button">New</button> });

        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    });

    it('renders no group at all when there is nothing to put in it', () => {
        // An empty group is not invisible: the count row is space-between, so a
        // zero-width sibling still occupies the end slot.
        const { container } = renderHeader({
            totalCount: 3,
            filteredCount: 3,
            searchThreshold: 5,
            alwaysShowCount: true,
        });

        const countRow = container.querySelector('.search-header')?.firstElementChild;
        expect(countRow?.children).toHaveLength(1);
    });
});

describe('SearchHeader search-field focus', () => {
    it('does not steal focus by default', () => {
        renderHeader();

        expect(document.activeElement).not.toBe(screen.getByPlaceholderText('Type to filter...'));
    });

    it('takes focus when the caller asks for it', () => {
        renderHeader({ autoFocus: true });

        expect(document.activeElement).toBe(screen.getByPlaceholderText('Type to filter...'));
    });
});
