/**
 * IntegrationCard Tests (integrations grid — Step 4)
 *
 * The grid's calm card face: name, status dot + label, a source line when the
 * card has one, its kebab (`model.menuActions`) carrying EVERY verb, and
 * the overflow menu carrying `model.menuActions`. A healthy card shows NO face
 * button — Open lives in the menu — so a visible one always means the card needs
 * you. The card is dumb: clicks open the drawer via `onOpen(id)`, and every
 * affordance routes through `onAction(model, kind)` WITHOUT triggering `onOpen`.
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntegrationCard } from '@/features/dashboard/ui/components/integrations/IntegrationCard';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import '@testing-library/jest-dom';

// The Menu mock renders items EAGERLY (no popup) — the directory convention;
// each Item becomes a button firing the parent Menu's onAction with its key.
jest.mock('@adobe/react-spectrum', () => ({
        ActionButton: ({ children, onPress, isQuiet: _q, UNSAFE_className, ...props }: any) => (
            <button onClick={onPress} className={UNSAFE_className} {...props}>
                {children}
            </button>
        ),
        Button: ({ children, onPress, isDisabled, variant, ...props }: any) => (
            <button onClick={onPress} disabled={isDisabled} data-variant={variant} {...props}>
                {children}
            </button>
        ),
        Link: ({ children, onPress, isQuiet, ...props }: any) => (
            <span role="link" tabIndex={0} data-quiet={isQuiet} onClick={onPress} {...props}>
                {children}
            </span>
        ),
        MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
        Menu: ({ children, onAction }: any) => (
            <ul data-testid="card-menu">
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
    Text: ({ children }: any) => <span>{children}</span>,
}));

jest.mock('@spectrum-icons/workflow/More', () => ({
    __esModule: true,
    default: () => <span data-testid="icon-more" />,
}));

jest.mock('@/core/ui/components/ui/StatusDot', () => ({
    StatusDot: ({ variant, className }: any) => (
        <span data-testid="status-dot" data-variant={variant} className={className} />
    ),
}));

/** A deployed integration card model (the richest face: Open↗ link). */
function makeModel(overrides: Partial<IntegrationCardModel> = {}): IntegrationCardModel {
    return {
        id: 'erp-sync',
        isMesh: false,
        name: 'ERP Sync',
        kindLabel: 'Pre-built',
        sourceLine: 'acme/erp-sync',
        sourceIsAi: false,
        status: 'deployed',
        statusLabel: 'Deployed',
        dotVariant: 'success',
        url: 'https://example.com/app',
        urlLabel: 'App URL',
        menuActions: ['open', 'manage-apis', 'remove'],
        canRename: true,
        ...overrides,
    };
}

function renderCard(model: IntegrationCardModel) {
    const onOpen = jest.fn();
    const onAction = jest.fn();
    const onRename = jest.fn();
    const view = render(
        <IntegrationCard model={model} onOpen={onOpen} onAction={onAction} onRename={onRename} />
    );
    const card = view.container.querySelector('.integration-card') as HTMLElement;
    return { onOpen, onAction, onRename, card, container: view.container };
}

describe('IntegrationCard', () => {
    it('renders name, dot variant, and status label', () => {
        renderCard(makeModel());

        expect(screen.getByText('ERP Sync')).toBeInTheDocument();
        expect(screen.getByTestId('status-dot')).toHaveAttribute('data-variant', 'success');
        expect(screen.getByText('Deployed')).toBeInTheDocument();
    });

    it('is a keyboard-reachable button (role + tabIndex)', () => {
        const { card } = renderCard(makeModel());

        expect(card).toHaveAttribute('role', 'button');
        expect(card).toHaveAttribute('tabindex', '0');
    });

    it('opens the drawer on click', () => {
        const { onOpen, card } = renderCard(makeModel());

        fireEvent.click(card);

        expect(onOpen).toHaveBeenCalledWith('erp-sync');
    });

    it('opens the drawer on Enter', () => {
        const { onOpen, card } = renderCard(makeModel());

        fireEvent.keyDown(card, { key: 'Enter' });

        expect(onOpen).toHaveBeenCalledWith('erp-sync');
    });

    it('opens the drawer on Space', () => {
        const { onOpen, card } = renderCard(makeModel());

        fireEvent.keyDown(card, { key: ' ' });

        expect(onOpen).toHaveBeenCalledWith('erp-sync');
    });

    // The status verb is a MENU item, not a face button. It used to be the latter,
    // wrapped in stopPropagation so it would not also trigger the card's own click
    // — the conflicting-nested-action problem Spectrum deprecated quick actions
    // over. The containment pin still matters; it is just the kebab's job now.
    it('fires onAction for the status verb WITHOUT opening the drawer (containment pin)', () => {
        const model = makeModel({
            status: 'not-deployed',
            statusLabel: 'Not deployed',
            dotVariant: 'neutral',
            menuActions: ['deploy', 'manage-apis', 'remove'],
        });
        const { onOpen, onAction } = renderCard(model);

        fireEvent.click(screen.getByRole('button', { name: /^deploy$/i }));

        expect(onAction).toHaveBeenCalledWith(model, 'deploy');
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('routes the deployed Open MENU item to onAction(open) without opening the flyout', () => {
        const model = makeModel();
        const { onOpen, onAction } = renderCard(model);

        // A menu item now, not a face link — the mock renders Menu items eagerly
        // as buttons, so query by role button.
        fireEvent.click(screen.getByRole('button', { name: /^open$/i }));

        expect(onAction).toHaveBeenCalledWith(model, 'open');
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('shows the pulsing dot and NO affordance while deploying', () => {
        const { card } = renderCard(
            makeModel({
                status: 'deploying',
                statusLabel: 'Deploying…',
                dotVariant: 'info',
            }),
        );

        // StatusDot is MOCKED here, so asserting the pulse class would test the
        // mock. The card's own responsibility is handing over the right variant;
        // that `info` pulses is StatusDot's contract, pinned in its suite.
        expect(screen.getByTestId('status-dot')).toHaveAttribute('data-variant', 'info');
        expect(card.querySelector('.integration-card-foot button')).toBeNull();
        expect(card.querySelector('.integration-card-foot [role="link"]')).toBeNull();
    });

    it('does not pulse the dot outside deploying', () => {
        renderCard(makeModel());

        expect(screen.getByTestId('status-dot')).not.toHaveAttribute('data-variant', 'info');
    });

    it('renders the mesh card with the SAME chrome as an integration card', () => {
        // The mesh is a peer, identified by its name — not by an accent border.
        // Its asymmetry is behavioural (routing, actions, no rename), not visual.
        const { card: mesh } = renderCard(makeModel({ id: 'mesh', isMesh: true, name: 'API Mesh' }));

        expect(mesh.className).toBe('integration-card');
    });

    // The face is name / status / foot for EVERY kind now. The source line moved
    // to the flyout: on the card it made non-mesh cards a row taller than the
    // mesh, so no two cards in the grid shared a baseline.
    it.each([
        ['an owner/repo identifier', { sourceLine: 'acme/erp-sync', sourceIsAi: false }],
        ['the blank-starter caption', { sourceLine: 'Blank starter — build it out', sourceIsAi: true }],
    ])('never renders the source line on the face (%s)', (_label, over) => {
        const { container } = renderCard(makeModel(over));

        expect(screen.queryByText(over.sourceLine)).not.toBeInTheDocument();
        expect(container.querySelector('.integration-card-src')).toBeNull();
    });

    it('marks an error status label with the error modifier', () => {
        renderCard(
            makeModel({
                status: 'error',
                statusLabel: 'Deploy failed',
                dotVariant: 'error',
            }),
        );

        expect(screen.getByText('Deploy failed')).toHaveClass('integration-card-status--error');
    });
    // The card had NO trigger for editing at all: both mutable things (display
    // name, API access) were reachable only by opening the detail flyout first.
    describe('overflow menu', () => {
        it('renders the menu items from model.menuActions', () => {
            renderCard(makeModel());

            expect(screen.getByRole('button', { name: 'Manage APIs' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        });

        it('routes a menu pick through onAction WITHOUT opening the drawer', () => {
            const { onAction, onOpen } = renderCard(makeModel());

            fireEvent.click(screen.getByRole('button', { name: 'Manage APIs' }));

            expect(onAction).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'erp-sync' }),
                'manage-apis'
            );
            expect(onOpen).not.toHaveBeenCalled();
        });

        it('renders NO menu when menuActions is empty (the mesh, and mid-deploy)', () => {
            renderCard(makeModel({ menuActions: [] }));

            expect(screen.queryByTestId('card-menu')).not.toBeInTheDocument();
        });
    });
});
