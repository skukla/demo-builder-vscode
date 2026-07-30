/**
 * IntegrationCard Tests (integrations grid — Step 4)
 *
 * The grid's calm card face: name, status dot + label, one source line, and
 * AT MOST ONE affordance from `model.faceAction`. The card is dumb — clicks
 * open the drawer via `onOpen(id)`, and every face affordance (attention
 * verbs AND the deployed Open↗ link) routes through `onAction(model, kind)`
 * WITHOUT triggering `onOpen` (stop-propagation containment span, the
 * InlineRenameField precedent).
 *
 * Strict TDD: written BEFORE the component exists.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntegrationCard } from '@/features/dashboard/ui/components/integrations/IntegrationCard';
import type { IntegrationCardModel } from '@/features/dashboard/ui/components/integrations/integrationCardModel';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => ({
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
        faceAction: { kind: 'open', url: 'https://example.com/app' },
        barActions: [],
        canRename: true,
        ...overrides,
    };
}

function renderCard(model: IntegrationCardModel) {
    const onOpen = jest.fn();
    const onAction = jest.fn();
    const view = render(<IntegrationCard model={model} onOpen={onOpen} onAction={onAction} />);
    const card = view.container.querySelector('.integration-card') as HTMLElement;
    return { onOpen, onAction, card };
}

describe('IntegrationCard', () => {
    it('renders name, dot variant, status label, and source line', () => {
        renderCard(makeModel());

        expect(screen.getByText('ERP Sync')).toBeInTheDocument();
        expect(screen.getByTestId('status-dot')).toHaveAttribute('data-variant', 'success');
        expect(screen.getByText('Deployed')).toBeInTheDocument();
        expect(screen.getByText('acme/erp-sync')).toBeInTheDocument();
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

    it('fires onAction for an attention face WITHOUT opening the drawer (containment pin)', () => {
        const model = makeModel({
            status: 'not-deployed',
            statusLabel: 'Not deployed',
            dotVariant: 'neutral',
            faceAction: { kind: 'deploy' },
        });
        const { onOpen, onAction } = renderCard(model);

        fireEvent.click(screen.getByRole('button', { name: 'Deploy' }));

        expect(onAction).toHaveBeenCalledWith(model, 'deploy');
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('renders the deployed Open face as a quiet link routing onAction(open) without onOpen', () => {
        const model = makeModel();
        const { onOpen, onAction } = renderCard(model);

        const link = screen.getByRole('link', { name: /open/i });
        fireEvent.click(link);

        expect(onAction).toHaveBeenCalledWith(model, 'open');
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('shows the pulsing dot and NO affordance while deploying', () => {
        const { card } = renderCard(
            makeModel({
                status: 'deploying',
                statusLabel: 'Deploying…',
                dotVariant: 'info',
                faceAction: undefined,
            }),
        );

        expect(screen.getByTestId('status-dot')).toHaveClass('integration-dot--deploying');
        expect(card.querySelector('.integration-card-foot button')).toBeNull();
        expect(card.querySelector('.integration-card-foot [role="link"]')).toBeNull();
    });

    it('does not pulse the dot outside deploying', () => {
        renderCard(makeModel());

        expect(screen.getByTestId('status-dot')).not.toHaveClass('integration-dot--deploying');
    });

    it('marks the mesh card with the accent modifier', () => {
        const { card } = renderCard(makeModel({ id: 'mesh', isMesh: true, name: 'API Mesh' }));

        expect(card).toHaveClass('integration-card--mesh');
    });

    it('omits the mesh modifier on integration cards', () => {
        const { card } = renderCard(makeModel());

        expect(card).not.toHaveClass('integration-card--mesh');
    });

    it('renders the AI source caption with the --ai modifier', () => {
        renderCard(makeModel({ sourceLine: 'Built with AI', sourceIsAi: true }));

        expect(screen.getByText('Built with AI')).toHaveClass('integration-card-src--ai');
    });

    it('marks an error status label with the error modifier', () => {
        renderCard(
            makeModel({
                status: 'error',
                statusLabel: 'Deploy failed',
                dotVariant: 'error',
                faceAction: { kind: 'retry' },
            }),
        );

        expect(screen.getByText('Deploy failed')).toHaveClass('integration-card-status--error');
    });
});
