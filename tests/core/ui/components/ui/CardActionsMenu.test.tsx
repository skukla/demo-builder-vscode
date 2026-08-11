/**
 * CardActionsMenu Tests
 *
 * The kebab-menu SHELL shared by ProjectActionsMenu and IntegrationCard, after an
 * architecture-duplication scan found the composition written twice (2026-07-31).
 * It owns exactly the error-prone part: containment, so a menu interaction never
 * reaches the click-to-open tile behind it, plus the Spectrum
 * MenuTrigger/ActionButton/Menu wiring.
 *
 * CONTENT belongs to the caller (flat Items here, Sections+SubmenuTrigger in
 * ProjectActionsMenu), so this suite covers the shell only.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Spectrum is mocked per-suite (directory convention). Menu renders its children
// EAGERLY — no popup — so items are queryable without opening anything; `...props`
// spreads last so a caller's data-testid wins.
jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isQuiet: _isQuiet, UNSAFE_className, ...props }: any) => (
        <button onClick={onPress} className={UNSAFE_className} {...props}>
            {children}
        </button>
    ),
    MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
    Menu: ({ children, onAction }: any) => (
        <ul data-testid="menu">
            {require('react').Children.map(children, (child: any) =>
                child ? (
                    <li>
                        <button onClick={() => onAction?.(child.key)}>
                            {child.props.children}
                        </button>
                    </li>
                ) : null
            )}
        </ul>
    ),
    Item: ({ children }: any) => <>{children}</>,
}));

jest.mock('@spectrum-icons/workflow/MoreSmallListVert', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-kebab" />,
}));

// Below the mocks on purpose: babel-plugin-jest-hoist lifts them above imports in
// THIS module, so the SUT binds to the stubs. (`import/first` is not a registered
// rule here — a disable comment for it would itself error.)
import { CardActionsMenu } from '@/core/ui/components/ui/CardActionsMenu';

const { Item } = jest.requireMock('@adobe/react-spectrum');

/** Two flat items — the integrations-card shape. */
function items() {
    return [<Item key="edit">Edit</Item>, <Item key="remove">Remove</Item>];
}

function renderMenu(props: Partial<React.ComponentProps<typeof CardActionsMenu>> = {}) {
    const onAction = jest.fn();
    const view = render(
        <CardActionsMenu ariaLabel="More actions for ERP Sync" onAction={onAction} {...props}>
            {items()}
        </CardActionsMenu>
    );
    return { onAction, ...view };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('CardActionsMenu', () => {
    it('renders a labelled kebab trigger', () => {
        renderMenu();

        expect(
            screen.getByRole('button', { name: 'More actions for ERP Sync' })
        ).toBeInTheDocument();
        expect(screen.getByTestId('icon-kebab')).toBeInTheDocument();
    });

    it('passes its children through as menu items', () => {
        renderMenu();

        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    });

    it('routes a pick to onAction with the item key', () => {
        const { onAction } = renderMenu();

        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

        expect(onAction).toHaveBeenCalledWith('remove');
    });

    it('applies the trigger className (the hover-reveal rule)', () => {
        renderMenu({ className: 'integration-card-menu-button' });

        expect(screen.getByRole('button', { name: /More actions/ })).toHaveClass(
            'integration-card-menu-button'
        );
    });

    // THE reason the shell is shared: these menus sit inside click-to-open tiles,
    // so a menu interaction must never activate the card behind it. Asserted by
    // clicking the child and checking the PARENT's effect did not happen.
    describe('containment', () => {
        it('stops a click from reaching the hosting tile', () => {
            const onTileClick = jest.fn();
            render(
                // A stand-in for the hosting tile. (No a11y disable comment: those
                // rules are not registered for test files, and naming an unknown
                // rule is itself an eslint error.)
                <div onClick={onTileClick}>
                    <CardActionsMenu ariaLabel="More actions" onAction={jest.fn()}>
                        {[<Item key="edit">Edit</Item>]}
                    </CardActionsMenu>
                </div>
            );

            fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

            expect(onTileClick).not.toHaveBeenCalled();
        });

        it('stops a keydown from reaching the hosting tile', () => {
            const onTileKeyDown = jest.fn();
            render(
                // A stand-in for the hosting tile — see the note above.
                <div onKeyDown={onTileKeyDown}>
                    <CardActionsMenu ariaLabel="More actions" onAction={jest.fn()}>
                        {[<Item key="edit">Edit</Item>]}
                    </CardActionsMenu>
                </div>
            );

            fireEvent.keyDown(screen.getByRole('button', { name: 'Edit' }), { key: 'Enter' });

            expect(onTileKeyDown).not.toHaveBeenCalled();
        });
    });
});
