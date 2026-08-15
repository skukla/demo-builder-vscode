/**
 * IntegrationCard Tests (shared card — `core/ui/components/integrations`)
 *
 * The calm card face: name, status dot + label, and its kebab
 * (`model.menuActions`) carrying EVERY verb. A healthy card shows NO face button
 * — Open lives in the menu — so a visible one always means the card needs you.
 * The card is dumb: clicks open the host's detail via `onOpen(id)`, and every
 * affordance routes through `onAction(model, kind)` WITHOUT triggering `onOpen`.
 *
 * Moved here from `features/dashboard/…` when the WIZARD's Integrations area
 * became a second consumer (features must not import one another —
 * `reuse-first`). Every assertion below arrived with the file and is unchanged
 * apart from the import path: a behaviour-preserving move proves itself by not
 * moving its tests. The `subline` block is the one addition — the slot the wizard
 * needs, having no deploy status to show before the project is built.
 */

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { IntegrationCard } from '@/core/ui/components/integrations/IntegrationCard';
import type { IntegrationCardModel } from '@/core/ui/components/integrations/integrationCardModel.types';
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

function renderCard(model: IntegrationCardModel, subline?: React.ReactNode) {
    const onOpen = jest.fn();
    const onAction = jest.fn();
    const onRename = jest.fn();
    const view = render(
        <IntegrationCard
            model={model}
            onOpen={onOpen}
            onAction={onAction}
            onRename={onRename}
            subline={subline}
        />
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

    it('names itself by name and status', () => {
        const { card } = renderCard(makeModel());

        expect(card).toHaveAttribute('aria-label', 'ERP Sync, Deployed');
    });

    // A host with no status (the wizard) leaves `statusLabel` empty. Joining it
    // anyway announced "ERP Sync, " — a dangling comma naming half a thing. And
    // `aria-label` REPLACES the element's text, so the subline is not read as a
    // fallback; the name is all a screen reader gets, and it must be clean.
    it('names itself by name alone when there is no status', () => {
        const { card } = renderCard(
            makeModel({ statusLabel: '' }),
            <span>Custom integration · built with AI · 2 APIs</span>
        );

        expect(card).toHaveAttribute('aria-label', 'ERP Sync');
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
        // Mid-deploy the producers hand over an EMPTY menu — every verb would race
        // the runner. That empty list is what makes the card offer nothing, so the
        // model has to carry it here or the test proves nothing.
        //
        // This assertion used to query `.integration-card-foot`, a class no
        // component renders: it could not fail, in either direction.
        const { card } = renderCard(
            makeModel({
                status: 'deploying',
                statusLabel: 'Deploying…',
                dotVariant: 'info',
                menuActions: [],
            }),
        );

        // StatusDot is MOCKED here, so asserting the pulse class would test the
        // mock. The card's own responsibility is handing over the right variant;
        // that `info` pulses is StatusDot's contract, pinned in its suite.
        expect(screen.getByTestId('status-dot')).toHaveAttribute('data-variant', 'info');
        // The empty menu IS the whole "no affordance" claim. Not a blanket "no
        // buttons": the rename pencil sits on a separate axis (`canRename`, which
        // both producers compute from kind, never from status) and stays reachable
        // while a deploy runs. A blanket assertion failed on that pencil — the
        // assertion was wrong, not the card.
        expect(screen.queryByTestId('card-menu')).not.toBeInTheDocument();
        expect(
            within(card).queryByRole('button', { name: /deploy|redeploy|retry|remove/i })
        ).toBeNull();
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
        renderCard(makeModel(over));

        // Only the TEXT assertion is load-bearing. A companion check for a
        // `.integration-card-src` container was removed: no component renders that
        // class, so it passed no matter what the card did.
        expect(screen.queryByText(over.sourceLine)).not.toBeInTheDocument();
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

    // The card carries exactly ONE quiet line under the name. The dashboard fills
    // it with deploy status; the wizard has no deploy status to fill it with (it
    // runs before anything is built), so it passes its own content instead. An
    // explicit slot rather than "render status only when statusLabel is non-empty"
    // — that rule would make the dashboard's rendering depend on a string never
    // being empty, which nothing guarantees.
    describe('subline slot', () => {
        it('renders the subline in place of the status line', () => {
            renderCard(makeModel(), <span>Custom integration · built with AI · 2 APIs</span>);

            expect(
                screen.getByText('Custom integration · built with AI · 2 APIs')
            ).toBeInTheDocument();
        });

        it('suppresses the status dot and label while a subline is shown', () => {
            renderCard(makeModel(), <span>Pre-built · 1 API</span>);

            expect(screen.queryByTestId('status-dot')).not.toBeInTheDocument();
            expect(screen.queryByText('Deployed')).not.toBeInTheDocument();
        });

        it('falls back to the status line when no subline is given (dashboard default)', () => {
            renderCard(makeModel());

            expect(screen.getByTestId('status-dot')).toHaveAttribute('data-variant', 'success');
            expect(screen.getByText('Deployed')).toBeInTheDocument();
        });

        it('keeps the name and kebab regardless of which line is shown', () => {
            renderCard(makeModel(), <span>Pre-built · 1 API</span>);

            expect(screen.getByText('ERP Sync')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        });
    });

    // A host without a detail view has nothing for a card press to open. Claiming
    // `role="button"` and a tab stop anyway advertises an affordance that does
    // nothing — it reaches keyboard and screen-reader users first, who get a
    // focusable control that never responds. The wizard has exactly this case:
    // mesh and catalog rows have no editable detail before the build.
    describe('without onOpen', () => {
        function renderInert(model: IntegrationCardModel) {
            const onAction = jest.fn();
            const onRename = jest.fn();
            const view = render(
                <IntegrationCard
                    model={model}
                    onAction={onAction}
                    onRename={onRename}
                    subline={<span>Pre-built · 1 API</span>}
                />
            );
            return {
                onAction,
                card: view.container.querySelector('.integration-card') as HTMLElement,
            };
        }

        it('claims no button role', () => {
            const { card } = renderInert(makeModel());

            expect(card).not.toHaveAttribute('role');
        });

        it('takes no tab stop', () => {
            const { card } = renderInert(makeModel());

            expect(card).not.toHaveAttribute('tabindex');
        });

        it('still renders its name, subline and kebab', () => {
            renderInert(makeModel());

            expect(screen.getByText('ERP Sync')).toBeInTheDocument();
            expect(screen.getByText('Pre-built · 1 API')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
        });

        it('still routes menu picks to onAction', () => {
            const { onAction } = renderInert(makeModel());

            fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

            expect(onAction).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'erp-sync' }),
                'remove'
            );
        });
    });
});
